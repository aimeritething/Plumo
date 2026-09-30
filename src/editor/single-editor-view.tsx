import { Component, useCallback, useEffect, useRef, type ReactNode } from 'react'
import type { useCreateBlockNote } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/shadcn'
import { trackEvent } from '@/lib/telemetry'
import { useDocumentThemeMode } from '@/shell/use-document-theme-mode'
import { useImageDrop, type ImageImportError } from './use-image-drop'
import { useImageLightbox } from './use-image-lightbox'
import type { AppLocale } from '@/lib/i18n'
import { observeNativeTextAssistanceDisabled } from '@/platform/native-text-assistance'
import type { VaultEntry } from '@/types'
import {
  imageDropTargetAt,
  insertImageBlocksAtDropTarget,
  type ImageDropTarget,
} from './editor-image-insertion'
import { ImageDropAffordance } from './image-drop-affordance'
import type { ClientPoint } from '@/platform/use-tauri-drag-drop-event'
import { useBlockNoteSideMenuHoverGuard } from '@/kernel/blocknote/block-note-side-menu-hover-guard'
import { useEditorLinkActivation } from '@/kernel/blocknote/use-editor-link-activation'
import { ImageLightbox } from './image-lightbox'
import { refreshCodeBlockSyntaxHighlighting } from '@/kernel/blocknote/editor-code-block-highlight-refresh'
import { subscribeRichEditorExternalChange } from '@/kernel/blocknote/editor-external-change-events'
import {
  activatePlainTextPasteTarget,
  registerPlainTextPasteTarget,
  type PlainTextPasteTarget,
} from './plain-text-paste'
import {
  blockNoteRenderRecoveryReason,
  isRecoverableBlockNoteRenderError,
  markRecoveredBlockNoteRenderError,
  type BlockNoteRenderRecoveryReason,
} from '@/kernel/blocknote/block-note-render-recovery'
import { repairEditorDocumentForRenderRecovery } from '@/kernel/blocknote/block-note-render-recovery-document'
import { useEditorPasteHandler } from '@/kernel/blocknote/title-heading-interactions'
import {
  type SuggestionAction,
  useSuggestionMenuItems,
} from '@/kernel/blocknote/use-slash-menu-items'
import {
  useEditorContainerClickHandler,
  useEditorWhitespaceMouseSelection,
} from '@/kernel/blocknote/single-editor-pointer-interactions'
import { useCompositionAwareEditorChange } from '@/kernel/blocknote/use-composition-aware-editor-change'
import { useSeedBlockNoteTableBridge } from '@/kernel/blocknote/use-seed-block-note-table-bridge'
import { EditorInteractionControllers } from './editor-interaction-controllers'
import { handleEditorCopy } from '@/kernel/blocknote/editor-copy-handlers'
import { CodeBlockCopyButton } from '@/kernel/blocknote/code-block-copy-controls'
import { blockNoteShadCNComponents } from '@/kernel/blocknote/shadcn-components'
import { useCodeBlockCopyTarget } from '@/kernel/blocknote/use-code-block-copy-target'

const TOOLBAR_MOUSE_DOWN_ALLOW_SELECTOR = [
  '[role="menu"]',
  '[role="dialog"]',
  'button[aria-haspopup]',
  'input',
  'textarea',
  '[contenteditable="true"]',
].join(', ')
const MAX_BLOCKNOTE_RENDER_RECOVERY_RETRIES = 1

type BlockNoteRenderRecoveryState = {
  error: unknown
  recoveryKey: number
  retries: number
}

class BlockNoteRenderRecoveryBoundary extends Component<
  {
  children: (recoveryKey: number) => ReactNode
  onRecover?: (attempt: number, reason: BlockNoteRenderRecoveryReason) => void
  },
  BlockNoteRenderRecoveryState
> {
  state: BlockNoteRenderRecoveryState = {
    error: null,
    recoveryKey: 0,
    retries: 0,
  }

  static getDerivedStateFromError(error: unknown): Partial<BlockNoteRenderRecoveryState> {
    markRecoveredBlockNoteRenderError(error)
    return { error }
  }

  componentDidCatch(error: unknown) {
    const reason = blockNoteRenderRecoveryReason(error)
    if (!reason) return
    if (this.state.retries >= MAX_BLOCKNOTE_RENDER_RECOVERY_RETRIES) return

    const attempt = this.state.retries + 1
    trackEvent('editor_render_recovered', { reason, attempt })
    this.props.onRecover?.(attempt, reason)
    this.setState(({ recoveryKey, retries }) => ({
      error: null,
      recoveryKey: recoveryKey + 1,
      retries: retries + 1,
    }))
  }

  render() {
    if (this.state.error) {
      if (!isRecoverableBlockNoteRenderError(this.state.error)) {
        throw this.state.error
      }

      return null
    }

    return this.props.children(this.state.recoveryKey)
  }
}

function isEditorReadyForSuggestionAction(
  editor: ReturnType<typeof useCreateBlockNote>,
  container: HTMLElement | null,
) {
  if (!container?.isConnected) return false

  const editorElement = editor.domElement
  if (!(editorElement instanceof HTMLElement)) return true

  return editorElement.isConnected
}

function runSuggestionActionSafely({
  action,
  container,
  editor,
}: {
  action: SuggestionAction
  container: HTMLElement | null
  editor: ReturnType<typeof useCreateBlockNote>
}) {
  if (!isEditorReadyForSuggestionAction(editor, container)) return

  try {
    action()
  } catch (error) {
    console.warn('[editor] Ignored stale suggestion menu action:', error)
  }
}

function shouldAllowToolbarMouseDown(target: HTMLElement) {
  return Boolean(target.closest(TOOLBAR_MOUSE_DOWN_ALLOW_SELECTOR))
}

function handleToolbarMouseDownCapture(event: Pick<React.MouseEvent<HTMLElement>, 'target' | 'preventDefault'>) {
  if (!(event.target instanceof HTMLElement) || shouldAllowToolbarMouseDown(event.target)) {
    return
  }

  event.preventDefault()
}

/** Where a dropped image goes (the block under the pointer), and putting it there once it is an Attachment. */
function useImageDropInsertion(editor: ReturnType<typeof useCreateBlockNote>) {
  const editorRef = useRef(editor)
  useEffect(() => {
    editorRef.current = editor
  }, [editor])
  const dropTargetAt = useCallback((point: ClientPoint) => imageDropTargetAt(editorRef.current, point), [])
  const onImagesDropped = useCallback((urls: string[], target: ImageDropTarget) => {
    insertImageBlocksAtDropTarget(editorRef.current, urls, target)
  }, [])
  return { dropTargetAt, onImagesDropped }
}

function useRichEditorPlainTextPasteTarget(options: {
  containerRef: React.RefObject<HTMLDivElement | null>
  editable: boolean
  editor: ReturnType<typeof useCreateBlockNote>
  runEditorAction: (action: SuggestionAction) => void
}) {
  const { containerRef, editable, editor, runEditorAction } = options
  const targetRef = useRef<PlainTextPasteTarget | null>(null)

  useEffect(() => {
    const target: PlainTextPasteTarget = {
      surface: 'rich_editor',
      contains: (element) => Boolean(element && containerRef.current?.contains(element)),
      isConnected: () => containerRef.current?.isConnected === true,
      insert: (text) => {
        if (!editable) return false

        let inserted = false
        runEditorAction(() => {
          editor.focus()
          editor.insertInlineContent(text, { updateSelection: true })
          inserted = true
        })
        return inserted
      },
    }
    targetRef.current = target
    const unregister = registerPlainTextPasteTarget(target)

    return () => {
      unregister()
      if (targetRef.current === target) {
        targetRef.current = null
      }
    }
  }, [containerRef, editable, editor, runEditorAction])

  return useCallback(() => {
    if (targetRef.current) {
      activatePlainTextPasteTarget(targetRef.current)
    }
  }, [])
}

/** Single BlockNote editor view — content is swapped via replaceBlocks */
export function SingleEditorView(options: {
  editor: ReturnType<typeof useCreateBlockNote>
  onNavigateWikilink: (target: string) => void
  onChange?: () => void
  onImageImportError?: (error: ImageImportError) => void
  sourceEntry?: VaultEntry | null
  attachmentVaultPath?: string
  vaultPath?: string
  editable?: boolean
  locale?: AppLocale
}) {
  const { editor, onNavigateWikilink, onChange, onImageImportError, sourceEntry, vaultPath, attachmentVaultPath, editable = true, locale = 'en' } = options
  const themeMode = useDocumentThemeMode()
  const previousThemeModeRef = useRef(themeMode)
  const containerRef = useRef<HTMLDivElement>(null)
  const suppressNextContainerClickRef = useRef(false)
  const pressTargetRef = useRef<EventTarget | null>(null)
  const handleContainerClick = useEditorContainerClickHandler({
    editable,
    editor,
    pressTargetRef,
    suppressNextContainerClickRef,
    vaultPath,
  })
  const handleWhitespaceMouseSelection = useEditorWhitespaceMouseSelection({
    containerRef,
    editable,
    editor,
    suppressNextContainerClickRef,
  })
  const handleEditorChange = useCompositionAwareEditorChange({
    containerRef,
    onChange,
  })
  const { dropTargetAt, onImagesDropped } = useImageDropInsertion(editor)
  const { isDragOver } = useImageDrop({
    containerRef,
    dropTargetAt,
    onImageImportError,
    onImagesDropped,
    vaultPath: attachmentVaultPath ?? vaultPath,
  })
  const lightbox = useImageLightbox({ containerRef })
  const {
    clearCopyTarget,
    copyTarget,
    handleFocus: handleCodeBlockCopyFocus,
    handleMouseMove: handleCodeBlockCopyMouseMove,
  } = useCodeBlockCopyTarget(containerRef)
  useBlockNoteSideMenuHoverGuard(containerRef)
  const openLink = useEditorLinkActivation(
    containerRef,
    onNavigateWikilink,
    vaultPath,
    sourceEntry?.path,
  )

  useEffect(() => {
    if (previousThemeModeRef.current === themeMode) return

    previousThemeModeRef.current = themeMode
    refreshCodeBlockSyntaxHighlighting(editor)
  }, [editor, themeMode])

  useEffect(() => {
    return subscribeRichEditorExternalChange(editor, handleEditorChange)
  }, [editor, handleEditorChange])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    return observeNativeTextAssistanceDisabled(container)
  }, [])

  useSeedBlockNoteTableBridge(editor)

  const runEditorAction = useCallback(
    (action: SuggestionAction) => {
    runSuggestionActionSafely({
      action,
      container: containerRef.current,
      editor,
    })
    },
    [editor],
  )
  const activatePlainTextPaste = useRichEditorPlainTextPasteTarget({
    containerRef,
    editable,
    editor,
    runEditorAction,
  })
  const handlePasteCapture = useEditorPasteHandler({
    editable,
    editor,
    runEditorAction,
  })
  const handleFocusCapture = useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
    activatePlainTextPaste()
    handleCodeBlockCopyFocus(event)
    },
    [activatePlainTextPaste, handleCodeBlockCopyFocus],
  )
  const handleMouseDownCapture = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button === 0) pressTargetRef.current = event.target
    activatePlainTextPaste()
    handleWhitespaceMouseSelection(event)
    },
    [activatePlainTextPaste, handleWhitespaceMouseSelection],
  )
  const handleCopyCapture = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => {
    handleEditorCopy(event, editor)
    },
    [editor],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const handleClick = (event: MouseEvent) => {
      handleContainerClick(event as unknown as React.MouseEvent<HTMLDivElement>)
    }
    container.addEventListener('click', handleClick)
    return () => container.removeEventListener('click', handleClick)
  }, [handleContainerClick])

  const suggestionMenuItems = useSuggestionMenuItems({
    editor,
    locale,
    runEditorAction,
  })

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Rich text editor"
      // The `editor__blocknote-container` name is the Kernel's hook (EDITOR_CONTAINER_SELECTOR); the look is the utilities.
      className="editor__blocknote-container relative flex min-h-0 flex-1 cursor-text data-drag-over:outline-2 data-drag-over:outline-dashed data-drag-over:-outline-offset-2 data-drag-over:outline-accent-base"
      data-drag-over={isDragOver || undefined}
      onCopyCapture={handleCopyCapture}
      onFocusCapture={handleFocusCapture}
      onMouseLeave={clearCopyTarget}
      onMouseDownCapture={handleMouseDownCapture}
      onMouseMove={handleCodeBlockCopyMouseMove}
      onPasteCapture={handlePasteCapture}
    >
      {isDragOver && <ImageDropAffordance />}
      <BlockNoteRenderRecoveryBoundary onRecover={(_, reason) => repairEditorDocumentForRenderRecovery(editor, reason)}>
        {(recoveryKey) => (
          <BlockNoteView
            key={recoveryKey}
            editor={editor}
            shadCNComponents={blockNoteShadCNComponents}
            theme={themeMode}
            onChange={handleEditorChange}
            editable={editable}
            emojiPicker={false}
            formattingToolbar={false}
            linkToolbar={false}
            slashMenu={false}
            sideMenu={false}
            filePanel={false}
            tableHandles={false}
          >
            <EditorInteractionControllers
              {...suggestionMenuItems}
              locale={locale}
              onOpenLink={openLink}
              onToolbarMouseDown={handleToolbarMouseDownCapture}
              runEditorAction={runEditorAction}
              vaultPath={vaultPath}
            />
          </BlockNoteView>
        )}
      </BlockNoteRenderRecoveryBoundary>
      {copyTarget && <CodeBlockCopyButton copyTarget={copyTarget} locale={locale} />}
      <ImageLightbox image={lightbox.image} locale={locale} onClose={lightbox.close} />
    </div>
  )
}

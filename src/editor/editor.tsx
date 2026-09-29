import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from 'react'
import { useCreateBlockNote } from '@blocknote/react'
import { useEditorTabSwap } from '@/kernel/resolve/use-editor-tab-swap'
import { useEditorFocus } from './use-editor-focus'
import { useRegisteredRef } from './use-registered-ref'
import type { EditorHistory } from './editor-history'
import { RUNTIME_STYLE_NONCE } from '@/platform/runtime-style-nonce'
import type { EditorMode, Tab } from '@/types'
import type { ThemeMode } from '@/shell/theme-mode'
import type { ListedFile } from '@/folder/explorer'
import { documentFrontmatter } from '@/kernel/markdown/frontmatter-status'
import { activeTabPaths, imageFetchVersion, imageMetadataLabel, type ImageNaturalSize } from '@/tabs/image-file'
import { noteRootForPath } from '@/folder/note-entry'
import { notePathFilename } from '@/lib/note-path-identity'
import { installRichEditorMarkdownSerializer } from '@/kernel/markdown/rich-editor-markdown'
import type { WriteFailure, WriteFailureAction } from './use-write-failures'
import { useRegisterEditorContentFlushes } from './editor-content-flush-registration'
import { applyPendingRawExitContent, resolvePendingRawExitContent, resolveRawModeContent } from './editor-raw-mode-sync'
import { uploadEditorImage } from './editor-image-upload'
import { schema } from '@/kernel/blocknote/editor-schema'
import { createImeCompositionKeyGuardExtension } from '@/kernel/blocknote/ime-composition-key-guard-extension'
import { createMarkdownHighlightShortcutExtension } from '@/kernel/blocknote/markdown-highlight-shortcut-extension'
import { EmptyEditor } from './empty-editor'
import { ImageView } from './image-view'
import { DocumentTabActions, ImageTabActions, type DocumentMenuActions, type TabMode } from './tab-actions'
import { RawEditorView } from './raw-editor-view'
import type { RawEditorFindRequest } from './raw-editor-find-types'
import { RichEditorFindBar } from './rich-editor-find-bar'
import { createRichEditorFindExtension } from '@/kernel/blocknote/rich-editor-find'
import { EditorToaster } from './editor-toaster'
import { showImageImportErrorToast } from './toasts'
import { TabBar } from '@/tabs/tab-bar'
import { RICH_EDITOR_BLOCKNOTE_OPTIONS } from '@/kernel/blocknote/rich-editor-block-note-options'
import { createRichEditorBlockSelectionExtension } from '@/kernel/blocknote/rich-editor-block-selection-extension'
import { duplicateSelectedBlocks } from '@/kernel/blocknote/rich-editor-duplicate-blocks'
import type { RichEditor } from '@/kernel/blocknote/block-note-dom'
import { createRichEditorCodeBlockArrowNavigationExtension } from '@/kernel/blocknote/rich-editor-code-block-arrow-navigation-extension'
import { createRichEditorCodeBlockShortcutExtension } from '@/kernel/blocknote/rich-editor-code-block-shortcut-extension'
import { createRichEditorCodeBlockTabExtension } from '@/kernel/blocknote/rich-editor-code-block-tab-extension'
import { createRichEditorCollapsedSectionKeysExtension } from '@/kernel/blocknote/rich-editor-collapsed-section-keys-extension'
import { installRichEditorDispatchPerformanceProbe } from '@/kernel/blocknote/rich-editor-dispatch-performance'
import { createRichEditorEmptyListNavigationExtension } from '@/kernel/blocknote/rich-editor-empty-list-navigation-extension'
import { createRichEditorMarkdownInputTransformExtension } from '@/kernel/blocknote/rich-editor-input-transform-extension'
import { createRichEditorListTabExtension } from '@/kernel/blocknote/rich-editor-list-tab-extension'
import { createRichEditorPasteHandler } from '@/kernel/blocknote/rich-editor-paste'
import { createRichEditorTextDirectionExtension } from '@/kernel/blocknote/rich-editor-text-direction'
import { createRichEditorTransformErrorRecoveryExtension } from '@/kernel/blocknote/rich-editor-transform-error-recovery-extension'
import { SingleEditorView } from './single-editor-view'
import { createTodoBlockShortcutExtension } from '@/kernel/blocknote/todo-block-shortcut-extension'
import { useRawModeWithFlush } from './use-raw-mode-with-flush'
import { useRawEditorSnapshots } from './use-raw-editor-snapshots'
import { useEditorFindSession } from './editor-find-session'
import { WriteFailureBar } from './write-failure-bar'

/**
 * Plumo's editor shell (rewritten, not copied). It creates the
 * BlockNote editor with the kernel's schema and extensions, hands the open
 * Document to the kernel's tab-swap machinery, and lays out the editor pane
 * around it: the tab bar, the error bar, the surface. Everything it mounts
 * comes from the kernel.
 */

const RICH_EDITOR_BIDI_DOM_ATTRIBUTES = {
  blockContent: { dir: 'auto' },
  inlineContent: { dir: 'auto' },
}

const NO_WIKILINK_NAVIGATION = () => {}
const noop = () => {}
/** ⌘S in CodeMirror is the app's fileSave, which the window keydown already dispatches. */
const RAW_SAVE_HANDLED_BY_APP = () => {}
const RICH_UNAVAILABLE_REASON = 'Fix the frontmatter to use Rich mode'

type FlushPendingContentRef = MutableRefObject<((path: string) => void) | null>

/**
 * The editor pane: the right of the window's two panes, the editor's white
 * ground reaching the window's edges with no margin, radius or shadow. The
 * sidebar's line divides the two; collapsed, nothing is left of it and the
 * pane takes the window, its tab bar seating the traffic lights.
 */
const PANE_CLASS = 'relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-surface-card'
/**
 * The scroll context around the Rich surface, the find bar sticky at its top.
 * `overflow-anchor` is off so a side menu appearing near the viewport edge
 * does not shift a long Document; the `editor-scroll-area` name is what the
 * Kernel's side menu and the mode-position sync select on.
 */
const RICH_SCROLL_AREA_CLASS = 'editor-scroll-area flex min-h-0 flex-1 flex-col overflow-y-auto [overflow-anchor:none]'
/** Raw mode: CodeMirror scrolls itself below the carried find bar, so the scope clips instead. */
const RAW_SCOPE_CLASS = 'editor-scroll-area flex min-h-0 flex-1 flex-col overflow-hidden'

export interface EditorProps {
  tabs: Tab[]
  activeTabPath: string | null
  /** The active Image Tab's row in the Folder listing: its byte size, and the version its picture is fetched at. */
  imageFile?: ListedFile | null
  /** The boundary root of the active Document: its Folder, or its own directory. */
  vaultPath?: string
  folder?: string | null
  hasPendingEditorContentRef?: MutableRefObject<((path: string) => boolean) | null>
  /** Receives the serialized Markdown after the rich editor's idle debounce. */
  onContentChange?: (path: string, content: string) => void
  /** Receives the Raw editor's bytes after its own idle debounce, and on every flush. */
  onRawContentChange?: (path: string, content: string) => void
  /** Registers a flush of the rich editor's pending edits, so ⌘S saves the latest keystrokes. */
  flushPendingEditorContentRef?: FlushPendingContentRef
  /** Registers the same for the Raw editor's keystrokes. */
  flushPendingRawContentRef?: FlushPendingContentRef
  /** Toggle Rich/Raw (⌘\, View menu): the editor registers the switch here, since only it can map the caret. */
  rawToggleRef?: MutableRefObject<(() => void) | null>
  /** Find in the current Document (⌘F, Edit menu): the editor registers the request here and opens the bar of whichever surface is showing. */
  findRef?: MutableRefObject<(() => void) | null>
  /** Undo and Redo (⌘Z, ⌘⇧Z, the Edit menu, the Command Menu), on whichever surface is showing. */
  historyRef?: MutableRefObject<EditorHistory | null>
  /** Duplicate Block (⌘D, the Edit menu, the Command Menu): registered in Rich mode only, Raw mode having no Blocks. */
  duplicateBlockRef?: MutableRefObject<(() => void) | null>
  /** Puts a Document Tab in Rich or Raw mode; the Tab rules decide whether it takes. */
  onSetTabMode: (path: string, mode: EditorMode) => void
  /** The tab bar's clicks. */
  onActivateTab: (path: string) => void
  onCloseTab: (path: string) => void
  /** The tab bar's "+": New Document, ⌘N. Left out with no Folder open, which leaves no "+". */
  onNewDocument?: () => void
  /** The active Tab's File-menu commands, which the tab bar's "…" and an Image Tab's Open ↗ run too. */
  tabCommands?: TabCommands
  /** The active Document's refused write, if its last write failed; the error bar's reason to exist. */
  writeFailure: WriteFailure | null
  /** The error bar's Retry or Discard changes while it is in flight. */
  writeFailurePending?: WriteFailureAction | null
  onRetryWrite: (path: string) => void
  onDiscardWrite: (path: string) => void
  /** Copy path (⌘⇧,), the same handler the app command runs; the tab bar's link button calls it. */
  onCopyPath?: () => void
  /** The View → Appearance choice, which the toasts at the pane's bottom-right follow. */
  themeMode: ThemeMode
  /** Collapsed, the pane's tab bar leaves the traffic lights and the sidebar icon their room. */
  sidebarCollapsed: boolean
}

/** The File menu's commands on the active Tab's file; one left out is greyed in the "…" menu. */
export interface TabCommands {
  pinned?: boolean
  onTogglePin?: () => void
  onDuplicate?: () => void
  onRevealInFinder?: () => void
  onOpenInDefaultApp?: () => void
}

function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}

function useRichEditor(options: { activeTabPath: string | null; vaultPath?: string }) {
  const vaultPathRef = useLatestRef(options.vaultPath)
  const activeTabPathRef = useLatestRef(options.activeTabPath)

  const editor = useCreateBlockNote({
    ...RICH_EDITOR_BLOCKNOTE_OPTIONS,
    schema,
    domAttributes: RICH_EDITOR_BIDI_DOM_ATTRIBUTES,
    // A pasted image lands in `attachments/` beside the Document; the block
    // holds its asset URL, which Autosave writes back as a relative path. One
    // that does not land says why in a toast.
    uploadFile: (file: File) => uploadEditorImage(
      file,
      activeTabPathRef.current ? noteRootForPath(activeTabPathRef.current) : vaultPathRef.current,
      showImageImportErrorToast,
    ),
    pasteHandler: createRichEditorPasteHandler(),
    tabBehavior: 'prefer-indent',
    _tiptapOptions: { ...RICH_EDITOR_BLOCKNOTE_OPTIONS._tiptapOptions, injectNonce: RUNTIME_STYLE_NONCE },
    extensions: [
      createRichEditorTransformErrorRecoveryExtension(),
      createImeCompositionKeyGuardExtension(),
      createRichEditorCodeBlockArrowNavigationExtension(),
      createRichEditorEmptyListNavigationExtension(),
      createRichEditorCollapsedSectionKeysExtension(),
      createRichEditorCodeBlockTabExtension(),
      createRichEditorListTabExtension(),
      createRichEditorCodeBlockShortcutExtension(),
      createMarkdownHighlightShortcutExtension(),
      createTodoBlockShortcutExtension(),
      createRichEditorMarkdownInputTransformExtension(),
      createRichEditorTextDirectionExtension(),
      createRichEditorBlockSelectionExtension(),
      createRichEditorFindExtension(),
    ],
  })
  installRichEditorMarkdownSerializer(editor)
  useEffect(() => {
    installRichEditorDispatchPerformanceProbe(editor, () => activeTabPathRef.current)
  }, [activeTabPathRef, editor])

  return editor
}

/** Registers a callback into an optional ref for as long as it is current. */
/**
 * Rich/Raw switching: the kernel's hook
 * serializes the rich editor into the raw buffer on the way in, maps the
 * caret both ways, and remembers raw edits the Tab state has not caught up
 * with on the way out. Plumo's deviation is where the mode lives: the active
 * Tab's `mode`, set through the Tab rules, so two Tabs can differ and the
 * Session restores each. A Document whose Frontmatter is invalid cannot
 * leave Raw; the toggle is a no-op there and the Rich segment says why.
 */
function useRawModeRuntime(options: {
  editor: ReturnType<typeof useRichEditor>
  tabs: Tab[]
  activeTab: Tab | null
  activeTabPath: string | null
  vaultPath?: string
  onRawContentChange?: (path: string, content: string) => void
  onSetTabMode: (path: string, mode: EditorMode) => void
  flushPendingEditorChangeRef: MutableRefObject<(() => boolean) | null>
}) {
  const { editor, tabs, activeTab, activeTabPath, vaultPath, onRawContentChange, onSetTabMode, flushPendingEditorChangeRef } = options
  const tabModeState = useMemo(() => ({ mode: activeTab?.mode ?? null, setMode: onSetTabMode }), [activeTab?.mode, onSetTabMode])
  const {
    rawMode,
    handleToggleRaw,
    rawLatestContentRef,
    pendingRawExitContent,
    setPendingRawExitContent,
    rawModeContentOverride,
  } = useRawModeWithFlush(editor, activeTabPath, activeTab?.content ?? null, onRawContentChange, vaultPath, flushPendingEditorChangeRef, tabModeState)

  // Raw edits are handed to the rich editor's swap before the Tab state has
  // them; once it does, the hand-over is cleared (derived, not effected).
  const resolvedExit = resolvePendingRawExitContent({ activeTabPath, tabs, pendingRawExitContent })
  if (resolvedExit !== pendingRawExitContent) setPendingRawExitContent(resolvedExit)
  const tabsForEditorSwap = useMemo(() => applyPendingRawExitContent(tabs, resolvedExit), [resolvedExit, tabs])
  const rawModeContent = resolveRawModeContent({ activeTab, rawModeContentOverride })

  const richUnavailable = useMemo(() => documentFrontmatter(activeTab?.content ?? '').kind === 'invalid', [activeTab?.content])
  const toggleRaw = useCallback(() => {
    if (rawMode && richUnavailable) return
    void handleToggleRaw()
  }, [handleToggleRaw, rawMode, richUnavailable])

  const tabMode = useMemo<TabMode>(() => ({
    value: rawMode ? 'raw' : 'rich',
    onChange: (mode) => {
      if ((mode === 'raw') !== rawMode) toggleRaw()
    },
    richDisabledReason: richUnavailable ? RICH_UNAVAILABLE_REASON : null,
  }), [rawMode, richUnavailable, toggleRaw])

  return { rawMode, toggleRaw, rawLatestContentRef, rawModeContent, tabsForEditorSwap, tabMode }
}

/**
 * An Image Tab has no editor under it, so the kernel is told there is no
 * active Document: the swap machinery blanks rather than trying to parse a
 * picture, and nothing registers a flush for a Tab that is never written.
 */
function useEditorRuntime(props: EditorProps) {
  const { tabs, vaultPath, onContentChange, onRawContentChange, onSetTabMode, flushPendingEditorContentRef, flushPendingRawContentRef, hasPendingEditorContentRef } = props
  const { documentPath: activeTabPath, imagePath: imageTabPath } = activeTabPaths(props.activeTabPath)
  const editor = useRichEditor({ activeTabPath, vaultPath })
  const activeTab = tabs.find((tab) => tab.entry.path === activeTabPath) ?? null
  const flushPendingEditorChangeRef = useRef<(() => boolean) | null>(null)
  const raw = useRawModeRuntime({ editor, tabs, activeTab, activeTabPath, vaultPath, onRawContentChange, onSetTabMode, flushPendingEditorChangeRef })
  const { handleEditorChange, flushPendingEditorChange, hasPendingEditorChange, editorMountedRef } = useEditorTabSwap({
    tabs: raw.tabsForEditorSwap,
    activeTabPath,
    editor,
    onContentChange,
    rawMode: raw.rawMode,
    vaultPath,
  })
  useRegisteredRef(flushPendingEditorChangeRef, flushPendingEditorChange)
  const { rawMode, rawLatestContentRef } = raw
  const activeTabContent = activeTab?.content ?? null
  // Whether the active Document has keystrokes its Tab does not hold yet, on whichever surface is showing.
  const hasPendingEditorContent = useCallback((path: string) => {
    if (path !== activeTabPath) return false
    if (rawMode) return rawLatestContentRef.current !== null && rawLatestContentRef.current !== activeTabContent
    return hasPendingEditorChange()
  }, [activeTabContent, activeTabPath, hasPendingEditorChange, rawLatestContentRef, rawMode])
  useRegisteredRef(hasPendingEditorContentRef, hasPendingEditorContent)
  useEditorFocus(editor, editorMountedRef)
  useRegisteredRef(props.rawToggleRef, raw.toggleRaw)
  const { request: findRequest, requestFind } = useFindRequests(activeTabPath, raw.rawMode, props.findRef)
  const find = useEditorFindSession(activeTabPath)
  // Rich mode's history is BlockNote's; Raw mode's is CodeMirror's, registered by the raw view while it is mounted.
  const richHistory = useMemo<EditorHistory>(() => ({ undo: () => { editor.undo() }, redo: () => { editor.redo() } }), [editor])
  useRegisteredRef(rawMode ? undefined : props.historyRef, richHistory)
  const duplicateBlock = useCallback(() => { duplicateSelectedBlocks(editor as unknown as RichEditor) }, [editor])
  useRegisteredRef(rawMode ? undefined : props.duplicateBlockRef, duplicateBlock)

  const rawSnapshots = useRawEditorSnapshots(tabs, activeTabPath, rawMode)

  useRegisterEditorContentFlushes({
    activeTab,
    flushPendingEditorChange,
    flushPendingEditorContentRef,
    rawLatestContentRef,
    rawMode,
    onContentChange: onRawContentChange,
    flushPendingRawContentRef,
  })

  return { editor, activeTab, handleEditorChange, imageTabPath, raw, rawSnapshots, find, findRequest, requestFind }
}

/**
 * ⌘F and Edit → Find ask for the find bar through the registered ref; each
 * ask is a fresh request for the active Document, so a bar that is already
 * open refocuses its input and a closed one opens. Raw mode's carried bar and
 * the Rich bar both read the same request. A request belongs to the surface
 * it was made on (this Tab, in this mode): switching Tab or mode drops it, so
 * a bar that mounts later does not reopen on a stale ask, nor take the focus.
 * Whether the bar stays open across a mode switch is the find session's.
 */
function useFindRequests(
  activeTabPath: string | null,
  rawMode: boolean,
  findRef: MutableRefObject<(() => void) | null> | undefined,
): { request: RawEditorFindRequest | null; requestFind: () => void } {
  const surface = `${activeTabPath ?? ''}\n${rawMode ? 'raw' : 'rich'}`
  const [request, setRequest] = useState<{ surface: string; value: RawEditorFindRequest } | null>(null)
  const sequence = useRef(0)
  const requestFind = useCallback(() => {
    if (!activeTabPath) return
    sequence.current += 1
    setRequest({ surface, value: { id: sequence.current, path: activeTabPath, replace: false } })
  }, [activeTabPath, surface])
  useRegisteredRef(findRef, requestFind)
  // Dropped, not only hidden: coming back to the same surface must not revive it.
  if (request !== null && request.surface !== surface) setRequest(null)
  return { request: request !== null && request.surface === surface ? request.value : null, requestFind }
}

/**
 * The picture's natural size, which the tab bar's `1920 × 1080` half comes
 * from. There is none until the image has loaded, and none again the moment
 * the Tab or the file behind it changes — which is what `shownPicture`, the
 * path and fetch version together, identifies.
 */
function useImageNaturalSize(shownPicture: string) {
  const [naturalSize, setNaturalSize] = useState<ImageNaturalSize | null>(null)
  const [shown, setShown] = useState(shownPicture)
  if (shown !== shownPicture) {
    setShown(shownPicture)
    setNaturalSize(null)
  }
  return { naturalSize, setNaturalSize }
}

function EditorFindScope({
  children,
  className,
  style,
}: {
  children: ReactNode
  className?: string
  style?: React.CSSProperties
}) {
  return (
    <div
      className={className}
      data-editor-find-scope="true"
      style={style}
    >
      {children}
    </div>
  )
}

/**
 * An Image Tab's picture, and the tab bar's controls for it. The Folder
 * listing is where the byte size comes from and what says the file has
 * changed on disk, so a picture overwritten in another app is fetched again
 * the moment the watcher refreshes the Folder. There is no save state, no
 * Rich/Raw and no error bar: an Image Tab is never written.
 */
function useImageTab({ path, imageFile, reloads, onOpenExternal, onCopyPath }: {
  path: string | null
  imageFile?: ListedFile | null
  reloads: number
  onOpenExternal: () => void
  onCopyPath?: () => void
}) {
  const fileSize = imageFile?.fileSize ?? 0
  const version = imageFetchVersion(imageFile ?? null, reloads)
  const { naturalSize, setNaturalSize } = useImageNaturalSize(`${path ?? ''}@${version}`)
  if (path === null) return null
  const filename = notePathFilename(path)
  return {
    actions: <ImageTabActions metadata={imageMetadataLabel(naturalSize, fileSize)} onOpenExternal={onOpenExternal} onCopyPath={onCopyPath} />,
    body: (
      <div className="flex min-h-0 min-w-0 flex-1">
        <ImageView
          path={path}
          filename={filename}
          version={version}
          onNaturalSize={setNaturalSize}
          onOpenExternal={onOpenExternal}
        />
      </div>
    ),
  }
}

export const Editor = memo(function Editor(props: EditorProps) {
  const { editor, activeTab, handleEditorChange, imageTabPath, raw, rawSnapshots, find, findRequest, requestFind } = useEditorRuntime(props)
  const {
    tabs, activeTabPath, vaultPath, onActivateTab, onCloseTab, writeFailure, onRetryWrite, onDiscardWrite,
    sidebarCollapsed, tabCommands,
  } = props
  const openTab = tabs.find((tab) => tab.entry.path === activeTabPath) ?? null
  const imageTab = useImageTab({
    path: imageTabPath,
    imageFile: props.imageFile,
    reloads: openTab?.reloads ?? 0,
    onOpenExternal: tabCommands?.onOpenInDefaultApp ?? noop,
    onCopyPath: props.onCopyPath,
  })
  const activeDocumentPath = activeTab?.entry.path ?? null
  const documentMenu = useMemo<DocumentMenuActions>(() => ({
    ...tabCommands,
    onFind: requestFind,
    onCloseTab: activeDocumentPath ? () => onCloseTab(activeDocumentPath) : undefined,
  }), [activeDocumentPath, onCloseTab, requestFind, tabCommands])

  if (!openTab) {
    return (
      <div className={PANE_CLASS} data-testid="editor-pane">
        <EditorToaster theme={props.themeMode} />
        <EmptyEditor hasFolder={Boolean(props.folder)} />
      </div>
    )
  }

  const actions = imageTab?.actions ?? (activeTab && (
    <DocumentTabActions mode={raw.tabMode} onCopyPath={props.onCopyPath} menu={documentMenu} />
  ))

  return (
    <div className={PANE_CLASS} data-testid="editor-pane">
      {/* First in both of the pane's shapes, so closing the last Tab keeps the toaster and its toasts mounted. */}
      <EditorToaster theme={props.themeMode} />
      <TabBar
        tabs={tabs}
        activeTabPath={activeTabPath}
        onActivate={onActivateTab}
        onClose={onCloseTab}
        onNewDocument={props.onNewDocument}
        actions={actions}
        sidebarCollapsed={sidebarCollapsed}
      />
      {/* The two bodies are exclusive: an Image Tab leaves the runtime with no active Document. */}
      {imageTab?.body}
      {activeTab && (
        <>
          {/* Straight under the tab bar, above whichever surface is showing. */}
          {writeFailure && (
            <WriteFailureBar
              path={writeFailure.path}
              message={writeFailure.message}
              failedAgainAt={writeFailure.failedAgainAt}
              pending={props.writeFailurePending}
              onRetry={() => onRetryWrite(writeFailure.path)}
              onDiscard={() => onDiscardWrite(writeFailure.path)}
            />
          )}
          {/* The two surfaces are exclusive: Raw mode shows the exact bytes in CodeMirror and BlockNote is not mounted. */}
          {raw.rawMode ? (
            <EditorFindScope className={RAW_SCOPE_CLASS}>
              <RawEditorView
                key={activeTab.entry.path}
                content={raw.rawModeContent ?? activeTab.content}
                path={activeTab.entry.path}
                onContentChange={props.onRawContentChange ?? noop}
                onSave={RAW_SAVE_HANDLED_BY_APP}
                latestContentRef={raw.rawLatestContentRef}
                findRequest={findRequest}
                find={find}
                historyRef={props.historyRef}
                snapshots={rawSnapshots}
                vaultPath={vaultPath}
                attachmentVaultPath={noteRootForPath(activeTab.entry.path)}
                onImageImportError={showImageImportErrorToast}
              />
            </EditorFindScope>
          ) : (
            <EditorFindScope className={RICH_SCROLL_AREA_CLASS}>
              <RichEditorFindBar key={activeTab.entry.path} editor={editor} path={activeTab.entry.path} request={findRequest} find={find} />
              {/* The prose column: the Kernel's .bn-editor centres itself at --editor-max-width, so no padding here. */}
              <div className="mx-auto flex min-h-0 w-full max-w-(--editor-max-width) flex-1 flex-col">
                <SingleEditorView
                  editor={editor}
                  onNavigateWikilink={NO_WIKILINK_NAVIGATION}
                  onChange={handleEditorChange}
                  onImageImportError={showImageImportErrorToast}
                  sourceEntry={activeTab.entry}
                  attachmentVaultPath={noteRootForPath(activeTab.entry.path)}
                  vaultPath={vaultPath}
                />
              </div>
            </EditorFindScope>
          )}
        </>
      )}
    </div>
  )
})

import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { redo, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { useCodeMirror, type CodeMirrorSnapshot } from '@/kernel/raw/use-code-mirror'
import type { AppLocale } from '@/lib/i18n'
import { RawEditorFindBar, type RawEditorFindRequest } from './raw-editor-find-bar'
import type { EditorHistory } from './editor-history'
import { useRegisteredRef } from './use-registered-ref'
import {
  activatePlainTextPasteTarget,
  registerPlainTextPasteTarget,
  type PlainTextPasteTarget,
} from './plain-text-paste'
import { rawEditorLanguageIdForPath } from '@/kernel/raw/raw-editor-language-id'
import type { RawEditorSnapshots } from './use-raw-editor-snapshots'
import { useEditorFindSession, type EditorFindSession } from './editor-find-session'
import { useImageDrop, type ImageImportErrorHandler } from './use-image-drop'
import { ImageDropAffordance } from './image-drop-affordance'
import {
  insertRawImages,
  rawImageDropTargetAt,
  rawImageMarkdown,
  type RawImageDropTarget,
} from './raw-image-insertion'
import { useRawImagePaste } from './raw-image-paste'
import type { ClientPoint } from '@/platform/use-tauri-drag-drop-event'

export interface RawEditorViewProps {
  content: string
  path: string
  onContentChange: (path: string, content: string) => void
  onSave: () => void
  /** Mutable ref updated on every keystroke with the latest doc string.
   *  Allows the parent to flush debounced content before unmount. */
  latestContentRef?: React.MutableRefObject<string | null>
  locale?: AppLocale
  findRequest?: RawEditorFindRequest | null
  /** The find bar's open state and query, held by the editor pane; left out, the view holds its own. */
  find?: EditorFindSession
  /** Undo and Redo from the shell, on CodeMirror's history, for as long as Raw mode is showing. */
  historyRef?: React.MutableRefObject<EditorHistory | null>
  /** Where each Raw Tab leaves its editor state and scroll position, to find them again when it comes back. */
  snapshots?: RawEditorSnapshots
  /** The Folder, which the Markdown written for a dropped image is made portable against, as Rich mode's is. */
  vaultPath?: string
  /** The directory whose `attachments/` a dropped image is copied into: the Document's own. */
  attachmentVaultPath?: string
  /** Says why a dropped image did not become an Attachment. */
  onImageImportError?: ImageImportErrorHandler
}

const DEBOUNCE_MS = 500

type PendingChangeRefs = {
  debounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  latestDocRef: React.MutableRefObject<string>
  onContentChangeRef: React.MutableRefObject<RawEditorViewProps['onContentChange']>
  pathRef: React.MutableRefObject<string>
  /** The last doc handed to `onContentChange`, so its echo in the content prop is known for one. */
  reportedDocRef: React.MutableRefObject<string | null>
}

/** Basic YAML frontmatter structural checks. */
function detectYamlError(content: string): string | null {
  if (!content.startsWith('---')) return null
  const rest = content.slice(3)
  const closeIdx = rest.search(/(?:^|\r?\n)---(?:\r?\n|$)/)
  if (closeIdx === -1) return 'Unclosed frontmatter block — add a closing --- line'
  const block = rest.slice(0, closeIdx)
  if (/^\t/m.test(block)) return 'YAML frontmatter contains tab indentation — use spaces'
  return null
}

function useLatestRef<T>(value: T): React.MutableRefObject<T> {
  const ref = useRef(value)
  useEffect(() => {
    ref.current = value
  }, [value])
  return ref
}

function reportRawEditorChange(
  { onContentChangeRef, pathRef, reportedDocRef }: PendingChangeRefs,
  doc: string,
): void {
  reportedDocRef.current = doc
  onContentChangeRef.current(pathRef.current, doc)
}

function flushPendingRawEditorChange(refs: PendingChangeRefs): void {
  const { debounceRef, latestDocRef } = refs
  if (!debounceRef.current) return

  clearTimeout(debounceRef.current)
  debounceRef.current = null
  reportRawEditorChange(refs, latestDocRef.current)
}

function RawEditorYamlErrorBanner({ error }: { error: string | null }) {
  if (!error) return null

  return (
    <div
      className="flex shrink-0 items-center gap-2 border-b border-chroma-orange bg-feedback-warning-bg px-4 py-2 text-xs text-feedback-warning-text"
      role="alert"
      data-testid="raw-editor-yaml-error"
    >
      <span className="font-semibold">YAML error:</span>
      <span>{error}</span>
    </div>
  )
}

type RawEditorPendingChanges = PendingChangeRefs & {
  handleDocChange: (doc: string) => void
  handleSave: () => void
  yamlError: string | null
}

function useRawEditorPendingChanges({
  content,
  latestContentRef,
  onContentChange,
  onSave,
  path,
}: Pick<
  RawEditorViewProps,
  'content' | 'latestContentRef' | 'onContentChange' | 'onSave' | 'path'
>): RawEditorPendingChanges {
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pathRef = useLatestRef(path)
  const onContentChangeRef = useLatestRef(onContentChange)
  const onSaveRef = useLatestRef(onSave)
  const latestContentRefStable = useRef(latestContentRef)
  const latestDocRef = useRef(content)
  const reportedDocRef = useRef<string | null>(null)
  const [yamlError, setYamlError] = useState<string | null>(() => detectYamlError(content))

  useEffect(() => {
    if (latestContentRef) latestContentRef.current = content
  }, [latestContentRef, content])
  useEffect(() => {
    latestContentRefStable.current = latestContentRef
  }, [latestContentRef])

  const handleDocChange = useCallback(
    (doc: string) => {
    latestDocRef.current = doc
    if (latestContentRefStable.current) latestContentRefStable.current.current = doc
    setYamlError(detectYamlError(doc))
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      reportRawEditorChange({ debounceRef, latestDocRef, onContentChangeRef, pathRef, reportedDocRef }, doc)
    }, DEBOUNCE_MS)
    },
    [onContentChangeRef, pathRef],
  )

  const handleSave = useCallback(() => {
    flushPendingRawEditorChange({
      debounceRef,
      latestDocRef,
      onContentChangeRef,
      pathRef,
      reportedDocRef,
    })
    onSaveRef.current()
  }, [onContentChangeRef, onSaveRef, pathRef])

  useEffect(() => {
    return () => {
      flushPendingRawEditorChange({
        debounceRef,
        latestDocRef,
        onContentChangeRef,
        pathRef,
        reportedDocRef,
      })
    }
  }, [onContentChangeRef, pathRef])

  return {
    debounceRef,
    handleDocChange,
    handleSave,
    latestDocRef,
    onContentChangeRef,
    pathRef,
    reportedDocRef,
    yamlError,
  }
}

function useRawEditorPlainTextPasteTarget({
  containerRef,
  viewRef,
}: {
  containerRef: React.RefObject<HTMLDivElement | null>
  viewRef: React.MutableRefObject<EditorView | null>
}) {
  const targetRef = useRef<PlainTextPasteTarget | null>(null)

  useEffect(() => {
    const target: PlainTextPasteTarget = {
      surface: 'raw_editor',
      contains: (element) => Boolean(element && containerRef.current?.contains(element)),
      isConnected: () => containerRef.current?.isConnected === true,
      insert: (text) => {
        const view = viewRef.current
        if (!view) return false

        view.dispatch({
          ...view.state.replaceSelection(text),
          userEvent: 'input.paste',
        })
        view.focus()
        return true
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
  }, [containerRef, viewRef])

  return useCallback(() => {
    if (targetRef.current) {
      activatePlainTextPasteTarget(targetRef.current)
    }
  }, [])
}

function useRawEditorDomEvents(
  rootRef: React.RefObject<HTMLDivElement | null>,
  activatePlainTextPaste: () => void,
): void {
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.addEventListener('focusin', activatePlainTextPaste)
    root.addEventListener('mousedown', activatePlainTextPaste, { capture: true })
    return () => {
      root.removeEventListener('focusin', activatePlainTextPaste)
      root.removeEventListener('mousedown', activatePlainTextPaste, { capture: true })
    }
  }, [activatePlainTextPaste, rootRef])
}

function useRawEditorContentSync(options: {
  content: string
  findRequest?: RawEditorFindRequest | null
  path: string
  showFind: () => void
  setRawDoc: (value: string) => void
  setReplaceOpen: (value: boolean) => void
  viewRef: React.MutableRefObject<EditorView | null>
}): void {
  const { content, findRequest, path, showFind, setRawDoc, setReplaceOpen, viewRef } = options
  // What the editor holds once the content prop has been synced into it: an
  // echo of its own report is not synced, and the editor has moved on since.
  useEffect(() => setRawDoc(viewRef.current?.state.doc.toString() ?? content), [content, setRawDoc, viewRef])
  useEffect(() => {
    if (!findRequest || findRequest.path !== path) return
    showFind()
    setReplaceOpen(findRequest.replace)
  }, [findRequest, path, showFind, setReplaceOpen])
}

/**
 * An Image file dropped on the Raw editor becomes an Attachment exactly as in
 * Rich mode (ADR-0006), and its image line goes in beside the line under the
 * pointer, written as Rich mode would write the image block.
 */
function useRawEditorImageDrop({
  attachmentVaultPath,
  containerRef,
  onImageImportError,
  pathRef,
  vaultPath,
  viewRef,
}: Pick<RawEditorViewProps, 'attachmentVaultPath' | 'onImageImportError' | 'vaultPath'> & {
  containerRef: React.RefObject<HTMLDivElement | null>
  pathRef: React.MutableRefObject<string>
  viewRef: React.MutableRefObject<EditorView | null>
}) {
  const vaultPathRef = useLatestRef(vaultPath)
  const dropTargetAt = useCallback(
    (point: ClientPoint) => (viewRef.current ? rawImageDropTargetAt(viewRef.current, point) : null),
    [viewRef],
  )
  const onImagesDropped = useCallback((urls: string[], target: RawImageDropTarget) => {
    const view = viewRef.current
    if (!view) return
    insertRawImages(view, target, urls.map((url) => rawImageMarkdown(url, vaultPathRef.current, pathRef.current)))
  }, [pathRef, vaultPathRef, viewRef])
  return useImageDrop({
    containerRef,
    dropTargetAt,
    onImageImportError,
    onImagesDropped,
    vaultPath: attachmentVaultPath ?? vaultPath,
  })
}

interface RawEditorSurfaceProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  find: EditorFindSession
  findRequest?: RawEditorFindRequest | null
  isDragOver: boolean
  locale: AppLocale
  path: string
  pendingChanges: ReturnType<typeof useRawEditorPendingChanges>
  rawDoc: string
  replaceOpen: boolean
  rootRef: React.RefObject<HTMLDivElement | null>
  setReplaceOpen: (value: boolean) => void
  showFrontmatterWarning: boolean
  viewRef: React.MutableRefObject<EditorView | null>
}

function RawEditorSurface(options: RawEditorSurfaceProps) {
  const { containerRef, find, findRequest, isDragOver, locale, path, pendingChanges, rawDoc, replaceOpen, rootRef, setReplaceOpen, showFrontmatterWarning, viewRef } = options
  return (
    <div ref={rootRef} className="relative flex min-h-0 flex-1 flex-col bg-surface-app">
      <RawEditorYamlErrorBanner error={showFrontmatterWarning ? pendingChanges.yamlError : null} />
      <RawEditorFindBar doc={rawDoc} find={find} locale={locale} onReplaceOpenChange={setReplaceOpen} path={path} replaceOpen={replaceOpen} request={findRequest} viewRef={viewRef} />
      {/* CodeMirror owns the host's children, so the drop affordance is laid over it from beside it. */}
      <div className="relative flex min-h-0 w-full flex-1">
        <div ref={containerRef} className="raw-editor-codemirror flex min-h-0 w-full flex-1" data-testid="raw-editor-codemirror" role="presentation" />
        {isDragOver && <ImageDropAffordance />}
      </div>
    </div>
  )
}

export function RawEditorView(options: RawEditorViewProps) {
  const { attachmentVaultPath, content, findRequest, historyRef, latestContentRef, locale = 'en', onContentChange, onImageImportError, onSave, path, snapshots, vaultPath } = options
  const rootRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [rawDoc, setRawDoc] = useState(content)
  const ownFind = useEditorFindSession(path)
  const find = options.find ?? ownFind
  const [replaceOpen, setReplaceOpen] = useState(false)
  const showFrontmatterWarning = rawEditorLanguageIdForPath(path) === 'markdown'
  const pendingChanges = useRawEditorPendingChanges({
    content,
    latestContentRef,
    onContentChange,
    onSave,
    path,
  })
  const handleDocChange = useCallback(
    (doc: string) => {
    setRawDoc(doc)
    pendingChanges.handleDocChange(doc)
    },
    [pendingChanges],
  )
  const handleCursorActivity = useCallback(() => {}, [])
  const handleEscape = useCallback(() => {
    if (!find.open) return false

    find.close()
    return true
  }, [find])
  const { pathRef, reportedDocRef } = pendingChanges
  const isOwnReport = useCallback((doc: string) => doc === reportedDocRef.current, [reportedDocRef])
  const readSnapshot = useCallback(() => snapshots?.read(pathRef.current) ?? null, [pathRef, snapshots])
  const keepSnapshot = useCallback((snapshot: CodeMirrorSnapshot) => snapshots?.keep(pathRef.current, snapshot), [pathRef, snapshots])
  const viewRef = useCodeMirror(
    containerRef,
    content,
    {
    onDocChange: handleDocChange,
    onCursorActivity: handleCursorActivity,
    onSave: pendingChanges.handleSave,
    onEscape: handleEscape,
    isOwnReport,
    readSnapshot,
    onSnapshot: keepSnapshot,
    },
    path,
  )
  const activatePlainTextPaste = useRawEditorPlainTextPasteTarget({
    containerRef,
    viewRef,
  })
  useRawEditorDomEvents(rootRef, activatePlainTextPaste)
  const { isDragOver } = useRawEditorImageDrop({
    attachmentVaultPath,
    containerRef,
    onImageImportError,
    pathRef,
    vaultPath,
    viewRef,
  })
  useRawImagePaste({
    attachmentVaultPath,
    containerRef,
    onImageImportError,
    pathRef,
    vaultPath,
    viewRef,
  })
  const history = useMemo<EditorHistory>(() => ({
    undo: () => { if (viewRef.current) undo(viewRef.current) },
    redo: () => { if (viewRef.current) redo(viewRef.current) },
  }), [viewRef])
  useRegisteredRef(historyRef, history)

  useRawEditorContentSync({ content, findRequest, path, showFind: find.show, setRawDoc, setReplaceOpen, viewRef })
  return (
    <RawEditorSurface
      containerRef={containerRef}
      find={find}
      findRequest={findRequest}
      isDragOver={isDragOver}
      locale={locale}
      path={path}
      pendingChanges={pendingChanges}
      rawDoc={rawDoc}
      replaceOpen={replaceOpen}
      rootRef={rootRef}
      setReplaceOpen={setReplaceOpen}
      showFrontmatterWarning={showFrontmatterWarning}
      viewRef={viewRef}
    />
  )
}

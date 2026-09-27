import { useRef, useState, useCallback, useEffect, useMemo } from 'react'
import { redo, undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { useCodeMirror } from '@/kernel/raw/use-code-mirror'
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
  /** Undo and Redo from the shell, on CodeMirror's history, for as long as Raw mode is showing. */
  historyRef?: React.MutableRefObject<EditorHistory | null>
}

const DEBOUNCE_MS = 500

type PendingChangeRefs = {
  debounceRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>
  latestDocRef: React.MutableRefObject<string>
  onContentChangeRef: React.MutableRefObject<RawEditorViewProps['onContentChange']>
  pathRef: React.MutableRefObject<string>
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

function flushPendingRawEditorChange({
  debounceRef,
  latestDocRef,
  onContentChangeRef,
  pathRef,
}: PendingChangeRefs): void {
  if (!debounceRef.current) return

  clearTimeout(debounceRef.current)
  debounceRef.current = null
  onContentChangeRef.current(pathRef.current, latestDocRef.current)
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
      onContentChangeRef.current(pathRef.current, doc)
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
  setFindOpen: (value: boolean) => void
  setRawDoc: (value: string) => void
  setReplaceOpen: (value: boolean) => void
}): void {
  const { content, findRequest, path, setFindOpen, setRawDoc, setReplaceOpen } = options
  useEffect(() => setRawDoc(content), [content, setRawDoc])
  useEffect(() => {
    if (!findRequest || findRequest.path !== path) return
    setFindOpen(true)
    setReplaceOpen(findRequest.replace)
  }, [findRequest, path, setFindOpen, setReplaceOpen])
}

interface RawEditorSurfaceProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  findOpen: boolean
  findRequest?: RawEditorFindRequest | null
  locale: AppLocale
  path: string
  pendingChanges: ReturnType<typeof useRawEditorPendingChanges>
  rawDoc: string
  replaceOpen: boolean
  rootRef: React.RefObject<HTMLDivElement | null>
  setFindOpen: (value: boolean) => void
  setReplaceOpen: (value: boolean) => void
  showFrontmatterWarning: boolean
  viewRef: React.MutableRefObject<EditorView | null>
}

function RawEditorSurface(options: RawEditorSurfaceProps) {
  const { containerRef, findOpen, findRequest, locale, path, pendingChanges, rawDoc, replaceOpen, rootRef, setFindOpen, setReplaceOpen, showFrontmatterWarning, viewRef } = options
  return (
    <div ref={rootRef} className="relative flex min-h-0 flex-1 flex-col bg-surface-app">
      <RawEditorYamlErrorBanner error={showFrontmatterWarning ? pendingChanges.yamlError : null} />
      <RawEditorFindBar doc={rawDoc} locale={locale} onClose={() => setFindOpen(false)} onReplaceOpenChange={setReplaceOpen} open={findOpen} path={path} replaceOpen={replaceOpen} request={findRequest} viewRef={viewRef} />
      <div ref={containerRef} className="raw-editor-codemirror flex min-h-0 w-full flex-1" data-testid="raw-editor-codemirror" role="presentation" />
    </div>
  )
}

export function RawEditorView(options: RawEditorViewProps) {
  const { content, findRequest, historyRef, latestContentRef, locale = 'en', onContentChange, onSave, path } = options
  const rootRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [rawDoc, setRawDoc] = useState(content)
  const [findOpen, setFindOpen] = useState(false)
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
    if (!findOpen) return false

    setFindOpen(false)
    return true
  }, [findOpen])
  const viewRef = useCodeMirror(
    containerRef,
    content,
    {
    onDocChange: handleDocChange,
    onCursorActivity: handleCursorActivity,
    onSave: pendingChanges.handleSave,
    onEscape: handleEscape,
    },
    path,
  )
  const activatePlainTextPaste = useRawEditorPlainTextPasteTarget({
    containerRef,
    viewRef,
  })
  useRawEditorDomEvents(rootRef, activatePlainTextPaste)
  const history = useMemo<EditorHistory>(() => ({
    undo: () => { if (viewRef.current) undo(viewRef.current) },
    redo: () => { if (viewRef.current) redo(viewRef.current) },
  }), [viewRef])
  useRegisteredRef(historyRef, history)

  useRawEditorContentSync({ content, findRequest, path, setFindOpen, setRawDoc, setReplaceOpen })
  return (
    <RawEditorSurface
      containerRef={containerRef}
      findOpen={findOpen}
      findRequest={findRequest}
      locale={locale}
      path={path}
      pendingChanges={pendingChanges}
      rawDoc={rawDoc}
      replaceOpen={replaceOpen}
      rootRef={rootRef}
      setFindOpen={setFindOpen}
      setReplaceOpen={setReplaceOpen}
      showFrontmatterWarning={showFrontmatterWarning}
      viewRef={viewRef}
    />
  )
}

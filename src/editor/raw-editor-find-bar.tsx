import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorView } from '@codemirror/view'
import { FindBar } from './find-bar'
import type { ActiveEditorFindMatchSelection, RawEditorFindBarProps, RawEditorFindController, RawEditorFindRequest } from './raw-editor-find-types'
import {
  buildEditorFindReplacementChange,
  buildEditorFindReplacementChanges,
  clampEditorFindIndex,
  findEditorMatches,
  nextEditorFindIndex,
  type EditorFindMatch,
  type EditorFindOptions,
} from '@/kernel/blocknote/editor-find'
import { setRawFindQuery } from '@/kernel/raw/raw-editor-find'

export type { RawEditorFindRequest } from './raw-editor-find-types'

function selectMatch(view: EditorView, match: EditorFindMatch, focusEditor: boolean): void {
  view.dispatch({
    selection: { anchor: match.from, head: match.to },
    effects: EditorView.scrollIntoView(match.from, { y: 'center' }),
  })
  if (focusEditor) view.focus()
}

function useRequestFocus({
  inputRef,
  onReplaceOpenChange,
  open,
  path,
  request,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>
  onReplaceOpenChange: (open: boolean) => void
  open: boolean
  path: string
  request?: RawEditorFindRequest | null
}) {
  useEffect(() => {
    if (!open || !request || request.path !== path) return
    if (request.replace) onReplaceOpenChange(true)

    const frameId = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frameId)
  }, [inputRef, onReplaceOpenChange, open, path, request])
}

function closeRawEditorFind(onClose: () => void, viewRef: React.MutableRefObject<EditorView | null>): void {
  onClose()
  requestAnimationFrame(() => viewRef.current?.focus())
}

/**
 * The bar's highlights, in the editor: every match of what it is looking for,
 * the current one distinctly; none while it is closed. Said again on mount, so
 * an editor that comes back from a snapshot does not keep an old query's.
 */
function useRawEditorFindHighlights({
  activeIndex,
  open,
  options,
  query,
  viewRef,
}: {
  activeIndex: number
  open: boolean
  options: EditorFindOptions
  query: string
  viewRef: React.MutableRefObject<EditorView | null>
}): void {
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: setRawFindQuery.of({ query: open ? query : '', options, activeIndex }),
    })
  }, [activeIndex, open, options, query, viewRef])
}

function useRequestedEditorFindMatchSelection(
  selection: ActiveEditorFindMatchSelection & { requestId: number },
): void {
  const { activeMatch, open, requestId, viewRef } = selection
  const handledRequestRef = useRef<number | null>(null)

  useEffect(() => {
    if (!open) {
      handledRequestRef.current = null
      return
    }
    if (handledRequestRef.current === requestId) return

    handledRequestRef.current = requestId
    const view = viewRef.current
    if (!view || !activeMatch) return
    selectMatch(view, activeMatch, false)
  }, [activeMatch, open, requestId, viewRef])
}

function replaceCurrentEditorFindMatch({
  activeMatch,
  focusEditor,
  options,
  query,
  replacement,
  viewRef,
}: {
  activeMatch?: EditorFindMatch
  /** The Replace button hands focus to the editor; ↵ stays in the replace input, so the next ↵ replaces the next match rather than typing a line break. */
  focusEditor: boolean
  options: EditorFindOptions
  query: string
  replacement: string
  viewRef: React.MutableRefObject<EditorView | null>
}): void {
  const view = viewRef.current
  if (!view || !activeMatch) return

  const change = buildEditorFindReplacementChange(activeMatch, query, replacement, options)
  view.dispatch({
    changes: change,
    selection: {
      anchor: change.from,
      head: change.from + change.insert.length,
    },
    effects: EditorView.scrollIntoView(change.from, { y: 'center' }),
  })
  if (focusEditor) view.focus()
}

function replaceAllEditorFindMatches({
  matches,
  options,
  query,
  replacement,
  viewRef,
}: {
  matches: readonly EditorFindMatch[]
  options: EditorFindOptions
  query: string
  replacement: string
  viewRef: React.MutableRefObject<EditorView | null>
}): boolean {
  const view = viewRef.current
  if (!view || matches.length === 0) return false

  const changes = buildEditorFindReplacementChanges(matches, query, replacement, options)
  view.dispatch({ changes })
  view.focus()
  return true
}

function useEditorFindNavigation(
  matchCount: number,
  setActiveIndex: React.Dispatch<React.SetStateAction<number>>,
  requestSelection: () => void,
): { moveNext: () => void; movePrevious: () => void } {
  const moveMatch = useCallback((direction: 1 | -1) => {
    setActiveIndex((current) => nextEditorFindIndex(current, matchCount, direction))
    requestSelection()
  }, [matchCount, requestSelection, setActiveIndex])
  const movePrevious = useCallback(() => moveMatch(-1), [moveMatch])
  const moveNext = useCallback(() => moveMatch(1), [moveMatch])
  return { moveNext, movePrevious }
}

function useEditorFindOptionToggle(
  { options, setOptions }: { options: EditorFindOptions; setOptions: (options: EditorFindOptions) => void },
  option: keyof EditorFindOptions,
  requestSelection: () => void,
): () => void {
  return useCallback(() => {
    setOptions({ ...options, [option]: !options[option] })
    requestSelection()
  }, [option, options, requestSelection, setOptions])
}

function useEditorFindState({
  activeIndex,
  doc,
  options,
  query,
}: {
  activeIndex: number
  doc: string
  options: EditorFindOptions
  query: string
}) {
  const result = useMemo(() => findEditorMatches(doc, query, options), [doc, options, query])
  const currentIndex = clampEditorFindIndex(activeIndex, result.matches.length)
  return {
    activeMatch: result.matches.at(currentIndex),
    currentIndex,
    error: result.error,
    matches: result.matches,
  }
}

function useRawEditorFindController(
  functionOptions: Omit<RawEditorFindBarProps, 'replaceOpen'>,
): RawEditorFindController {
  const { doc, find, onReplaceOpenChange, path, request, viewRef } = functionOptions
  const { open, options, query, setQuery } = find
  const { caseSensitive, regex } = options
  const inputRef = useRef<HTMLInputElement>(null)
  const [replacement, setReplacement] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectionRequestId, setSelectionRequestId] = useState(0)
  const { activeMatch, currentIndex, error, matches } = useEditorFindState({ activeIndex, doc, options, query })

  useRequestFocus({ inputRef, onReplaceOpenChange, open, path, request })

  useRawEditorFindHighlights({ activeIndex: currentIndex, open, options, query, viewRef })
  useRequestedEditorFindMatchSelection({ activeMatch, open, requestId: selectionRequestId, viewRef })

  const requestSelection = useCallback(() => setSelectionRequestId((current) => current + 1), [])
  const { moveNext, movePrevious } = useEditorFindNavigation(matches.length, setActiveIndex, requestSelection)
  const changeQuery = useCallback((value: string) => {
    setQuery(value)
    setActiveIndex(0)
    requestSelection()
  }, [requestSelection, setQuery])

  const closeFind = find.close
  const close = useCallback(() => closeRawEditorFind(closeFind, viewRef), [closeFind, viewRef])

  const replaceCurrent = useCallback((from: 'button' | 'enter') => {
    replaceCurrentEditorFindMatch({
      activeMatch,
      focusEditor: from === 'button',
      options,
      query,
      replacement,
      viewRef,
    })
  }, [activeMatch, options, query, replacement, viewRef])

  const replaceAll = useCallback(() => {
    if (
      replaceAllEditorFindMatches({
      matches,
      options,
      query,
      replacement,
      viewRef,
      })
    ) {
      setActiveIndex(0)
    }
  }, [matches, options, query, replacement, viewRef])
  const toggleCaseSensitive = useEditorFindOptionToggle(find, 'caseSensitive', requestSelection)
  const toggleRegex = useEditorFindOptionToggle(find, 'regex', requestSelection)

  return {
    caseSensitive,
    changeQuery,
    close,
    currentIndex,
    error,
    findInputRef: inputRef,
    matchCount: matches.length,
    moveNext,
    movePrevious,
    query,
    regex,
    replaceAll,
    replaceCurrent,
    replacement,
    setReplacement,
    toggleCaseSensitive,
    toggleRegex,
  }
}

export function RawEditorFindBar(props: RawEditorFindBarProps) {
  const { find, locale = 'en', onReplaceOpenChange, replaceOpen } = props
  const controller = useRawEditorFindController(props)

  if (!find.open) return null

  return (
    <FindBar
      testIdPrefix="raw-editor"
      locale={locale}
      inputRef={controller.findInputRef}
      query={controller.query}
      onQueryChange={controller.changeQuery}
      caseSensitive={controller.caseSensitive}
      onCaseSensitiveChange={controller.toggleCaseSensitive}
      regex={controller.regex}
      onRegexChange={controller.toggleRegex}
      matchCount={controller.matchCount}
      currentIndex={controller.currentIndex}
      error={controller.error}
      onNext={controller.moveNext}
      onPrevious={controller.movePrevious}
      onClose={controller.close}
      replace={{
        open: replaceOpen,
        onOpenChange: onReplaceOpenChange,
        value: controller.replacement,
        onValueChange: controller.setReplacement,
        onReplace: controller.replaceCurrent,
        onReplaceAll: controller.replaceAll,
      }}
    />
  )
}

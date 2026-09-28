import { CaretDown as ChevronDown, CaretRight as ChevronRight, CaretUp as ChevronUp, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { EditorView } from '@codemirror/view'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Toggle } from '@/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { cn } from '@/lib/cn'
import { translate, type AppLocale } from '@/lib/i18n'
import { isImeKeyEvent } from '@/lib/ime-key-event'
import type { FindControlsProps, ReplaceControlsProps } from './raw-editor-find-control-types'
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

function matchStatusText(locale: AppLocale, error: string | null, activeIndex: number, matchCount: number): string {
  if (error === 'Invalid regex') return translate(locale, 'editor.find.invalidRegex')
  if (error) return translate(locale, 'editor.find.regexMustMatchText')
  if (matchCount === 0) return translate(locale, 'editor.find.noMatches')
  return translate(locale, 'editor.find.matchCount', {
    current: clampEditorFindIndex(activeIndex, matchCount) + 1,
    total: matchCount,
  })
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

/** ↵ in the find input: the next match, ⇧↵ the previous. Escape is the bar's, for every control in it. */
function handleRawEditorFindKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  moveMatch: (direction: 1 | -1) => void,
): void {
  // Enter confirming a candidate is the input method's.
  if (event.key !== 'Enter' || isImeKeyEvent(event.nativeEvent)) return

  event.preventDefault()
  moveMatch(event.shiftKey ? -1 : 1)
}

/** ↵ in the replace input replaces the current match, as the Replace button does, and the next match becomes current. */
function handleRawEditorReplaceKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  replaceCurrent: () => void,
): void {
  if (event.key !== 'Enter' || event.shiftKey || isImeKeyEvent(event.nativeEvent)) return

  event.preventDefault()
  replaceCurrent()
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
): { moveMatch: (direction: 1 | -1) => void; moveNext: () => void; movePrevious: () => void } {
  const moveMatch = useCallback((direction: 1 | -1) => {
    setActiveIndex((current) => nextEditorFindIndex(current, matchCount, direction))
    requestSelection()
  }, [matchCount, requestSelection, setActiveIndex])
  const movePrevious = useCallback(() => moveMatch(-1), [moveMatch])
  const moveNext = useCallback(() => moveMatch(1), [moveMatch])
  return { moveMatch, moveNext, movePrevious }
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
  locale,
  options,
  query,
}: {
  activeIndex: number
  doc: string
  locale: AppLocale
  options: EditorFindOptions
  query: string
}) {
  const result = useMemo(() => findEditorMatches(doc, query, options), [doc, options, query])
  const currentIndex = clampEditorFindIndex(activeIndex, result.matches.length)
  return {
    activeMatch: result.matches.at(currentIndex),
    currentIndex,
    hasMatches: result.matches.length > 0 && !result.error,
    matches: result.matches,
    status: matchStatusText(locale, result.error, currentIndex, result.matches.length),
  }
}

function useRawEditorFindController(
  functionOptions: Omit<RawEditorFindBarProps, 'replaceOpen'>,
): RawEditorFindController {
  const { doc, find, locale = 'en', onReplaceOpenChange, path, request, viewRef } = functionOptions
  const { open, options, query, setQuery } = find
  const { caseSensitive, regex } = options
  const inputRef = useRef<HTMLInputElement>(null)
  const [replacement, setReplacement] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [selectionRequestId, setSelectionRequestId] = useState(0)
  const { activeMatch, currentIndex, hasMatches, matches, status } = useEditorFindState({ activeIndex, doc, locale, options, query })

  useRequestFocus({ inputRef, onReplaceOpenChange, open, path, request })

  useRawEditorFindHighlights({ activeIndex: currentIndex, open, options, query, viewRef })
  useRequestedEditorFindMatchSelection({ activeMatch, open, requestId: selectionRequestId, viewRef })

  const requestSelection = useCallback(() => setSelectionRequestId((current) => current + 1), [])
  const { moveMatch, moveNext, movePrevious } = useEditorFindNavigation(matches.length, setActiveIndex, requestSelection)
  const handleFindChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(event.target.value)
    setActiveIndex(0)
    requestSelection()
  }, [requestSelection, setQuery])

  const closeFind = find.close
  const close = useCallback(() => closeRawEditorFind(closeFind, viewRef), [closeFind, viewRef])

  const handleFindKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      handleRawEditorFindKeyDown(event, moveMatch)
    },
    [moveMatch],
  )

  const replaceMatch = useCallback((focusEditor: boolean) => {
    replaceCurrentEditorFindMatch({
      activeMatch,
      focusEditor,
      options,
      query,
      replacement,
      viewRef,
    })
  }, [activeMatch, options, query, replacement, viewRef])
  const replaceCurrent = useCallback(() => replaceMatch(true), [replaceMatch])
  const handleReplaceKeyDown = useCallback(
    (event: KeyboardEvent<HTMLInputElement>) => {
      handleRawEditorReplaceKeyDown(event, () => replaceMatch(false))
    },
    [replaceMatch],
  )

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
    close,
    findInputRef: inputRef,
    handleFindChange,
    handleFindKeyDown,
    handleReplaceKeyDown,
    hasMatches,
    moveNext,
    movePrevious,
    query,
    regex,
    replaceAll,
    replaceCurrent,
    replacement,
    setReplacement,
    status,
    toggleCaseSensitive,
    toggleRegex,
  }
}

function FindNavigationControls({
  hasMatches,
  locale,
  moveNext,
  movePrevious,
}: Pick<FindControlsProps, 'hasMatches' | 'locale' | 'moveNext' | 'movePrevious'>) {
  const previousLabel = translate(locale, 'editor.find.previousMatch')
  const nextLabel = translate(locale, 'editor.find.nextMatch')
  return (
    <>
      <FindTooltip label={previousLabel}>
        <Button type="button" variant="icon" size="icon-xs" aria-label={previousLabel} disabled={!hasMatches} onClick={movePrevious}>
          <ChevronUp />
        </Button>
      </FindTooltip>
      <FindTooltip label={nextLabel}>
        <Button type="button" variant="icon" size="icon-xs" aria-label={nextLabel} disabled={!hasMatches} onClick={moveNext}>
          <ChevronDown />
        </Button>
      </FindTooltip>
    </>
  )
}

function FindModeControls({
  caseSensitive,
  close,
  locale,
  regex,
  toggleCaseSensitive,
  toggleRegex,
}: Pick<FindControlsProps, 'caseSensitive' | 'close' | 'locale' | 'regex' | 'toggleCaseSensitive' | 'toggleRegex'>) {
  const regexLabel = translate(locale, 'editor.find.regex')
  const matchCaseLabel = translate(locale, 'editor.find.matchCase')
  const closeLabel = translate(locale, 'editor.find.close')
  return (
    <>
      <FindTooltip label={regexLabel}>
        <Toggle pressed={regex} data-state={regex ? 'on' : 'off'} aria-label={regexLabel} onPressedChange={toggleRegex}>
          .*
        </Toggle>
      </FindTooltip>
      <FindTooltip label={matchCaseLabel}>
        <Toggle pressed={caseSensitive} data-state={caseSensitive ? 'on' : 'off'} aria-label={matchCaseLabel} onPressedChange={toggleCaseSensitive}>
          Aa
        </Toggle>
      </FindTooltip>
      <FindTooltip label={closeLabel}>
        <Button type="button" variant="icon" size="icon-xs" aria-label={closeLabel} onClick={close}>
          <X />
        </Button>
      </FindTooltip>
    </>
  )
}

/** An icon control's tooltip, below it. A `Toggle` inside restates its `data-state`: the trigger writes its own over it. */
function FindTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function FindControls(options: FindControlsProps) {
  const { findInputRef, handleFindChange, handleFindKeyDown, locale, onReplaceOpenChange, query, replaceOpen, status } = options
  const replaceLabel = translate(locale, replaceOpen ? 'editor.find.hideReplace' : 'editor.find.showReplace')
  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <FindTooltip label={replaceLabel}>
        <Button type="button" variant="icon" size="icon-xs" aria-label={replaceLabel} onClick={() => onReplaceOpenChange(!replaceOpen)}>
          <ChevronRight className={cn('transition-transform', replaceOpen && 'rotate-90')} />
        </Button>
      </FindTooltip>
      <Input
        ref={findInputRef}
        type="search"
        aria-label={translate(locale, 'editor.find.findLabel')}
        placeholder={translate(locale, 'editor.find.findPlaceholder')}
        value={query}
        onChange={handleFindChange}
        onKeyDown={handleFindKeyDown}
        className="h-7 min-w-[12rem] flex-1 rounded px-2 text-xs"
        data-testid="raw-editor-find-input"
      />
      <span
        className="min-w-[4.75rem] text-right text-xs text-text-secondary"
        aria-live="polite"
        data-testid="raw-editor-find-count"
      >
        {status}
      </span>
      <FindNavigationControls {...options} />
      <FindModeControls {...options} />
    </div>
  )
}

function ReplaceControls({
  handleReplaceKeyDown,
  hasMatches,
  locale,
  replaceAll,
  replaceCurrent,
  replacement,
  setReplacement,
}: ReplaceControlsProps) {
  return (
    <div className="ml-[1.875rem] flex min-w-0 items-center gap-1.5">
      <Input
        type="text"
        aria-label={translate(locale, 'editor.find.replaceLabel')}
        placeholder={translate(locale, 'editor.find.replacePlaceholder')}
        value={replacement}
        onChange={(event) => setReplacement(event.target.value)}
        onKeyDown={handleReplaceKeyDown}
        className="h-7 min-w-[12rem] flex-1 rounded px-2 text-xs"
        data-testid="raw-editor-replace-input"
      />
      <Button type="button" variant="outline" size="xs" disabled={!hasMatches} onClick={replaceCurrent}>
        {translate(locale, 'editor.find.replace')}
      </Button>
      <Button type="button" variant="outline" size="xs" disabled={!hasMatches} onClick={replaceAll}>
        {translate(locale, 'editor.find.replaceAll')}
      </Button>
    </div>
  )
}

function RawEditorFindBarContent({
  controller,
  locale,
  onReplaceOpenChange,
  replaceOpen,
}: {
  controller: RawEditorFindController
  locale: AppLocale
  onReplaceOpenChange: (open: boolean) => void
  replaceOpen: boolean
}) {
  return (
    <>
      <FindControls
        {...controller}
        locale={locale}
        onReplaceOpenChange={onReplaceOpenChange}
        replaceOpen={replaceOpen}
      />
      {replaceOpen && <ReplaceControls {...controller} locale={locale} />}
    </>
  )
}

export function RawEditorFindBar(props: RawEditorFindBarProps) {
  const { find, locale = 'en', onReplaceOpenChange, replaceOpen } = props
  const controller = useRawEditorFindController(props)
  const { close } = controller

  if (!find.open) return null

  // Escape from any control in the bar closes it once; cancelling a candidate is the input method's.
  const onBarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || isImeKeyEvent(event.nativeEvent)) return
    event.preventDefault()
    close()
  }

  return (
    <div
      className="flex shrink-0 flex-col gap-1.5 border-b border-border-default bg-surface-card px-3 py-2"
      data-testid="raw-editor-find-bar"
      onKeyDown={onBarKeyDown}
    >
      <RawEditorFindBarContent
        controller={controller}
        locale={locale}
        onReplaceOpenChange={onReplaceOpenChange}
        replaceOpen={replaceOpen}
      />
    </div>
  )
}

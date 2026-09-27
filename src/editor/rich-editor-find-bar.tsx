import { CaretDown as ChevronDown, CaretUp as ChevronUp, X } from '@phosphor-icons/react'
import type { EditorView } from '@tiptap/pm/view'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Toggle } from '@/ui/toggle'
import { translate, type AppLocale } from '@/lib/i18n'
import { isImeKeyEvent } from '@/lib/ime-key-event'
import { clampEditorFindIndex, nextEditorFindIndex, type EditorFindOptions } from '@/kernel/blocknote/editor-find'
import type { RawEditorFindRequest } from './raw-editor-find-types'
import { collectRichFindMatches, revealRichFindMatch, setRichFindState, type RichFindResult } from '@/kernel/blocknote/rich-editor-find'

/** What the bar needs of the BlockNote editor: its ProseMirror view and a way to hear edits. */
export interface RichFindEditor {
  readonly prosemirrorView: EditorView | undefined
  onChange?: (callback: () => void) => (() => void) | undefined
}

export interface RichEditorFindBarProps {
  editor: RichFindEditor
  /** The Document showing; a request for another path is not this bar's. */
  path: string
  request: RawEditorFindRequest | null
  locale?: AppLocale
}

const NO_RESULT: RichFindResult = { matches: [], error: null }
const DEFAULT_OPTIONS: EditorFindOptions = { caseSensitive: false, regex: false }

/** The view, or null before the editor has mounted (the getter throws until then). */
function viewOf(editor: RichFindEditor): EditorView | null {
  try {
    const view = editor.prosemirrorView
    return view && !view.isDestroyed ? view : null
  } catch {
    return null
  }
}

function statusText(locale: AppLocale, result: RichFindResult, activeIndex: number): string {
  if (result.error === 'Invalid regex') return translate(locale, 'editor.find.invalidRegex')
  if (result.error) return translate(locale, 'editor.find.regexMustMatchText')
  const total = result.matches.length
  if (total === 0) return translate(locale, 'editor.find.noMatches')
  return translate(locale, 'editor.find.matchCount', { current: clampEditorFindIndex(activeIndex, total) + 1, total })
}

/** Re-render when the Document changes under the bar, so the count and the highlights follow the edit. */
function useDocumentVersion(editor: RichFindEditor): number {
  const [version, setVersion] = useState(0)
  useEffect(() => editor.onChange?.(() => setVersion((value) => value + 1)), [editor])
  return version
}

/**
 * Find in Rich mode: the same bar as Raw mode's, minus replace, over the
 * ProseMirror document. A request for
 * this Document opens it; esc closes it and hands focus back to the editor.
 * Every match is highlighted by the find plugin, the current one distinctly,
 * and ↵ / ⇧↵ walk them, moving the editor's selection along.
 */
export function RichEditorFindBar({ editor, path, request, locale = 'en' }: RichEditorFindBarProps) {
  const [closedRequestId, setClosedRequestId] = useState<number | null>(null)
  const open = request !== null && request.path === path && request.id !== closedRequestId
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(DEFAULT_OPTIONS.caseSensitive)
  const [regex, setRegex] = useState(DEFAULT_OPTIONS.regex)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const documentVersion = useDocumentVersion(editor)
  const options = useMemo<EditorFindOptions>(() => ({ caseSensitive, regex }), [caseSensitive, regex])

  const result = useMemo(() => {
    void documentVersion
    const view = viewOf(editor)
    if (!open || !view) return NO_RESULT
    return collectRichFindMatches(view.state.doc, query, options)
  }, [documentVersion, editor, open, options, query])
  const matchCount = result.matches.length
  const currentIndex = clampEditorFindIndex(activeIndex, matchCount)

  // The plugin highlights what the bar is looking for; a closed bar clears it.
  useEffect(() => {
    const view = viewOf(editor)
    if (!view) return
    const live = open && query.length > 0
    view.dispatch(setRichFindState(view.state.tr, live ? { query, options, activeIndex: currentIndex } : { query: '', options, activeIndex: 0 }))
  }, [currentIndex, editor, open, options, query])
  useEffect(() => () => {
    const view = viewOf(editor)
    view?.dispatch(setRichFindState(view.state.tr, { query: '', options: DEFAULT_OPTIONS, activeIndex: 0 }))
  }, [editor])

  // A new query, or an option that changes what it matches, shows its first
  // match at once, as the Raw bar does. Asked for by the change and handled
  // once: an edit to the Document also changes the matches, and must not move
  // the selection out from under the person typing.
  const [firstMatchRequest, setFirstMatchRequest] = useState(0)
  const shownFirstMatchRequestRef = useRef(0)
  const firstMatch = result.matches[0]
  useEffect(() => {
    if (shownFirstMatchRequestRef.current === firstMatchRequest) return
    shownFirstMatchRequestRef.current = firstMatchRequest
    const view = viewOf(editor)
    if (view && firstMatch) revealRichFindMatch(editor, view, firstMatch)
  }, [editor, firstMatch, firstMatchRequest])
  const searchAgain = () => {
    setActiveIndex(0)
    setFirstMatchRequest((value) => value + 1)
  }

  const requestId = open ? request.id : null
  useEffect(() => {
    if (requestId === null) return
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [requestId])

  if (!open) return null

  const revealMatch = (index: number) => {
    setActiveIndex(index)
    const view = viewOf(editor)
    const match = result.matches[index]
    if (view && match) revealRichFindMatch(editor, view, match)
  }
  const moveNext = () => revealMatch(nextEditorFindIndex(currentIndex, matchCount, 1))
  const movePrevious = () => revealMatch(nextEditorFindIndex(currentIndex, matchCount, -1))
  const close = () => {
    setClosedRequestId(request.id)
    viewOf(editor)?.focus()
  }

  // ↵ confirming a candidate and esc cancelling one are the input method's.
  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || isImeKeyEvent(event.nativeEvent)) return
    event.preventDefault()
    if (event.shiftKey) movePrevious()
    else moveNext()
  }
  const onBarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || isImeKeyEvent(event.nativeEvent)) return
    event.preventDefault()
    close()
  }

  return (
    <div
      className="sticky top-0 z-raised flex shrink-0 items-center gap-1.5 border-b border-border-default bg-surface-card px-3 py-2"
      data-testid="rich-editor-find-bar"
      onKeyDown={onBarKeyDown}
    >
      <Input
        ref={inputRef}
        type="search"
        aria-label={translate(locale, 'editor.find.findLabel')}
        placeholder={translate(locale, 'editor.find.findPlaceholder')}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          searchAgain()
        }}
        onKeyDown={onInputKeyDown}
        className="h-7 min-w-[12rem] flex-1 rounded px-2 text-xs"
        data-testid="rich-editor-find-input"
      />
      <span className="min-w-[4.75rem] text-right text-xs text-text-secondary" aria-live="polite" data-testid="rich-editor-find-count">
        {statusText(locale, result, currentIndex)}
      </span>
      <Button type="button" variant="icon" size="icon-xs" aria-label={translate(locale, 'editor.find.previousMatch')} title={translate(locale, 'editor.find.previousMatch')} disabled={matchCount === 0} onClick={movePrevious}>
        <ChevronUp />
      </Button>
      <Button type="button" variant="icon" size="icon-xs" aria-label={translate(locale, 'editor.find.nextMatch')} title={translate(locale, 'editor.find.nextMatch')} disabled={matchCount === 0} onClick={moveNext}>
        <ChevronDown />
      </Button>
      <Toggle pressed={regex} onPressedChange={(pressed) => { setRegex(pressed); searchAgain() }} aria-label={translate(locale, 'editor.find.regex')} title={translate(locale, 'editor.find.regex')}>
        .*
      </Toggle>
      <Toggle pressed={caseSensitive} onPressedChange={(pressed) => { setCaseSensitive(pressed); searchAgain() }} aria-label={translate(locale, 'editor.find.matchCase')} title={translate(locale, 'editor.find.matchCase')}>
        Aa
      </Toggle>
      <Button type="button" variant="icon" size="icon-xs" aria-label={translate(locale, 'editor.find.close')} title={translate(locale, 'editor.find.close')} onClick={close}>
        <X />
      </Button>
    </div>
  )
}

import type { EditorView } from '@tiptap/pm/view'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppLocale } from '@/lib/i18n'
import { clampEditorFindIndex, nextEditorFindIndex, type EditorFindOptions } from '@/kernel/blocknote/editor-find'
import type { RawEditorFindRequest } from './raw-editor-find-types'
import {
  collectRichFindMatches,
  isRichFindEscape,
  revealRichFindMatch,
  setRichFindState,
  type RichFindOverlayOwner,
  type RichFindResult,
} from '@/kernel/blocknote/rich-editor-find'
import type { EditorFindSession } from './editor-find-session'
import { FindBar } from './find-bar'

/** What the bar needs of the BlockNote editor: its ProseMirror view, a way to hear edits, and its menus and toolbars. */
export interface RichFindEditor extends RichFindOverlayOwner {
  readonly prosemirrorView: EditorView | undefined
  onChange?: (callback: () => void) => (() => void) | undefined
}

export interface RichEditorFindBarProps {
  editor: RichFindEditor
  /** The Document showing; a request for another path is not this bar's. */
  path: string
  request: RawEditorFindRequest | null
  /** Open or not, and the query: the editor pane's, so a switch to Raw mode and back keeps them. */
  find: EditorFindSession
  locale?: AppLocale
}

const NO_RESULT: RichFindResult = { matches: [], error: null }
const DEFAULT_OPTIONS: EditorFindOptions = { caseSensitive: false, regex: false }

/**
 * Esc in the Rich body closes the open bar, as it does in Raw mode, when no
 * other meaning of Esc there comes first (`isRichFindEscape`). Listened for
 * on the document, capturing, so it is seen before ProseMirror would turn it
 * into a block selection.
 */
function useCloseOnBodyEscape(editor: RichFindEditor, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const view = viewOf(editor)
      if (!view || !isRichFindEscape(editor, view, event)) return
      event.preventDefault()
      event.stopPropagation()
      close()
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [close, editor, open])
}

/** The view, or null before the editor has mounted (the getter throws until then). */
function viewOf(editor: RichFindEditor): EditorView | null {
  try {
    const view = editor.prosemirrorView
    return view && !view.isDestroyed ? view : null
  } catch {
    return null
  }
}

/** Re-render when the Document changes under the bar, so the count and the highlights follow the edit. */
function useDocumentVersion(editor: RichFindEditor): number {
  const [version, setVersion] = useState(0)
  useEffect(() => editor.onChange?.(() => setVersion((value) => value + 1)), [editor])
  return version
}

/**
 * Find in Rich mode: the shared `FindBar`, without its replace row, over the
 * ProseMirror document. A request for
 * this Document opens it; esc, in the bar or in the Document's body, closes
 * it and leaves the focus in the editor.
 * Every match is highlighted by the find plugin, the current one distinctly,
 * and ↵ / ⇧↵ walk them, moving the editor's selection along.
 */
export function RichEditorFindBar({ editor, path, request, find, locale = 'en' }: RichEditorFindBarProps) {
  const { open, query, options, show, setQuery, setOptions } = find
  const { caseSensitive, regex } = options
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const documentVersion = useDocumentVersion(editor)

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

  // A request for this Document opens the bar and puts the caret in its input.
  const requestId = request !== null && request.path === path ? request.id : null
  useEffect(() => {
    if (requestId === null) return
    show()
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [requestId, show])

  const closeFind = find.close
  const close = useCallback(() => {
    closeFind()
    viewOf(editor)?.focus()
  }, [closeFind, editor])
  useCloseOnBodyEscape(editor, open, close)

  if (!open) return null

  const revealMatch = (index: number) => {
    setActiveIndex(index)
    const view = viewOf(editor)
    const match = result.matches[index]
    if (view && match) revealRichFindMatch(editor, view, match)
  }
  const moveNext = () => revealMatch(nextEditorFindIndex(currentIndex, matchCount, 1))
  const movePrevious = () => revealMatch(nextEditorFindIndex(currentIndex, matchCount, -1))

  return (
    // Sticky, so the bar stays at the top of the scroll area while the Document scrolls under it.
    <FindBar
      testIdPrefix="rich-editor"
      className="sticky top-0 z-raised"
      locale={locale}
      inputRef={inputRef}
      query={query}
      onQueryChange={(value) => {
        setQuery(value)
        searchAgain()
      }}
      caseSensitive={caseSensitive}
      onCaseSensitiveChange={(pressed) => {
        setOptions({ ...options, caseSensitive: pressed })
        searchAgain()
      }}
      regex={regex}
      onRegexChange={(pressed) => {
        setOptions({ ...options, regex: pressed })
        searchAgain()
      }}
      matchCount={matchCount}
      currentIndex={currentIndex}
      error={result.error}
      onNext={moveNext}
      onPrevious={movePrevious}
      onClose={close}
    />
  )
}

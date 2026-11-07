import { useCallback, useEffect, useState, type RefObject } from 'react'
import { resolveEffectiveLocale, translate, type AppLocale } from '@/lib/i18n'
import { EDITOR_SCROLL_AREA_SELECTOR } from '@/kernel/resolve/editor-dom-selection'
import {
  markdownHighlightColorOption,
  type MarkdownHighlightColor,
} from '@/kernel/markdown/markdown-highlight-markdown'
import type { HighlightEditor, MarkdownHighlightRange } from './markdown-highlight-model'
import { readMarkdownHighlightRange } from './markdown-highlight-range'

/** Where the control sits against the highlight end's line: above it, or below when there is no room above. */
export type CursorControlSide = 'top' | 'bottom'

export type CursorControlState = MarkdownHighlightRange & {
  /** The highlight end's line box, as wide as the caret: what the control is placed against. */
  anchor: DOMRect
  /** The editor's scroll area, the box the control stays inside; null outside one (the window). */
  boundary: Element | null
  side: CursorControlSide
}

// The button is `icon-xs`, 24px square, kept 4px off the line box it sits against.
const CONTROL_SIZE = 24
export const CONTROL_GAP = 4

function currentLocale(): AppLocale {
  return resolveEffectiveLocale(document.documentElement.lang)
}

export function colorLabel(locale: AppLocale, color: MarkdownHighlightColor): string {
  return translate(locale, markdownHighlightColorOption(color).localeKey)
}

export function useDocumentLocale(): AppLocale {
  const [locale, setLocale] = useState(currentLocale)

  useEffect(() => {
    const observer = new MutationObserver(() => setLocale(currentLocale()))
    observer.observe(document.documentElement, { attributeFilter: ['lang'] })
    return () => observer.disconnect()
  }, [])

  return locale
}

type EditorViewport = { bottom: number; scrollArea: Element | null; top: number }

// What the editor's scroll area shows: its box, less anything stuck to its top
// (the find bar). Without a scroll area, the window. The find bar is a child
// of the scroll area's content, which is the scroll area itself or the one
// wrapper a ScrollArea's viewport puts around it.
function readEditorViewport(editor: HighlightEditor): EditorViewport {
  const scrollArea = editor.domElement?.closest(EDITOR_SCROLL_AREA_SELECTOR) ?? null
  if (!scrollArea) {
    return { bottom: window.innerHeight, scrollArea, top: 0 }
  }

  const { bottom, top } = scrollArea.getBoundingClientRect()
  let visibleTop = top
  for (const child of Array.from<Element>(scrollArea.querySelectorAll(':scope > *, :scope > div > *'))) {
    if (getComputedStyle(child).position !== 'sticky') continue
    const bounds = child.getBoundingClientRect()
    if (bounds.top <= visibleTop) visibleTop = Math.max(visibleTop, bounds.bottom)
  }
  return { bottom, scrollArea, top: visibleTop }
}

// The control floats over the editor's chrome, so it is only shown while the
// highlight end's line lies within what the editor shows; it would otherwise
// float over the Tab bar or the find bar. It sits just above that line,
// centred on the end, so it never covers the highlight's line or the text
// after it; below the line when there is no room above (the find bar counts).
// Kept inside the scroll area's left and right edges by the popover it is in.
function readCursorControlState(editor: HighlightEditor): CursorControlState | null {
  const range = readMarkdownHighlightRange(editor)
  if (!range) return null

  try {
    // Side -1: the last highlighted character's line, not the next line's
    // start when the line wraps at the highlight's end.
    const line = editor.prosemirrorView.coordsAtPos(range.to, -1)
    const viewport = readEditorViewport(editor)
    if (line.top < viewport.top || line.bottom > viewport.bottom) return null

    const above = line.top - CONTROL_GAP - CONTROL_SIZE
    const side: CursorControlSide = above >= viewport.top ? 'top' : 'bottom'
    const anchor = new DOMRect(line.right, line.top, 0, line.bottom - line.top)
    return { ...range, anchor, boundary: viewport.scrollArea, side }
  } catch {
    return null
  }
}

export function useCursorControlState(editor: HighlightEditor): CursorControlState | null {
  const [state, setState] = useState(() => readCursorControlState(editor))
  const update = useCallback(() => setState(readCursorControlState(editor)), [editor])

  useEffect(() => {
    const unsubscribeChange = editor.onChange(update)
    const unsubscribeSelection = editor.onSelectionChange(update)
    window.addEventListener('resize', update)
    document.addEventListener('scroll', update, true)
    return () => {
      unsubscribeChange()
      unsubscribeSelection()
      window.removeEventListener('resize', update)
      document.removeEventListener('scroll', update, true)
    }
  }, [editor, update])

  return state
}

function isWithinEditorOrControl(
  editor: HighlightEditor,
  controlRef: RefObject<HTMLElement | null>,
  target: EventTarget | null,
): boolean {
  if (!(target instanceof Node)) return false
  return Boolean(editor.domElement?.contains(target) || controlRef.current?.contains(target))
}

/** Whether the focus is in the editor or in the control itself (its button). */
export function useFocusWithinEditorOrControl(
  editor: HighlightEditor,
  controlRef: RefObject<HTMLElement | null>,
): boolean {
  const [focused, setFocused] = useState(() => (
    isWithinEditorOrControl(editor, controlRef, document.activeElement)
  ))

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent) => {
      setFocused(isWithinEditorOrControl(editor, controlRef, event.target))
    }
    const handleFocusOut = (event: FocusEvent) => {
      setFocused(isWithinEditorOrControl(editor, controlRef, event.relatedTarget))
    }
    document.addEventListener('focusin', handleFocusIn)
    document.addEventListener('focusout', handleFocusOut)
    return () => {
      document.removeEventListener('focusin', handleFocusIn)
      document.removeEventListener('focusout', handleFocusOut)
    }
  }, [controlRef, editor])

  return focused
}

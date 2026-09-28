import { useCallback, useEffect, useState, type RefObject } from 'react'
import { resolveEffectiveLocale, translate, type AppLocale } from '@/lib/i18n'
import { EDITOR_SCROLL_AREA_SELECTOR } from '@/kernel/resolve/editor-dom-selection'
import {
  markdownHighlightColorOption,
  type MarkdownHighlightColor,
} from '@/kernel/markdown/markdown-highlight-markdown'
import type { HighlightEditor, MarkdownHighlightRange } from './markdown-highlight-model'
import { readMarkdownHighlightRange } from './markdown-highlight-range'

export type CursorControlState = MarkdownHighlightRange & {
  left: number
  top: number
}

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

// The control is fixed on the body, above the editor's chrome, so it is only
// shown while the highlight's end lies within what the editor's scroll area
// shows; it would otherwise float over the Tab bar.
function isWithinEditorScrollArea(
  editor: HighlightEditor,
  coordinates: { bottom: number; top: number },
): boolean {
  const scrollArea = editor.domElement?.closest(EDITOR_SCROLL_AREA_SELECTOR)
  if (!scrollArea) return true

  const bounds = scrollArea.getBoundingClientRect()
  return coordinates.top >= bounds.top && coordinates.bottom <= bounds.bottom
}

function readCursorControlState(editor: HighlightEditor): CursorControlState | null {
  const range = readMarkdownHighlightRange(editor)
  if (!range) return null

  try {
    const coordinates = editor.prosemirrorView.coordsAtPos(range.to)
    if (!isWithinEditorScrollArea(editor, coordinates)) return null
    const left = Math.min(coordinates.right + 8, window.innerWidth - 32)
    const top = coordinates.top + (coordinates.bottom - coordinates.top) / 2
    return { ...range, left, top }
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

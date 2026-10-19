import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
import { BLOCK_CONTAINER_SELECTOR, editorBlockElement, type RichEditor } from '@/kernel/blocknote/block-note-dom'
import {
  collapsedSectionHiddenBlockIds,
  expandSectionsHidingBlock,
  useCollapsedHeadingIds,
} from '@/kernel/blocknote/collapsed-sections'
import { useEditorContentPathSignal } from '@/kernel/resolve/use-editor-content-path-signal'
import { documentOutline, sameOutline, type OutlineEntry } from './outline-entries'

/** The current Section is the last heading above this line, measured from the scroll area's top. */
const ACTIVE_LINE = 96
/** Where a jump leaves its heading: clear of the find bar, which is sticky over the top. */
const JUMP_OFFSET = 48
/** The room the rail needs left of the editor's box, which holds the side menu and the text. */
const RAIL_GUTTER = 40
/** The rail and the card are at most this share of the scroll area's height. */
const MAX_HEIGHT_SHARE = 0.6

const NO_IDS: ReadonlySet<string> = new Set()

export interface Outline {
  entries: OutlineEntry[]
  /** Headings inside a collapsed Section. */
  hiddenIds: ReadonlySet<string>
  activeId: string | null
  /** False while the Document has no Outline or the pane is too narrow for the rail. */
  shown: boolean
  maxHeight: number
  jumpTo: (id: string) => void
}

function headingElement(editorElement: HTMLElement, id: string): HTMLElement | null {
  return editorElement.querySelector<HTMLElement>(`${BLOCK_CONTAINER_SELECTOR}[data-id="${id}"]`)
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

/** The heading of the Section in view: the last one above the active line, or the last of all once the Document is scrolled to its end. */
export function activeOutlineEntry(
  scrollArea: HTMLElement,
  editorElement: HTMLElement,
  entries: readonly OutlineEntry[],
  hiddenIds: ReadonlySet<string>,
): string | null {
  const visible = entries.filter((entry) => !hiddenIds.has(entry.id))
  const scrollable = scrollArea.scrollHeight > scrollArea.clientHeight
  if (scrollable && scrollArea.scrollTop + scrollArea.clientHeight >= scrollArea.scrollHeight - 1) {
    return visible.at(-1)?.id ?? null
  }
  const line = scrollArea.getBoundingClientRect().top + ACTIVE_LINE
  let active: string | null = null
  for (const entry of visible) {
    const element = headingElement(editorElement, entry.id)
    if (!element) continue
    if (element.getBoundingClientRect().top > line) break
    active = entry.id
  }
  return active
}

/** The Outline's entries, kept current with edits and Tab swaps; an edit that leaves the headings alone keeps the same array. */
function useOutlineEntries(editor: RichEditor): OutlineEntry[] {
  const [entries, setEntries] = useState<OutlineEntry[]>(() => documentOutline(editor.prosemirrorState.doc))
  const contentSignal = useEditorContentPathSignal()

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const next = documentOutline(editor.prosemirrorState.doc)
      setEntries((current) => (sameOutline(current, next) ? current : next))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    schedule()
    const unsubscribe = editor.onChange(schedule)
    return () => {
      cancelAnimationFrame(frame)
      unsubscribe?.()
    }
  }, [contentSignal.version, editor])

  return entries
}

function useHiddenIds(editor: RichEditor, entries: readonly OutlineEntry[]): ReadonlySet<string> {
  // A new set on every fold or unfold, so it is what the hidden headings follow.
  const collapsedIds = useCollapsedHeadingIds(editor)
  return useMemo(() => {
    if (collapsedIds.size === 0 || entries.length === 0) return NO_IDS
    return collapsedSectionHiddenBlockIds(editor)
  }, [collapsedIds, editor, entries])
}

/**
 * The Outline of the Document in the Rich surface whose scroll area is
 * `scrollAreaRef`: what it lists, which Section is in view, whether the pane
 * has room for it, and the jump a click on an entry makes.
 */
export function useOutline(editor: RichEditor, scrollAreaRef: RefObject<HTMLElement | null>): Outline {
  const entries = useOutlineEntries(editor)
  const hiddenIds = useHiddenIds(editor, entries)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [room, setRoom] = useState({ fits: false, maxHeight: 0 })

  useEffect(() => {
    const scrollArea = scrollAreaRef.current
    if (!scrollArea || entries.length === 0) return
    let frame = 0
    const measure = () => {
      frame = 0
      const editorElement = editorBlockElement(editor)
      if (!editorElement) return
      const areaRect = scrollArea.getBoundingClientRect()
      const fits = editorElement.getBoundingClientRect().left - areaRect.left >= RAIL_GUTTER
      const maxHeight = Math.floor(scrollArea.clientHeight * MAX_HEIGHT_SHARE)
      setRoom((current) => (current.fits === fits && current.maxHeight === maxHeight ? current : { fits, maxHeight }))
      setActiveId(activeOutlineEntry(scrollArea, editorElement, entries, hiddenIds))
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    schedule()
    scrollArea.addEventListener('scroll', schedule, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    observer?.observe(scrollArea)
    return () => {
      cancelAnimationFrame(frame)
      scrollArea.removeEventListener('scroll', schedule)
      observer?.disconnect()
    }
  }, [editor, entries, hiddenIds, scrollAreaRef])

  const jumpTo = useCallback((id: string) => {
    const scrollArea = scrollAreaRef.current
    const editorElement = editorBlockElement(editor)
    if (!scrollArea || !editorElement) return
    expandSectionsHidingBlock(editor, id)
    // The caret goes with the jump, so the next key typed lands at the heading
    // rather than scrolling back to wherever the caret was left.
    const scrollTop = scrollArea.scrollTop
    editor.setTextCursorPosition(id, 'start')
    editor.focus()
    scrollArea.scrollTop = scrollTop
    const element = headingElement(editorElement, id)
    if (!element) return
    const offset = element.getBoundingClientRect().top - scrollArea.getBoundingClientRect().top
    scrollArea.scrollTo({
      top: scrollTop + offset - JUMP_OFFSET,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    })
  }, [editor, scrollAreaRef])

  return {
    entries,
    hiddenIds,
    activeId,
    shown: entries.length > 0 && room.fits,
    maxHeight: room.maxHeight,
    jumpTo,
  }
}

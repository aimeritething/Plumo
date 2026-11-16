import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from 'react'
import { flushSync } from 'react-dom'

/** How far the pointer travels with the button down before the press is a drag and not a click. */
const DRAG_THRESHOLD = 4
/** How long the Tab takes to glide from the hand into its place: the strip's own 200ms (ui/document-tabs). */
const SETTLE_MS = 200

/**
 * The place in the order for the Tab picked up at `from` once it has been
 * carried `dx` along the strip. `lefts` is every Tab's left edge as it was at
 * the pick-up. The Tabs are all one width, so a neighbour is passed once the
 * carried Tab has come half a place over it, going either way.
 */
export function dropIndex(lefts: number[], from: number, dx: number): number {
  if (lefts.length < 2) return from
  const step = lefts[1] - lefts[0]
  if (step <= 0) return from
  const place = Math.round((lefts[from] + dx - lefts[0]) / step)
  return Math.max(0, Math.min(lefts.length - 1, place))
}

/** How far the Tab at `index` stands aside while the one from `from` is over `to`: one place towards where it left. */
export function shiftFor(index: number, from: number, to: number, step: number): number {
  if (from < to && index > from && index <= to) return -step
  if (to < from && index >= to && index < from) return step
  return 0
}

export interface TabReorderHandlers {
  /** The carried Tab becomes the active one as it is picked up. */
  onActivate: (path: string) => void
  /** The Tab was let go at `index` in the order. Without it no Tab can be picked up. */
  onReorder?: (path: string, index: number) => void
}

/**
 * A Tab picked up and carried along the strip, the others making way as it
 * passes them. The returned handler goes on each Tab's `onPointerDown`.
 *
 * A press that travels 4px sideways is a drag; less is the click it always
 * was. The carried Tab stays under the hand exactly, kept inside the run of
 * Tabs, and its travel is written straight onto the Tabs' styles: nothing is
 * rendered again until it is let go. Let go, it glides into its place and
 * only then is the order changed, so the render that moves it finds every
 * Tab already drawn where it is going. Escape, or a cancelled pointer, puts
 * it back where it was picked up.
 */
export function useTabReorder(stripRef: RefObject<HTMLElement | null>, { onActivate, onReorder }: TabReorderHandlers) {
  const endCarry = useRef<(() => void) | null>(null)
  useEffect(() => () => endCarry.current?.(), [])

  return useCallback((event: ReactPointerEvent<HTMLElement>, path: string) => {
    const strip = stripRef.current
    if (!strip || !onReorder || event.button !== 0 || endCarry.current) return
    const tabs = Array.from(strip.querySelectorAll<HTMLElement>(':scope > [role="tab"]'))
    const held = event.currentTarget
    const from = tabs.indexOf(held)
    if (from === -1 || tabs.length < 2) return

    const lefts = tabs.map((tab) => tab.offsetLeft)
    const step = lefts[1] - lefts[0]
    const { pointerId, clientX: startX } = event
    const startScroll = strip.scrollLeft
    let dragging = false
    let to = from
    let settle: ReturnType<typeof setTimeout> | undefined

    const stopListening = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      window.removeEventListener('keydown', onKeyDown, true)
    }
    /** Everything the carry wrote on the strip and its Tabs, taken off at once. */
    const clear = () => {
      clearTimeout(settle)
      stopListening()
      delete strip.dataset.reordering
      delete held.dataset.dragging
      for (const tab of tabs) {
        tab.style.transform = ''
        tab.style.transition = ''
      }
      if (held.hasPointerCapture?.(pointerId)) held.releasePointerCapture(pointerId)
      endCarry.current = null
    }
    /** Let go: the hand's transition comes back, the Tab glides to `place`, and then `then` runs. */
    const settleAt = (place: number, then: () => void) => {
      stopListening()
      held.style.transition = ''
      held.style.transform = `translateX(${lefts[place] - lefts[from]}px)`
      for (const [index, tab] of tabs.entries()) {
        if (tab !== held) tab.style.transform = translate(shiftFor(index, from, place, step))
      }
      settle = setTimeout(() => {
        clear()
        then()
      }, SETTLE_MS)
    }

    function onMove(moved: PointerEvent) {
      if (moved.pointerId !== pointerId) return
      const travelled = moved.clientX - startX + strip!.scrollLeft - startScroll
      if (!dragging) {
        if (Math.abs(travelled) < DRAG_THRESHOLD) return
        dragging = true
        held.setPointerCapture?.(pointerId)
        strip!.dataset.reordering = ''
        held.dataset.dragging = ''
        // Under the hand exactly: only the others glide.
        held.style.transition = 'none'
        onActivate(path)
      }
      const dx = Math.max(lefts[0] - lefts[from], Math.min(lefts[lefts.length - 1] - lefts[from], travelled))
      to = dropIndex(lefts, from, dx)
      held.style.transform = `translateX(${dx}px)`
      for (const [index, tab] of tabs.entries()) {
        if (tab !== held) tab.style.transform = translate(shiftFor(index, from, to, step))
      }
    }
    function onUp(released: PointerEvent) {
      if (released.pointerId !== pointerId) return
      if (!dragging) return clear()
      settleAt(to, () => {
        // In one go with the styles coming off, so no frame shows the old order unshifted.
        if (to !== from) flushSync(() => onReorder!(path, to))
      })
    }
    function onCancel(cancelled: PointerEvent) {
      if (cancelled.pointerId !== pointerId) return
      if (dragging) settleAt(from, () => {})
      else clear()
    }
    function onKeyDown(key: KeyboardEvent) {
      if (key.key !== 'Escape' || !dragging) return
      key.preventDefault()
      key.stopPropagation()
      settleAt(from, () => {})
    }

    endCarry.current = clear
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    window.addEventListener('keydown', onKeyDown, true)
  }, [onActivate, onReorder, stripRef])
}

function translate(shift: number): string {
  return shift === 0 ? '' : `translateX(${shift}px)`
}

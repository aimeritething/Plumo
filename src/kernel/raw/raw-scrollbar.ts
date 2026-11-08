import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { SCROLLBAR_CLASS, SCROLLBAR_VERTICAL_CLASS, SCROLL_THUMB_CLASS } from '@/ui/scroll-area'

/*
 * Raw mode's scrollbar: the bar `ui/scroll-area.tsx` draws everywhere else,
 * drawn over CodeMirror's own scroller. A Base UI ScrollArea cannot wrap it,
 * since CodeMirror scrolls an element it makes itself (`view.scrollDOM`) and
 * Plumo reads and restores that element's scroll position, so this keeps the
 * scroller and only swaps the native bar for the same classes and the same
 * behaviour: shown while scrolling (`data-scrolling`, as Base UI sets it),
 * under the pointer or while held, faded out a moment after (the classes'),
 * the thumb dragged, the track clicked to jump, a wheel over the bar scrolling.
 */

/** Base UI's: how long after the last scroll event a scroll has ended. */
const SCROLL_TIMEOUT = 500
/** Base UI's shortest thumb. */
const MIN_THUMB = 16

interface Geometry {
  top: number
  clientHeight: number
  scrollHeight: number
  scrollTop: number
}

class RawScrollbar {
  private readonly bar: HTMLDivElement
  private readonly thumb: HTMLDivElement
  private scrollEndTimer: number | undefined
  private lastScrollTop: number
  /** Where on the thumb the pointer took hold, while dragging. */
  private dragOffset: number | null = null
  private thumbLength = 0
  private readonly view: EditorView

  constructor(view: EditorView) {
    this.view = view
    const doc = view.dom.ownerDocument
    this.bar = doc.createElement('div')
    this.bar.className = `${SCROLLBAR_CLASS} ${SCROLLBAR_VERTICAL_CLASS} absolute right-0`
    this.bar.dataset.slot = 'scroll-area-scrollbar'
    this.bar.dataset.orientation = 'vertical'
    this.bar.setAttribute('aria-hidden', 'true')
    this.thumb = doc.createElement('div')
    this.thumb.className = SCROLL_THUMB_CLASS
    this.thumb.dataset.slot = 'scroll-area-thumb'
    this.bar.append(this.thumb)
    view.dom.append(this.bar)

    this.lastScrollTop = view.scrollDOM.scrollTop
    view.scrollDOM.addEventListener('scroll', this.onScroll, { passive: true })
    this.bar.addEventListener('pointerdown', this.onPointerDown)
    this.bar.addEventListener('pointermove', this.onPointerMove)
    this.bar.addEventListener('pointerup', this.onPointerUp)
    this.bar.addEventListener('pointercancel', this.onPointerUp)
    this.bar.addEventListener('wheel', this.onWheel, { passive: false })
    this.requestLayout()
  }

  update(update: ViewUpdate) {
    if (update.geometryChanged || update.heightChanged || update.viewportChanged) this.requestLayout()
  }

  destroy() {
    window.clearTimeout(this.scrollEndTimer)
    this.view.scrollDOM.removeEventListener('scroll', this.onScroll)
    this.bar.remove()
  }

  private requestLayout() {
    this.view.requestMeasure({
      key: this,
      read: () => this.readGeometry(),
      write: (geometry) => this.layout(geometry),
    })
  }

  private readGeometry(): Geometry {
    const scroller = this.view.scrollDOM
    return {
      top: scroller.offsetTop,
      clientHeight: scroller.clientHeight,
      scrollHeight: scroller.scrollHeight,
      scrollTop: scroller.scrollTop,
    }
  }

  /** The track: the bar's height less its padding. */
  private trackLength(clientHeight: number): number {
    const style = getComputedStyle(this.bar)
    return clientHeight - parseFloat(style.paddingTop || '0') - parseFloat(style.paddingBottom || '0')
  }

  private layout({ top, clientHeight, scrollHeight, scrollTop }: Geometry) {
    this.bar.style.top = `${top}px`
    this.bar.style.height = `${clientHeight}px`
    const scrollable = scrollHeight - clientHeight > 1
    this.thumb.style.display = scrollable ? '' : 'none'
    if (!scrollable) return
    const track = this.trackLength(clientHeight)
    this.thumbLength = Math.max(MIN_THUMB, Math.round((track * clientHeight) / scrollHeight))
    const offset = ((track - this.thumbLength) * scrollTop) / (scrollHeight - clientHeight)
    this.thumb.style.flex = 'none'
    this.thumb.style.width = '100%'
    this.thumb.style.height = `${this.thumbLength}px`
    this.thumb.style.transform = `translate3d(0, ${offset}px, 0)`
  }

  private readonly onScroll = () => {
    const geometry = this.readGeometry()
    this.layout(geometry)
    if (geometry.scrollTop === this.lastScrollTop) return
    this.lastScrollTop = geometry.scrollTop
    this.bar.dataset.scrolling = ''
    window.clearTimeout(this.scrollEndTimer)
    this.scrollEndTimer = window.setTimeout(() => {
      delete this.bar.dataset.scrolling
    }, SCROLL_TIMEOUT)
  }

  private readonly onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return
    // Neither a text selection nor the editor's focus moves.
    event.preventDefault()
    this.bar.setPointerCapture(event.pointerId)
    const thumbBox = this.thumb.getBoundingClientRect()
    const onThumb = event.clientY >= thumbBox.top && event.clientY <= thumbBox.bottom
    // On the track, the thumb's middle jumps to the pointer, as Base UI's does.
    this.dragOffset = onThumb ? event.clientY - thumbBox.top : this.thumbLength / 2
    this.scrollToPointer(event.clientY)
  }

  private readonly onPointerMove = (event: PointerEvent) => {
    if (this.dragOffset !== null) this.scrollToPointer(event.clientY)
  }

  private readonly onPointerUp = (event: PointerEvent) => {
    if (this.dragOffset === null) return
    this.dragOffset = null
    if (this.bar.hasPointerCapture(event.pointerId)) this.bar.releasePointerCapture(event.pointerId)
  }

  private readonly onWheel = (event: WheelEvent) => {
    event.preventDefault()
    this.view.scrollDOM.scrollBy({ left: event.deltaX, top: event.deltaY })
  }

  private scrollToPointer(clientY: number) {
    const scroller = this.view.scrollDOM
    const { clientHeight, scrollHeight } = scroller
    const track = this.trackLength(clientHeight)
    const room = track - this.thumbLength
    if (room <= 0 || this.dragOffset === null) return
    const trackTop = this.bar.getBoundingClientRect().top + parseFloat(getComputedStyle(this.bar).paddingTop || '0')
    const ratio = Math.min(Math.max((clientY - trackTop - this.dragOffset) / room, 0), 1)
    scroller.scrollTop = ratio * (scrollHeight - clientHeight)
  }
}

/** The native bar hidden on the scroller, Plumo's drawn over it. */
const hideNativeScrollbar = EditorView.baseTheme({
  '.cm-scroller': { scrollbarWidth: 'none' },
  '.cm-scroller::-webkit-scrollbar': { display: 'none' },
})

export function rawScrollbar(): Extension {
  return [ViewPlugin.fromClass(RawScrollbar), hideNativeScrollbar]
}

import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode, type TransitionEvent } from 'react'
import { clampSidebarWidth } from '@/session/session-schema'

const KEYBOARD_RESIZE_STEP = 16

interface SidebarProps {
  collapsed: boolean
  /** Whether a change of `collapsed` slides (a toggle) or snaps (a restored Session). */
  slides: boolean
  width: number
  onWidthChange: (width: number) => void
  children?: ReactNode
}

/**
 * The sidebar: the left of the window's two panes, on its own ground, with a
 * 1px line between it and the editor. Its 52px top row is the tab bar's
 * height, so the traffic lights sit at one y in both states; it drags the
 * window and leaves the lights and the sidebar icon (the shell's, laid over
 * it) their room. The groups (Pinned, the Explorer) stack below it. Its right
 * edge resizes it; the width (the line included) reaches the Session once the
 * drag ends.
 *
 * It sits in a slot whose width is the sidebar's, or 0 collapsed. The slot's
 * width is what slides; the sidebar keeps its own width and rides the slot's
 * right edge, so it slides out past the window's left edge rather than being
 * squeezed. Collapsed, it stays mounted (inert) until the slide is over.
 */
export function Sidebar({ collapsed, slides, width, onWidthChange, children }: SidebarProps) {
  const { liveWidth, resizerProps } = useEdgeResize(width, onWidthChange)
  const { mounted, onTransitionEnd } = useSlideOut(collapsed, slides)
  const onClickCapture = useOneOpenPerDoubleClick()
  const shownWidth = liveWidth ?? width
  const resizing = liveWidth !== null || undefined

  return (
    <div
      className="sidebar-slide flex flex-none justify-end data-resizing:transition-none"
      data-testid="sidebar-slot"
      data-resizing={resizing}
      style={{ width: collapsed ? 0 : shownWidth }}
      onTransitionEnd={onTransitionEnd}
    >
      {mounted && (
        <aside
          className="relative flex min-h-0 flex-none flex-col border-r border-border-default bg-surface-app px-3 pb-2 text-sm leading-normal font-medium text-text-secondary select-none data-resizing:cursor-col-resize"
          data-testid="sidebar"
          data-resizing={resizing}
          inert={collapsed}
          style={{ width: shownWidth }}
          onClickCapture={onClickCapture}
        >
          {/* The traffic lights' row; the whole row drags the window. */}
          <div className="-mx-3 mb-1 h-13 flex-none" data-testid="sidebar-top" data-tauri-drag-region />
          {children}
          {/* The drag edge: a 6px hit area over the sidebar's right edge, nothing drawn. */}
          <div
            className="absolute inset-y-0 -right-0.75 z-raised w-1.5 cursor-col-resize outline-none focus-visible:bg-state-focus-ring"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuenow={width}
            tabIndex={0}
            {...resizerProps}
          />
        </aside>
      )}
    </div>
  )
}

/**
 * Whether the sidebar is in the DOM. Shown, it is. A collapse that slides
 * keeps it until the slot's width transition ends shut; one that snaps (a
 * restored Session) drops it at once. `shut` is where the slot's last slide
 * ended, so a slide cut short by the opposite one counts only once that one
 * ends.
 */
function useSlideOut(collapsed: boolean, slides: boolean) {
  const [shut, setShut] = useState(collapsed)

  const onTransitionEnd = useCallback((event: TransitionEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && event.propertyName === 'width') setShut(collapsed)
  }, [collapsed])

  return { mounted: !collapsed || (slides && !shut), onTransitionEnd }
}

/**
 * A double-click that opens a Tab or a folder is one open. By the second
 * click the sidebar may have moved under the pointer (a new Document's row
 * appearing, its folder opening), so that click could land on another row,
 * make a second Document from the Explorer's "+", or shut the folder it just
 * opened. It is dropped, wherever it lands. A second click after anything
 * else (a folder's caret) goes through.
 */
function useOneOpenPerDoubleClick() {
  const opened = useRef(false)

  return useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.detail <= 1) {
      // The nearest button or marked control decides, so a caret inside a marked row is not one.
      const control = event.target instanceof Element ? event.target.closest('button, [data-one-open]') : null
      opened.current = control?.hasAttribute('data-one-open') ?? false
      return
    }
    if (opened.current) event.stopPropagation()
  }, [])
}

/**
 * The drag on the sidebar's edge. The width follows the pointer through
 * local state and is handed on once, at release, so the Session is written
 * once per drag rather than once per pointer move.
 */
function useEdgeResize(width: number, onWidthChange: (width: number) => void) {
  const [drag, setDrag] = useState<{ originX: number; originWidth: number; width: number } | null>(null)

  const onPointerDown = useCallback((event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setDrag({ originX: event.clientX, originWidth: width, width })
  }, [width])

  const onPointerMove = useCallback((event: PointerEvent<HTMLDivElement>) => {
    setDrag((prev) => (prev ? { ...prev, width: clampSidebarWidth(prev.originWidth + event.clientX - prev.originX) } : prev))
  }, [])

  const onPointerUp = useCallback((event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    if (drag) onWidthChange(drag.width)
    setDrag(null)
  }, [drag, onWidthChange])

  const onKeyDown = useCallback((event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' ? KEYBOARD_RESIZE_STEP : event.key === 'ArrowLeft' ? -KEYBOARD_RESIZE_STEP : 0
    if (step === 0) return
    event.preventDefault()
    onWidthChange(clampSidebarWidth(width + step))
  }, [onWidthChange, width])

  return {
    liveWidth: drag?.width ?? null,
    resizerProps: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onKeyDown },
  }
}

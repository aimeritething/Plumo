import { useCallback, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react'
import { clampSidebarWidth } from '@/session/session-schema'
import { SidebarToggle, TrafficLightsRoom } from './sidebar-toggle'

const KEYBOARD_RESIZE_STEP = 16

interface SidebarProps {
  width: number
  onWidthChange: (width: number) => void
  onToggle: () => void
  children?: ReactNode
}

/**
 * The sidebar: the left of the window's two panes, on its own ground, with a
 * 1px line between it and the editor. Its 52px top row is the tab bar's
 * height, so the traffic lights sit at one y in both states; it drags the
 * window and carries the collapse icon right of the lights. The groups (Pinned,
 * the Explorer) stack below it. Its right edge resizes it; the width
 * (the line included) reaches the Session once the drag ends.
 */
export function Sidebar({ width, onWidthChange, onToggle, children }: SidebarProps) {
  const { liveWidth, resizerProps } = useEdgeResize(width, onWidthChange)
  const onClickCapture = useOneOpenPerDoubleClick()

  return (
    <aside
      className="relative flex min-h-0 flex-none flex-col border-r border-border-default bg-surface-app px-3 pb-2 text-sm leading-normal font-medium text-text-secondary select-none data-resizing:cursor-col-resize"
      data-testid="sidebar"
      data-resizing={liveWidth !== null || undefined}
      style={{ width: liveWidth ?? width }}
      onClickCapture={onClickCapture}
    >
      {/* The traffic lights' row; the whole row drags the window, the icon after the lights does not. */}
      <div className="-mx-3 mb-1 flex h-13 flex-none items-center gap-3" data-testid="sidebar-top" data-tauri-drag-region>
        <TrafficLightsRoom />
        <SidebarToggle collapsed={false} onToggle={onToggle} />
      </div>
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
  )
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

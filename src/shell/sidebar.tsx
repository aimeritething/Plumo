import { useCallback, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode, type TransitionEvent } from 'react'
import { clampSidebarWidth } from '@/session/session-schema'
import { Sidebar as SidebarFrame, useSidebar } from '@/ui/sidebar'

const KEYBOARD_RESIZE_STEP = 16

interface SidebarProps {
  /** Whether a change of the provider's `open` slides (a toggle) or snaps (a restored Session). */
  slides: boolean
  /** The Session's width, the one the provider's `--sidebar-width` carries. */
  width: number
  onWidthChange: (width: number) => void
  children?: ReactNode
}

/**
 * The sidebar: the left of the window's two panes, shadcn's Sidebar inside
 * the shell's `SidebarProvider`, which says whether it is open and how wide
 * it is. Its 52px top row is the tab bar's height, so the traffic lights sit
 * at one y in both states; it drags the window and leaves the lights and the
 * sidebar icon (the shell's, laid over it) their room. The groups (Pinned,
 * the Explorer) stack below it. Its right edge resizes it; the width (the
 * line included) reaches the Session once the drag ends, and until then the
 * drag sets `--sidebar-width` on the sidebar alone.
 *
 * Collapsed, the sidebar keeps its width and slides out past the window's
 * left edge rather than being squeezed. It is inert at once, and its
 * contents stay mounted until the slide is over.
 */
export function Sidebar({ slides, width, onWidthChange, children }: SidebarProps) {
  const collapsed = !useSidebar().open
  const { liveWidth, resizerProps } = useEdgeResize(width, onWidthChange)
  const { mounted, onTransitionEnd } = useSlideOut(collapsed, slides)
  const resizing = liveWidth !== null || undefined

  return (
    <SidebarFrame
      className="data-resizing:transition-none"
      // The sidebar, line included, counts as there while its contents are.
      data-testid={mounted ? 'sidebar' : undefined}
      data-resizing={resizing}
      inert={collapsed}
      style={liveWidth === null ? undefined : { '--sidebar-width': `${liveWidth}px` } as CSSProperties}
      onTransitionEnd={onTransitionEnd}
    >
      {mounted && (
        <aside
          className="relative flex min-h-0 flex-1 flex-col px-3 pb-2 text-sm leading-normal select-none data-resizing:cursor-col-resize"
          data-resizing={resizing}
        >
          {/* The traffic lights' row; the whole row drags the window. */}
          <div className="-mx-3 mb-1 h-13 flex-none" data-testid="sidebar-top" data-tauri-drag-region />
          {children}
          {/* The drag edge: a 6px hit area over the sidebar's right edge, nothing drawn. */}
          <div
            className="absolute inset-y-0 -right-0.75 z-raised w-1.5 cursor-col-resize outline-none focus-visible:bg-ring"
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize sidebar"
            aria-valuenow={width}
            tabIndex={0}
            {...resizerProps}
          />
        </aside>
      )}
    </SidebarFrame>
  )
}

/**
 * Whether the sidebar's contents are in the DOM. Shown, they are. A collapse
 * that slides keeps them until the sidebar's margin transition ends shut; one
 * that snaps (a restored Session) drops them at once. `shut` is where the
 * last slide ended, so a slide cut short by the opposite one counts only once
 * that one ends.
 */
function useSlideOut(collapsed: boolean, slides: boolean) {
  const [shut, setShut] = useState(collapsed)

  const onTransitionEnd = useCallback((event: TransitionEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && event.propertyName === 'margin-left') setShut(collapsed)
  }, [collapsed])

  return { mounted: !collapsed || (slides && !shut), onTransitionEnd }
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

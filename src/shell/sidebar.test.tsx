import type { CSSProperties, ReactNode } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './sidebar'
import { TooltipProvider } from '@/ui/tooltip'
import { SidebarProvider } from '@/ui/sidebar'

// The shell's provider: open state and the Session's width, as app.tsx passes them.
function Shell({ collapsed = false, width = 260, children }: { collapsed?: boolean; width?: number; children: ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider open={!collapsed} data-testid="shell" style={{ '--sidebar-width': `${width}px` } as CSSProperties}>
        {children}
      </SidebarProvider>
    </TooltipProvider>
  )
}

function renderSidebar(width: number, onWidthChange = vi.fn()) {
  render(
    <Shell width={width}>
      <Sidebar slides={false} width={width} onWidthChange={onWidthChange}><div>rows</div></Sidebar>
    </Shell>,
  )
  return { onWidthChange }
}

function sidebarAt(collapsed: boolean, slides: boolean) {
  return <Shell collapsed={collapsed}><Sidebar slides={slides} width={260} onWidthChange={vi.fn()}><div>rows</div></Sidebar></Shell>
}

/** shadcn's container: it carries the width, the slide and `inert`, and stays mounted collapsed. */
function container() {
  return document.querySelector<HTMLElement>('[data-slot="sidebar-container"]')!
}

/** The width the sidebar is drawn at: its own `--sidebar-width` during a drag, the provider's otherwise. */
function drawnWidth() {
  return container().style.getPropertyValue('--sidebar-width') || screen.getByTestId('shell').style.getPropertyValue('--sidebar-width')
}

describe('Sidebar', () => {
  it('is as wide as the Session says, through the provider\'s --sidebar-width', () => {
    renderSidebar(300)

    expect(drawnWidth()).toBe('300px')
    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute('data-state', 'expanded')
  })

  it('slides out: collapsed, it goes offcanvas and stays mounted, inert, until its margin transition ends', () => {
    const { rerender } = render(sidebarAt(false, true))

    rerender(sidebarAt(true, true))
    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute('data-collapsible', 'offcanvas')
    expect(container()).toHaveAttribute('inert')
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()

    // A row's own transition ending changes nothing; the sidebar's margin does.
    fireEvent.transitionEnd(screen.getByText('rows'), { propertyName: 'margin-left' })
    fireEvent.transitionEnd(container(), { propertyName: 'width' })
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    fireEvent.transitionEnd(container(), { propertyName: 'margin-left' })
    expect(screen.queryByTestId('sidebar')).toBeNull()

    rerender(sidebarAt(false, true))
    expect(container()).not.toHaveAttribute('inert')
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute('data-collapsible', '')
  })

  it('snaps shut on a collapse that does not slide, as a restored Session', () => {
    const { rerender } = render(sidebarAt(false, false))

    rerender(sidebarAt(true, false))
    expect(screen.queryByTestId('sidebar')).toBeNull()
    expect(document.querySelector('[data-slot="sidebar"]')).toHaveAttribute('data-state', 'collapsed')
  })

  it('follows the pointer while its edge is dragged and reports the width once at release', () => {
    const { onWidthChange } = renderSidebar(260)
    const edge = screen.getByRole('separator', { name: 'Resize sidebar' })

    fireEvent.pointerDown(edge, { pointerId: 1, clientX: 260, button: 0 })
    fireEvent.pointerMove(edge, { pointerId: 1, clientX: 300 })
    expect(drawnWidth()).toBe('300px')
    expect(container()).toHaveAttribute('data-resizing')
    expect(onWidthChange).not.toHaveBeenCalled()
    fireEvent.pointerMove(edge, { pointerId: 1, clientX: 340 })
    fireEvent.pointerUp(edge, { pointerId: 1, clientX: 340 })

    expect(onWidthChange).toHaveBeenCalledExactlyOnceWith(340)
    expect(container()).not.toHaveAttribute('data-resizing')
  })

  it('stays inside the sidebar range while dragged', () => {
    renderSidebar(260)
    const edge = screen.getByRole('separator', { name: 'Resize sidebar' })

    fireEvent.pointerDown(edge, { pointerId: 1, clientX: 260, button: 0 })
    fireEvent.pointerMove(edge, { pointerId: 1, clientX: 900 })
    expect(drawnWidth()).toBe('480px')
  })

  it('resizes by keyboard from the edge as well', () => {
    const { onWidthChange } = renderSidebar(260)
    const edge = screen.getByRole('separator', { name: 'Resize sidebar' })

    fireEvent.keyDown(edge, { key: 'ArrowRight' })
    expect(onWidthChange).toHaveBeenCalledWith(276)
    fireEvent.keyDown(edge, { key: 'ArrowLeft' })
    expect(onWidthChange).toHaveBeenCalledWith(244)
  })

  it('lets every click through to its control, however quickly it follows another', () => {
    const onFirst = vi.fn()
    const onSecond = vi.fn()
    render(
      <Shell>
        <Sidebar slides={false} width={260} onWidthChange={vi.fn()}>
          <div onClick={onFirst}>Projects</div>
          <div onClick={onSecond}>Notes</div>
        </Sidebar>
      </Shell>,
    )

    fireEvent.click(screen.getByText('Projects'), { detail: 1 })
    fireEvent.click(screen.getByText('Notes'), { detail: 2 })
    fireEvent.click(screen.getByText('Projects'), { detail: 3 })

    expect(onFirst).toHaveBeenCalledTimes(2)
    expect(onSecond).toHaveBeenCalledTimes(1)
  })

  it('keeps no shortcut of its own: ⌘B is not the sidebar\'s, app-command-manifest.json owns shortcuts', () => {
    const onOpenChange = vi.fn()
    render(
      <TooltipProvider>
        <SidebarProvider open onOpenChange={onOpenChange}>
          <Sidebar slides={false} width={260} onWidthChange={vi.fn()}><div>rows</div></Sidebar>
        </SidebarProvider>
      </TooltipProvider>,
    )

    fireEvent.keyDown(window, { key: 'b', metaKey: true })
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

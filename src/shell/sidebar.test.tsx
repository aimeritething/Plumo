import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './sidebar'
import { TooltipProvider } from '@/ui/tooltip'

function renderSidebar(width: number, onWidthChange = vi.fn()) {
  render(
    <TooltipProvider>
      <Sidebar collapsed={false} slides={false} width={width} onWidthChange={onWidthChange}><div>rows</div></Sidebar>
    </TooltipProvider>,
  )
  return { onWidthChange }
}

function sidebarAt(collapsed: boolean, slides: boolean) {
  return <Sidebar collapsed={collapsed} slides={slides} width={260} onWidthChange={vi.fn()}><div>rows</div></Sidebar>
}

describe('Sidebar', () => {
  it('is as wide as the Session says, and so is its slot', () => {
    renderSidebar(300)

    expect(screen.getByTestId('sidebar').style.width).toBe('300px')
    expect(screen.getByTestId('sidebar-slot').style.width).toBe('300px')
  })

  it('slides out: collapsed, its slot closes and it stays, inert, until the slot\'s width transition ends', () => {
    const { rerender } = render(sidebarAt(false, true))

    rerender(sidebarAt(true, true))
    const slot = screen.getByTestId('sidebar-slot')
    expect(slot.style.width).toBe('0px')
    expect(screen.getByTestId('sidebar')).toHaveAttribute('inert')

    // A row's own transition ending changes nothing; the slot's width does.
    fireEvent.transitionEnd(screen.getByText('rows'), { propertyName: 'width' })
    fireEvent.transitionEnd(slot, { propertyName: 'padding-left' })
    expect(screen.getByTestId('sidebar')).toBeInTheDocument()
    fireEvent.transitionEnd(slot, { propertyName: 'width' })
    expect(screen.queryByTestId('sidebar')).toBeNull()

    rerender(sidebarAt(false, true))
    expect(screen.getByTestId('sidebar')).not.toHaveAttribute('inert')
    expect(slot.style.width).toBe('260px')
  })

  it('snaps shut on a collapse that does not slide, as a restored Session', () => {
    const { rerender } = render(sidebarAt(false, false))

    rerender(sidebarAt(true, false))
    expect(screen.queryByTestId('sidebar')).toBeNull()
    expect(screen.getByTestId('sidebar-slot').style.width).toBe('0px')
  })

  it('follows the pointer while its edge is dragged and reports the width once at release', () => {
    const { onWidthChange } = renderSidebar(260)
    const edge = screen.getByRole('separator', { name: 'Resize sidebar' })

    fireEvent.pointerDown(edge, { pointerId: 1, clientX: 260, button: 0 })
    fireEvent.pointerMove(edge, { pointerId: 1, clientX: 300 })
    expect(screen.getByTestId('sidebar').style.width).toBe('300px')
    expect(onWidthChange).not.toHaveBeenCalled()
    fireEvent.pointerMove(edge, { pointerId: 1, clientX: 340 })
    fireEvent.pointerUp(edge, { pointerId: 1, clientX: 340 })

    expect(onWidthChange).toHaveBeenCalledExactlyOnceWith(340)
  })

  it('stays inside the sidebar range while dragged', () => {
    renderSidebar(260)
    const edge = screen.getByRole('separator', { name: 'Resize sidebar' })

    fireEvent.pointerDown(edge, { pointerId: 1, clientX: 260, button: 0 })
    fireEvent.pointerMove(edge, { pointerId: 1, clientX: 900 })
    expect(screen.getByTestId('sidebar').style.width).toBe('480px')
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
      <TooltipProvider>
        <Sidebar collapsed={false} slides={false} width={260} onWidthChange={vi.fn()}>
          <div onClick={onFirst}>Projects</div>
          <div onClick={onSecond}>Notes</div>
        </Sidebar>
      </TooltipProvider>,
    )

    fireEvent.click(screen.getByText('Projects'), { detail: 1 })
    fireEvent.click(screen.getByText('Notes'), { detail: 2 })
    fireEvent.click(screen.getByText('Projects'), { detail: 3 })

    expect(onFirst).toHaveBeenCalledTimes(2)
    expect(onSecond).toHaveBeenCalledTimes(1)
  })
})

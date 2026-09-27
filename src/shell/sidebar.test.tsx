import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Sidebar } from './sidebar'
import { ONE_OPEN_PER_DOUBLE_CLICK_PROPS } from './sidebar-row'
import { TooltipProvider } from '@/ui/tooltip'

function renderSidebar(width: number, onWidthChange = vi.fn(), onToggle = vi.fn()) {
  render(
    <TooltipProvider>
      <Sidebar width={width} onWidthChange={onWidthChange} onToggle={onToggle}><div>rows</div></Sidebar>
    </TooltipProvider>,
  )
  return { onWidthChange, onToggle }
}

describe('Sidebar', () => {
  it('is as wide as the Session says and collapses from the icon on its top row', () => {
    const { onToggle } = renderSidebar(300)

    expect(screen.getByTestId('sidebar').style.width).toBe('300px')
    fireEvent.click(screen.getByRole('button', { name: 'Hide sidebar' }))
    expect(onToggle).toHaveBeenCalledTimes(1)
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

  describe('a double-click that opens a Tab or a folder', () => {
    function renderRows() {
      const onOpen = vi.fn()
      const onOther = vi.fn()
      render(
        <TooltipProvider>
          <Sidebar width={260} onWidthChange={vi.fn()} onToggle={vi.fn()}>
            <button type="button" onClick={onOpen} {...ONE_OPEN_PER_DOUBLE_CLICK_PROPS}>opens a Tab</button>
            <button type="button" onClick={onOther}>other</button>
          </Sidebar>
        </TooltipProvider>,
      )
      return { onOpen, onOther, opens: screen.getByText('opens a Tab'), other: screen.getByText('other') }
    }

    it('drops the second click, wherever the moved sidebar puts it', () => {
      const { onOpen, onOther, opens, other } = renderRows()

      fireEvent.click(opens, { detail: 1 })
      fireEvent.click(other, { detail: 2 })
      fireEvent.click(opens, { detail: 3 })

      expect(onOpen).toHaveBeenCalledTimes(1)
      expect(onOther).not.toHaveBeenCalled()
    })

    it('lets a second click through after a click on anything else', () => {
      const { onOther, other } = renderRows()

      fireEvent.click(other, { detail: 1 })
      fireEvent.click(other, { detail: 2 })

      expect(onOther).toHaveBeenCalledTimes(2)
    })

    it('takes the next single click as usual', () => {
      const { onOpen, onOther, opens, other } = renderRows()

      fireEvent.click(opens, { detail: 1 })
      fireEvent.click(other, { detail: 2 })
      fireEvent.click(other, { detail: 1 })
      // A click from the keyboard has no count.
      fireEvent.click(opens, { detail: 0 })

      expect(onOther).toHaveBeenCalledTimes(1)
      expect(onOpen).toHaveBeenCalledTimes(2)
    })

    it('lets a second click through on a plain button inside a marked row, as a folder\'s caret', () => {
      const onRow = vi.fn()
      const onCaret = vi.fn()
      render(
        <TooltipProvider>
          <Sidebar width={260} onWidthChange={vi.fn()} onToggle={vi.fn()}>
            <div onClick={onRow} {...ONE_OPEN_PER_DOUBLE_CLICK_PROPS}>
              <button type="button" onClick={(event) => { event.stopPropagation(); onCaret() }}>caret</button>
              <span>folder</span>
            </div>
          </Sidebar>
        </TooltipProvider>,
      )

      fireEvent.click(screen.getByText('caret'), { detail: 1 })
      fireEvent.click(screen.getByText('caret'), { detail: 2 })
      fireEvent.click(screen.getByText('folder'), { detail: 1 })
      fireEvent.click(screen.getByText('folder'), { detail: 2 })

      expect(onCaret).toHaveBeenCalledTimes(2)
      expect(onRow).toHaveBeenCalledTimes(1)
    })
  })
})

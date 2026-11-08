import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SidebarTestProvider } from '@/ui/sidebar.test-utils'
import { Pinned, PINNED_DRAG_MIME_TYPE, type PinnedProps } from './pinned'
import { movePinned } from './pinned-list'

const A = '/Notes/Reading list.md'
const B = '/Notes/Everything.md'
const LAKE = '/Notes/images/lake.png'

function renderPinned(overrides: Partial<PinnedProps> = {}) {
  const props: PinnedProps = {
    paths: [A, B, LAKE],
    activeTabPath: null,
    collapsed: false,
    onToggleCollapsed: vi.fn(),
    onOpen: vi.fn(),
    onUnpin: vi.fn(),
    onDuplicate: vi.fn(),
    onMove: vi.fn(),
    ...overrides,
  }
  const view = render(<Pinned {...props} />, { wrapper: SidebarTestProvider })
  return { ...props, rerender: (next: Partial<PinnedProps>) => view.rerender(<Pinned {...props} {...next} />) }
}

const row = (path: string) => screen.getByTestId(`pinned-row:${path}`)

/** A DataTransfer stand-in: jsdom has none. */
function dataTransfer() {
  const data = new Map<string, string>()
  return {
    effectAllowed: 'all',
    dropEffect: 'none',
    setData: (type: string, value: string) => data.set(type, value),
    getData: (type: string) => data.get(type) ?? '',
    get types() { return [...data.keys()] },
  }
}

/** A drag event at `clientY`, over a row whose box is 0–32px tall. */
function dragAt(target: Element, type: 'dragOver' | 'drop', clientY: number, transfer: ReturnType<typeof dataTransfer>) {
  vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 0, height: 32, bottom: 32, left: 0, right: 200, width: 200, x: 0, y: 0, toJSON: () => ({}) })
  const event = createEvent[type](target, { dataTransfer: transfer })
  Object.defineProperty(event, 'clientY', { value: clientY })
  fireEvent(target, event)
}

describe('Pinned', () => {
  it('is not rendered with nothing pinned', () => {
    renderPinned({ paths: [] })
    expect(screen.queryByTestId('pinned')).toBeNull()
  })

  it('lists the pins under the Pinned label, in order, with the Explorer\'s icons', () => {
    renderPinned()

    expect(screen.getByTestId('pinned-toggle')).toHaveTextContent('Pinned')
    const list = screen.getByRole('list', { name: 'Pinned' })
    expect(within(list).getAllByRole('button').map((button) => button.textContent)).toEqual(['Reading list.md', 'Everything.md', 'lake.png'])
  })

  it('marks the row whose file is the active Tab as current', () => {
    renderPinned({ activeTabPath: B })

    expect(row(B)).toHaveAttribute('data-active')
    expect(row(B)).toHaveAttribute('aria-current', 'true')
    expect(row(A)).not.toHaveAttribute('data-active')
    expect(row(A)).not.toHaveAttribute('aria-current')
  })

  // A button: Tab reaches it, and Enter and Space click it.
  it('opens a row\'s file from its button', () => {
    const { onOpen } = renderPinned()

    expect(row(A).tagName).toBe('BUTTON')
    expect(row(A)).not.toHaveAttribute('tabindex', '-1')
    fireEvent.click(row(A))
    expect(onOpen.mock.calls).toEqual([[A]])
  })

  it('names the parent folder of two pins that share a name', () => {
    renderPinned({ paths: [A, '/Notes/Archive/Reading list.md', B] })

    expect(within(row(A)).getByTestId('pinned-parent')).toHaveTextContent('Notes')
    expect(within(row('/Notes/Archive/Reading list.md')).getByTestId('pinned-parent')).toHaveTextContent('Archive')
    expect(within(row(B)).queryByTestId('pinned-parent')).toBeNull()
  })

  it('folds away under its label, the caret showing only on hover or focus', () => {
    const { onToggleCollapsed, rerender } = renderPinned()
    const toggle = screen.getByTestId('pinned-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle).toHaveClass('[&>svg]:opacity-0', 'group-hover/sidebar-group:[&>svg]:opacity-100')
    expect(screen.getByTestId('pinned-caret').parentElement).toBe(toggle)

    fireEvent.click(toggle)
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)

    rerender({ collapsed: true })
    expect(screen.getByTestId('pinned-toggle')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('unpins from a row\'s context menu', async () => {
    const { onUnpin } = renderPinned()

    fireEvent.contextMenu(row(B), { button: 2, clientX: 10, clientY: 10 })
    const menu = await screen.findByTestId('pinned-menu')
    fireEvent.click(within(menu).getByText('Unpin'))
    await waitFor(() => expect(onUnpin).toHaveBeenCalledWith(B))
  })

  it('puts Unpin first and Duplicate after it, which duplicates the row\'s file', async () => {
    const { onDuplicate } = renderPinned()

    fireEvent.contextMenu(row(LAKE), { button: 2, clientX: 10, clientY: 10 })
    const menu = await screen.findByTestId('pinned-menu')
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Unpin', 'Duplicate'])
    fireEvent.click(within(menu).getByText('Duplicate'))
    await waitFor(() => expect(onDuplicate).toHaveBeenCalledWith(LAKE))
  })

  // The only way to reorder without a pointer (ADR-0013): it stays on the focused row's button.
  it('reorders the focused row with ⌥↑ and ⌥↓, and leaves a plain arrow alone', () => {
    const { onMove, onOpen } = renderPinned()

    row(LAKE).focus()
    expect(row(LAKE)).toHaveFocus()
    fireEvent.keyDown(row(LAKE), { key: 'ArrowUp', altKey: true })
    fireEvent.keyDown(row(A), { key: 'ArrowDown', altKey: true })
    fireEvent.keyDown(row(B), { key: 'ArrowDown', altKey: true })
    fireEvent.keyDown(row(A), { key: 'ArrowUp', altKey: true })
    fireEvent.keyDown(row(A), { key: 'ArrowDown' })
    expect(onMove.mock.calls).toEqual([[LAKE, B], [A, LAKE], [B, null]])
    expect(onOpen).not.toHaveBeenCalled()
  })

  // React reorders the rows by moving their elements, and moving the focused
  // one drops its focus to the body (jsdom does this as the browsers do); the
  // moved row must have it back, through a real re-render of the list.
  it('keeps the focus on the moved row, so ⌥↑ and ⌥↓ can be pressed again and again', () => {
    const C = '/Notes/Ideas.md'
    function MovablePinned() {
      const [paths, setPaths] = useState<readonly string[]>([A, B, LAKE, C])
      return (
        <Pinned
          paths={paths}
          activeTabPath={null}
          collapsed={false}
          onToggleCollapsed={vi.fn()}
          onOpen={vi.fn()}
          onUnpin={vi.fn()}
          onDuplicate={vi.fn()}
          onMove={(path, before) => setPaths((current) => movePinned(current, path, before))}
        />
      )
    }
    render(<MovablePinned />, { wrapper: SidebarTestProvider })
    const order = () => screen.getAllByTestId('pinned-name').map((name) => name.textContent)
    const press = (key: 'ArrowUp' | 'ArrowDown') => fireEvent.keyDown(document.activeElement!, { key, altKey: true })

    row(A).focus()
    press('ArrowDown')
    press('ArrowDown')
    press('ArrowDown')
    expect(order()).toEqual(['Everything.md', 'lake.png', 'Ideas.md', 'Reading list.md'])
    expect(row(A)).toHaveFocus()

    press('ArrowUp')
    press('ArrowUp')
    press('ArrowUp')
    expect(order()).toEqual(['Reading list.md', 'Everything.md', 'lake.png', 'Ideas.md'])
    expect(row(A)).toHaveFocus()

    row(LAKE).focus()
    press('ArrowUp')
    press('ArrowDown')
    press('ArrowDown')
    expect(order()).toEqual(['Reading list.md', 'Everything.md', 'Ideas.md', 'lake.png'])
    expect(row(LAKE)).toHaveFocus()
  })

  it('lets the name take the row\'s room, and the parent hint shrink with an ellipsis instead of pushing it out', () => {
    renderPinned({ paths: [A, '/Notes/A very long archive folder name/Reading list.md'] })

    const name = within(row(A)).getByTestId('pinned-name')
    const hint = within(row(A)).getByTestId('pinned-parent')
    expect(name).toHaveClass('flex-1')
    expect(hint).toHaveClass('flex-initial')
    expect(hint).not.toHaveClass('flex-none')
  })

  describe('the drag', () => {
    it('drops a row before the row under the upper half of the pointer, with a line where it will land', () => {
      const { onMove } = renderPinned()
      const transfer = dataTransfer()

      fireEvent.dragStart(row(LAKE), { dataTransfer: transfer })
      expect(transfer.getData(PINNED_DRAG_MIME_TYPE)).toBe(LAKE)
      dragAt(row(A), 'dragOver', 5, transfer)
      expect(within(row(A).parentElement!).getByTestId('pinned-drop-indicator')).toHaveAttribute('data-at', 'before')

      dragAt(row(A), 'drop', 5, transfer)
      expect(onMove).toHaveBeenCalledWith(LAKE, A)
      expect(screen.queryByTestId('pinned-drop-indicator')).toBeNull()
    })

    it('drops after the last row from its lower half', () => {
      const { onMove } = renderPinned()
      const transfer = dataTransfer()

      fireEvent.dragStart(row(A), { dataTransfer: transfer })
      dragAt(row(LAKE), 'dragOver', 25, transfer)
      expect(within(row(LAKE).parentElement!).getByTestId('pinned-drop-indicator')).toHaveAttribute('data-at', 'after')
      dragAt(row(LAKE), 'drop', 25, transfer)

      expect(onMove).toHaveBeenCalledWith(A, null)
    })

    it('takes no drag that did not start in the list, such as an Explorer row', () => {
      const { onMove } = renderPinned()
      const transfer = dataTransfer()
      transfer.setData('application/x-plumo-note-path', '/Notes/Other.md')

      dragAt(row(A), 'dragOver', 5, transfer)
      dragAt(row(A), 'drop', 5, transfer)
      expect(screen.queryByTestId('pinned-drop-indicator')).toBeNull()
      expect(onMove).not.toHaveBeenCalled()
    })
  })
})

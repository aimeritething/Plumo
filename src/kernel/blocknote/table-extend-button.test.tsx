import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const block = {
    id: 'table',
    type: 'table',
    content: { type: 'tableContent', rows: [{ cells: ['a'] }, { cells: ['b'] }] },
  }
  return {
    block,
    editor: {
      isEditable: true,
      setTextCursorPosition: vi.fn(),
      updateBlock: vi.fn(),
    },
    tableHandles: {
      addRowsOrColumns: vi.fn((_block: unknown, _type: string, count: number) => (
        Array.from({ length: 2 + count }, (_, index) => ({ cells: [`row ${index}`] }))
      )),
      cropEmptyRowsOrColumns: vi.fn(() => block.content.rows),
      freezeHandles: vi.fn(),
      unfreezeHandles: vi.fn(),
    },
  }
})

vi.mock('@blocknote/core', () => ({ EMPTY_CELL_HEIGHT: 31, EMPTY_CELL_WIDTH: 120 }))
vi.mock('@blocknote/core/extensions', () => ({ TableHandlesExtension: { key: 'tableHandles' } }))
vi.mock('@blocknote/react', () => ({
  useBlockNoteEditor: () => mocks.editor,
  useDictionary: () => ({
    table_handle: { add_below_menuitem: 'Add row below', add_right_menuitem: 'Add column right' },
  }),
  useExtension: () => mocks.tableHandles,
  useExtensionState: (_extension: unknown, options?: { selector?: (state: unknown) => unknown }) => {
    const state = { block: mocks.block }
    return options?.selector ? options.selector(state) : state
  },
}))

import { TableCellHandle, TableExtendButton } from './table-extend-button'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.editor.isEditable = true
})

describe('TableExtendButton', () => {
  it('adds one row on a click, holding the Table handles while pressed', () => {
    const hideOtherElements = vi.fn()
    render(<TableExtendButton orientation="addOrRemoveRows" hideOtherElements={hideOtherElements} />)
    const bar = screen.getByRole('button', { name: 'Add row below' })

    fireEvent.mouseDown(bar, { clientY: 100 })
    expect(mocks.tableHandles.freezeHandles).toHaveBeenCalled()
    expect(hideOtherElements).toHaveBeenLastCalledWith(true)
    expect(bar).toHaveAttribute('data-selected', 'true')

    fireEvent.mouseUp(window)
    fireEvent.click(bar)

    expect(mocks.tableHandles.unfreezeHandles).toHaveBeenCalled()
    expect(hideOtherElements).toHaveBeenLastCalledWith(false)
    expect(mocks.tableHandles.addRowsOrColumns).toHaveBeenCalledWith(mocks.block, 'rows', 1)
    expect(mocks.editor.updateBlock).toHaveBeenCalledTimes(1)
    expect(mocks.editor.updateBlock.mock.calls[0][1]).toMatchObject({
      type: 'table',
      content: { type: 'tableContent', rows: { length: 3 } },
    })
    expect(bar).not.toHaveAttribute('data-selected')
  })

  it('adds as many rows as a drag covers, and the release adds none more', () => {
    render(<TableExtendButton orientation="addOrRemoveRows" hideOtherElements={vi.fn()} />)
    const bar = screen.getByRole('button', { name: 'Add row below' })

    fireEvent.mouseDown(bar, { clientY: 100 })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientY: 100 + 31 * 2 }))
    })

    expect(mocks.tableHandles.cropEmptyRowsOrColumns).toHaveBeenCalledWith(mocks.block, 'rows')
    expect(mocks.tableHandles.addRowsOrColumns).toHaveBeenLastCalledWith(
      { type: 'table', content: { rows: mocks.block.content.rows } },
      'rows',
      2,
    )
    expect(mocks.editor.setTextCursorPosition).toHaveBeenCalledWith(mocks.block)

    fireEvent.mouseUp(window)
    fireEvent.click(bar)
    expect(mocks.editor.updateBlock).toHaveBeenCalledTimes(1)
  })

  it('adds columns beside the table, measured across', () => {
    render(<TableExtendButton orientation="addOrRemoveColumns" hideOtherElements={vi.fn()} />)
    const bar = screen.getByRole('button', { name: 'Add column right' })

    fireEvent.click(bar)

    expect(bar).toHaveAttribute('data-table-extend-button', 'columns')
    expect(mocks.tableHandles.addRowsOrColumns).toHaveBeenCalledWith(mocks.block, 'columns', 1)
  })

  it('draws nothing in a read-only editor', () => {
    mocks.editor.isEditable = false
    const { container } = render(<TableExtendButton orientation="addOrRemoveRows" hideOtherElements={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('TableCellHandle', () => {
  it('draws nothing: split cells and cell colours are off', () => {
    const { container } = render(<TableCellHandle hideOtherElements={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

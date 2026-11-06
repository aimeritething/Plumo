import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  editor: {
    focus: vi.fn(),
    prosemirrorView: {},
    settings: { tables: { headers: false } },
    updateBlock: vi.fn(),
  },
  placeCaret: vi.fn(),
  setTint: vi.fn(),
  state: {
    block: {
      id: 'table',
      type: 'table',
      content: { type: 'tableContent', rows: [{ cells: ['a'] }, { cells: ['b'] }] } as Record<string, unknown>,
    },
    colIndex: 0,
    rowIndex: 1,
    show: true,
  },
  tableHandles: {
    addRowOrColumn: vi.fn(),
    colDragStart: vi.fn(),
    dragEnd: vi.fn(),
    freezeHandles: vi.fn(),
    getCellsAtColumnHandle: vi.fn(() => []),
    getCellsAtRowHandle: vi.fn(() => []),
    removeRowOrColumn: vi.fn(),
    rowDragStart: vi.fn(),
    unfreezeHandles: vi.fn(),
  },
}))

vi.mock('@blocknote/core', () => ({ getColspan: () => 1, getRowspan: () => 1 }))
vi.mock('@blocknote/core/extensions', () => ({ TableHandlesExtension: { key: 'tableHandles' } }))
vi.mock('@blocknote/react', () => ({
  useBlockNoteEditor: () => mocks.editor,
  useDictionary: () => ({
    drag_handle: { header_column_menuitem: 'Header column', header_row_menuitem: 'Header row' },
    table_handle: {
      add_above_menuitem: 'Add row above',
      add_below_menuitem: 'Add row below',
      add_left_menuitem: 'Add column left',
      add_right_menuitem: 'Add column right',
      delete_column_menuitem: 'Delete column',
      delete_row_menuitem: 'Delete row',
    },
  }),
  useExtension: () => mocks.tableHandles,
  useExtensionState: (_extension: unknown, options?: { selector?: (state: unknown) => unknown }) => (
    options?.selector ? options.selector(mocks.state) : mocks.state
  ),
}))
vi.mock('./table-handle-tint', () => ({ setTableHandleTint: mocks.setTint }))
vi.mock('./table-handle-caret', () => ({ placeCaretForClosedTableHandle: mocks.placeCaret }))

import { TableHandle } from './block-note-table-handle'

function menuEntries() {
  return Array.from(
    screen.getByRole('menu').querySelectorAll('[role="menuitem"], [role="menuitemcheckbox"], [role="separator"]'),
    (entry) => (entry.getAttribute('role') === 'separator' ? '---' : entry.textContent),
  )
}

describe('TableHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.editor.settings.tables.headers = false
  })

  it('opens the row menu on a click, tints the row, and inserts through the TableHandles extension', () => {
    const hideOtherElements = vi.fn()
    render(<TableHandle orientation="row" hideOtherElements={hideOtherElements} {...({} as never)} />)

    fireEvent.click(document.querySelector('[data-table-handle="row"]')!)

    expect(menuEntries()).toEqual(['Add row above', 'Add row below', '---', 'Delete row'])
    expect(screen.getByRole('menuitem', { name: 'Delete row' })).toHaveAttribute('data-variant', 'destructive')
    expect(mocks.tableHandles.freezeHandles).toHaveBeenCalledOnce()
    expect(hideOtherElements).toHaveBeenCalledWith(true)
    expect(mocks.setTint).toHaveBeenCalledWith(mocks.editor.prosemirrorView, { blockId: 'table', orientation: 'row', index: 1 })

    fireEvent.click(screen.getByRole('menuitem', { name: 'Add row above' }))

    expect(mocks.tableHandles.addRowOrColumn).toHaveBeenCalledWith(1, { orientation: 'row', side: 'above' })
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(mocks.tableHandles.unfreezeHandles).toHaveBeenCalledOnce()
    expect(mocks.setTint).toHaveBeenLastCalledWith(mocks.editor.prosemirrorView, null)
    expect(mocks.placeCaret).toHaveBeenCalledWith(mocks.editor.prosemirrorView, { blockId: 'table', orientation: 'row', index: 1 })
    expect(mocks.editor.focus).toHaveBeenCalled()
  })

  it('deletes the column, and offers the header toggle on the first column when headers are on', () => {
    mocks.editor.settings.tables.headers = true
    render(<TableHandle orientation="column" hideOtherElements={vi.fn()} {...({} as never)} />)

    fireEvent.click(document.querySelector('[data-table-handle="column"]')!)
    expect(menuEntries()).toEqual(['Add column left', 'Add column right', '---', 'Header column', '---', 'Delete column'])

    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete column' }))
    expect(mocks.tableHandles.removeRowOrColumn).toHaveBeenCalledWith(0, 'column')
  })

  it('closes the menu on a second press of the handle instead of opening it again', () => {
    render(<TableHandle orientation="row" hideOtherElements={vi.fn()} {...({} as never)} />)
    const handle = document.querySelector('[data-table-handle="row"]')!

    fireEvent.click(handle)
    expect(screen.getByRole('menu')).toBeInTheDocument()

    fireEvent.pointerDown(handle, { button: 0 })
    fireEvent.click(handle, { detail: 1 })

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(mocks.tableHandles.freezeHandles).toHaveBeenCalledOnce()
  })
})

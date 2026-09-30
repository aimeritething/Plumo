import { TextSelection } from '@tiptap/pm/state'
import { TableMap } from '@tiptap/pm/tables'
import type { EditorView } from '@tiptap/pm/view'
import { tablePositionById, type TableHandleTint } from './table-handle-tint'

/**
 * Closing a Table handle's menu gives the editor focus, and focus shows the
 * caret wherever the selection was left. A Document opened and never clicked
 * keeps it at its end, so the next key pressed there scrolled the view to the
 * bottom. A caret outside the table moves to the first cell of the handle's
 * column or row; one already in the table stays, as AIM-521 settled.
 */
export function placeCaretForClosedTableHandle(view: EditorView, handle: TableHandleTint) {
  const { state } = view
  const found = tablePositionById(state.doc, handle.blockId)
  if (!found) return

  const tableEnd = found.pos + found.table.nodeSize
  const { from, to } = state.selection
  if (from >= found.pos && to <= tableEnd) return

  const map = TableMap.get(found.table)
  const [row, col] = handle.orientation === 'column' ? [0, handle.index] : [handle.index, 0]
  if (row >= map.height || col >= map.width) return

  const cellStart = found.pos + 1 + map.map[row * map.width + col]
  const selection = TextSelection.near(state.doc.resolve(cellStart + 1))
  view.dispatch(state.tr.setSelection(selection).setMeta('addToHistory', false))
}

import { createExtension } from '@blocknote/core'
import type { Node as ProsemirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { TableMap } from '@tiptap/pm/tables'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

/**
 * While a Table handle's menu is open, the column or row it acts on is tinted
 * and framed (AIM-521). A decoration only: the selection stays where it was,
 * so a key pressed after the menu closes goes to the caret, never to the
 * whole column.
 *
 * Each cell carries the sides of the frame it draws, as the attribute's
 * space-separated words: a column's cells draw their start and end sides (in
 * the table's writing direction), its first cell the top and its last the
 * bottom; a row's the other way round.
 */

export interface TableHandleTint {
  blockId: string
  orientation: 'row' | 'column'
  index: number
}

export const TABLE_HANDLE_TINT_ATTRIBUTE = 'data-table-handle-tint'

export const tableHandleTintPluginKey = new PluginKey<TableHandleTint | null>('plumoTableHandleTint')

function tablePositionById(doc: ProsemirrorNode, blockId: string): { table: ProsemirrorNode; pos: number } | null {
  let match: { table: ProsemirrorNode; pos: number } | null = null
  doc.descendants((node, pos) => {
    if (match) return false
    if (node.type.name !== 'blockContainer' || node.attrs.id !== blockId) return true
    const table = node.firstChild
    if (table?.type.name === 'table') match = { table, pos: pos + 1 }
    return false
  })
  return match
}

function tintDecorations(state: EditorState): DecorationSet {
  const tint = tableHandleTintPluginKey.getState(state)
  if (!tint) return DecorationSet.empty

  const found = tablePositionById(state.doc, tint.blockId)
  if (!found) return DecorationSet.empty

  const map = TableMap.get(found.table)
  const rect = tint.orientation === 'column'
    ? { left: tint.index, right: tint.index + 1, top: 0, bottom: map.height }
    : { left: 0, right: map.width, top: tint.index, bottom: tint.index + 1 }
  if (rect.right > map.width || rect.bottom > map.height) return DecorationSet.empty

  const tableStart = found.pos + 1
  const cells = map.cellsInRect(rect)
  const [along, start, end] = tint.orientation === 'column' ? ['start end', 'top', 'bottom'] : ['top bottom', 'start', 'end']
  const decorations = cells.flatMap((cellPos, index) => {
    const cell = found.table.nodeAt(cellPos)
    if (!cell) return []
    const sides = [along, index === 0 ? start : '', index === cells.length - 1 ? end : ''].filter(Boolean).join(' ')
    const from = tableStart + cellPos
    return [Decoration.node(from, from + cell.nodeSize, { [TABLE_HANDLE_TINT_ATTRIBUTE]: sides })]
  })
  return DecorationSet.create(state.doc, decorations)
}

export function createTableHandleTintPlugin(): Plugin<TableHandleTint | null> {
  return new Plugin<TableHandleTint | null>({
    key: tableHandleTintPluginKey,
    state: {
      init: () => null,
      apply: (tr, previous) => {
        const next = tr.getMeta(tableHandleTintPluginKey) as TableHandleTint | null | undefined
        return next === undefined ? previous : next
      },
    },
    props: {
      decorations: tintDecorations,
    },
  })
}

/** Tints the given column or row, or clears the tint with `null`. */
export function setTableHandleTint(view: EditorView, tint: TableHandleTint | null) {
  view.dispatch(view.state.tr.setMeta(tableHandleTintPluginKey, tint).setMeta('addToHistory', false))
}

/** The BlockNote extension that mounts the plugin into the Rich editor. */
export const createTableHandleTintExtension = createExtension(() => ({
  key: 'plumoTableHandleTint',
  prosemirrorPlugins: [createTableHandleTintPlugin()],
}))

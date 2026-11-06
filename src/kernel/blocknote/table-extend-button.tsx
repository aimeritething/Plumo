import { Plus } from '@phosphor-icons/react'
import {
  EMPTY_CELL_HEIGHT,
  EMPTY_CELL_WIDTH,
  type DefaultInlineContentSchema,
  type PartialTableContent,
} from '@blocknote/core'
import { TableHandlesExtension } from '@blocknote/core/extensions'
import {
  useBlockNoteEditor,
  useDictionary,
  useExtension,
  useExtensionState,
  type ExtendButtonProps,
  type TableCellButtonProps,
} from '@blocknote/react'
import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'

type TableHandles = ReturnType<typeof useExtension<typeof TableHandlesExtension>>
type TableBlock = Parameters<TableHandles['addRowsOrColumns']>[0]
type TableContent = PartialTableContent<DefaultInlineContentSchema>

type ExtendDrag = {
  originalContent: TableContent
  originalCroppedContent: TableContent
  startPos: number
}

type TableRows = ReturnType<TableHandles['addRowsOrColumns']>

// Rounds up or down depending on whether the value is within `margin` of the
// next integer: a drag adds a row once the pointer is 70% of the way there.
function marginRound(num: number, margin = 0.3) {
  const lowerBound = Math.floor(num) + margin
  const upperBound = Math.ceil(num) - margin
  if (num >= lowerBound && num <= upperBound) return Math.round(num)
  return num < lowerBound ? Math.floor(num) : Math.ceil(num)
}

/**
 * The bar under a Table (add a row) or beside it (add a column), laid out
 * like Notion's: a muted full-length strip with a plus, a step darker under
 * the pointer and while it is dragged. A click adds one row or column;
 * dragging away from the table adds as many as the pointer covers, and
 * dragging back removes the empty ones it added. The behaviour is BlockNote's
 * ExtendButton, which this replaces.
 */
export function TableExtendButton({ orientation, hideOtherElements }: ExtendButtonProps) {
  const editor = useBlockNoteEditor()
  const dictionary = useDictionary()
  const tableHandles = useExtension(TableHandlesExtension)
  const block = useExtensionState(TableHandlesExtension, { selector: (state) => state?.block }) as TableBlock | undefined
  const isColumns = orientation === 'addOrRemoveColumns'
  const addType = isColumns ? 'columns' : 'rows'
  // A ref, not state: the click right after the release reads it.
  const movedMouse = useRef(false)
  const [drag, setDrag] = useState<ExtendDrag | undefined>()
  // The table's rows replaced, its widths and header rows kept.
  const setTableRows = useCallback((target: TableBlock, rows: TableRows) => {
    editor.updateBlock(target, { type: 'table', content: { ...target.content, rows } } as never)
  }, [editor])

  const handleMouseDown = useCallback((event: ReactMouseEvent) => {
    tableHandles.freezeHandles()
    hideOtherElements(true)
    if (!block) return

    setDrag({
      originalContent: block.content as TableContent,
      originalCroppedContent: {
        rows: tableHandles.cropEmptyRowsOrColumns(block, addType),
      } as TableContent,
      startPos: isColumns ? event.clientX : event.clientY,
    })
    movedMouse.current = false
    // Otherwise the press selects text in the table.
    event.preventDefault()
  }, [addType, block, hideOtherElements, isColumns, tableHandles])

  const handleClick = useCallback(() => {
    if (!block || movedMouse.current) return
    setTableRows(block, tableHandles.addRowsOrColumns(block, addType, 1))
  }, [addType, block, setTableRows, tableHandles])

  // While pressed, the pointer's distance from where the press began sets how
  // many empty rows or columns the table ends with.
  useEffect(() => {
    if (!drag) return
    const handleMove = (event: MouseEvent) => {
      if (!block) return
      movedMouse.current = true

      const diff = (isColumns ? event.clientX : event.clientY) - drag.startPos
      const numCroppedCells = isColumns
        ? (drag.originalCroppedContent.rows[0]?.cells.length ?? 0)
        : drag.originalCroppedContent.rows.length
      const numOriginalCells = isColumns
        ? (drag.originalContent.rows[0]?.cells.length ?? 0)
        : drag.originalContent.rows.length
      const currentNumCells = isColumns ? block.content.rows[0].cells.length : block.content.rows.length
      const newNumCells = numOriginalCells + marginRound(diff / (isColumns ? EMPTY_CELL_WIDTH : EMPTY_CELL_HEIGHT))

      if (newNumCells < numCroppedCells || newNumCells <= 0 || newNumCells === currentNumCells) return

      setTableRows(block, tableHandles.addRowsOrColumns(
        { type: 'table', content: drag.originalCroppedContent } as TableBlock,
        addType,
        newNumCells - numCroppedCells,
      ))
      // updateBlock moves the selection into the next Block; put it back.
      if (block.content) editor.setTextCursorPosition(block)
    }
    window.addEventListener('mousemove', handleMove)
    return () => window.removeEventListener('mousemove', handleMove)
  }, [addType, block, drag, editor, isColumns, setTableRows, tableHandles])

  // The release ends the drag; a press with too little movement to add
  // anything falls through to the click, which adds one.
  useEffect(() => {
    if (!drag) return
    const handleUp = () => {
      hideOtherElements(false)
      tableHandles.unfreezeHandles()
      setDrag(undefined)
    }
    window.addEventListener('mouseup', handleUp)
    return () => window.removeEventListener('mouseup', handleUp)
  }, [drag, hideOtherElements, tableHandles])

  if (!editor.isEditable) return null

  return (
    // The slot: the controller sizes it to the table's width (rows) or height
    // (columns); the bar fills it a small gap away from the table.
    <div className={cn('flex', isColumns ? 'h-full w-5 pl-1 cursor-col-resize' : 'h-5 w-full pt-1 cursor-row-resize')}>
      <Button
        type="button"
        variant="placeholder"
        size="fill"
        aria-label={isColumns ? dictionary.table_handle.add_right_menuitem : dictionary.table_handle.add_below_menuitem}
        data-table-extend-button={isColumns ? 'columns' : 'rows'}
        data-selected={drag !== undefined || undefined}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
      >
        <Plus aria-hidden />
      </Button>
    </div>
  )
}

/**
 * The cell handle: none. Plumo leaves BlockNote's split cells and cell
 * colours off, so a cell has no menu to open (BlockNote's own button renders
 * nothing with these settings too).
 */
export const TableCellHandle: (props: TableCellButtonProps) => null = () => null

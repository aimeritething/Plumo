import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  DotsSix,
  DotsSixVertical,
  Trash,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react'
import { getColspan, getRowspan } from '@blocknote/core'
import { TableHandlesExtension } from '@blocknote/core/extensions'
import {
  useBlockNoteEditor,
  useDictionary,
  useExtension,
  useExtensionState,
  type TableHandleProps,
} from '@blocknote/react'
import { useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { placeCaretForClosedTableHandle } from './table-handle-caret'
import { setTableHandleTint, type TableHandleTint } from './table-handle-tint'

/**
 * A Table handle, drawn the way AIM-521 settled it: at rest a dash on the
 * table's border line, under the pointer a small chip with six dots, solid
 * while its menu is open. BlockNote's own TableHandle is a 24px glyph in an
 * icon Button, rotated for a column, that runs into the header cell.
 *
 * The controller places the column handle's box with its bottom 12px below the
 * table's top edge, and the row handle's with its right side 10px inside the
 * left edge (its offsets assume the old glyph). The translate moves the chip's
 * centre back onto the border line.
 *
 * A click opens the column's or row's menu (Notion's: insert on either side,
 * the header toggle on the first one, Delete last); dragging the handle is
 * BlockNote's column or row drag. The handle is the menu's trigger, but one
 * that leaves the press alone (`openOnPress={false}`): a menu trigger opens on
 * the press and cancels it, which would cancel the drag the press starts. So
 * the click opens the menu here, and the keys open it as any trigger's do.
 */
export function TableHandle({ orientation, hideOtherElements }: TableHandleProps) {
  const editor = useBlockNoteEditor()
  const tableHandles = useExtension(TableHandlesExtension)
  const state = useExtensionState(TableHandlesExtension)
  const [isDragging, setIsDragging] = useState(false)
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  // Whether the menu was open when the press began: the press that dismisses
  // the menu must not open it again with its click.
  const openAtPressRef = useRef(false)
  // Pointer-leave must not bring the other handle back while this one's menu
  // is open or it is being dragged.
  const holdsFocusRef = useRef(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // The column or row the open menu acts on, for the caret when it closes.
  const openHandleRef = useRef<TableHandleTint | null>(null)

  const isDraggable = useMemo(() => {
    if (!state?.block || state.block.type !== 'table') return false
    if (orientation === 'column') {
      return tableHandles.getCellsAtColumnHandle(state.block, state.colIndex!).every(({ cell }) => getColspan(cell) === 1)
    }
    return tableHandles.getCellsAtRowHandle(state.block, state.rowIndex!).every(({ cell }) => getRowspan(cell) === 1)
  }, [orientation, state, tableHandles])

  if (!state) return null

  const isColumn = orientation === 'column'
  const index = isColumn ? state.colIndex : state.rowIndex
  const Dots = isColumn ? DotsSix : DotsSixVertical

  const setMenuOpen = (next: boolean) => {
    if (next === openRef.current) return
    openRef.current = next
    setOpen(next)
    holdsFocusRef.current = next
    if (next) {
      tableHandles.freezeHandles()
      hideOtherElements(true)
      openHandleRef.current = index === undefined ? null : { blockId: state.block.id, orientation, index }
      if (openHandleRef.current) setTableHandleTint(editor.prosemirrorView, openHandleRef.current)
    } else {
      tableHandles.unfreezeHandles()
      // Closed with Esc, the pointer can still be on this handle.
      hideOtherElements(buttonRef.current?.matches(':hover') ?? false)
      setTableHandleTint(editor.prosemirrorView, null)
      if (openHandleRef.current) placeCaretForClosedTableHandle(editor.prosemirrorView, openHandleRef.current)
      openHandleRef.current = null
      editor.focus()
    }
  }

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setMenuOpen}>
      {/* The slot: the handle's box and its grab cursor; the button fills it. */}
      <span
        className={cn(
          'relative inline-flex cursor-grab',
          isColumn ? 'h-3.5 w-5.5 -translate-y-[5px]' : 'h-5.5 w-3.5 -translate-x-[3px]',
        )}
      >
        <DropdownMenuTrigger
          openOnPress={false}
          render={(
            <Button
              ref={buttonRef}
              variant="bare"
              size="fill"
              className="group relative"
              data-table-handle={orientation}
              data-dragging={isDragging || undefined}
              draggable={isDraggable}
              onPointerDownCapture={() => {
                openAtPressRef.current = openRef.current
              }}
              onClick={(event) => {
                // A click with no press before it (assistive technology) toggles
                // from the menu's state now; the keys are the trigger's own.
                const wasOpen = event.detail === 0 ? openRef.current : openAtPressRef.current
                setMenuOpen(!wasOpen)
              }}
              onPointerEnter={() => hideOtherElements(true)}
              onPointerLeave={() => {
                if (!holdsFocusRef.current) hideOtherElements(false)
              }}
              onDragStart={(event) => {
                holdsFocusRef.current = true
                setIsDragging(true)
                hideOtherElements(true)
                if (isColumn) tableHandles.colDragStart(event)
                else tableHandles.rowDragStart(event)
              }}
              onDragEnd={() => {
                holdsFocusRef.current = false
                tableHandles.dragEnd()
                hideOtherElements(false)
                setIsDragging(false)
              }}
            />
          )}
        >
          <span
            aria-hidden
            className={cn(
              'rounded-sm border-2 border-background bg-subtle-foreground',
              'group-hover:opacity-0 group-focus-visible:opacity-0 group-aria-expanded:opacity-0 group-data-dragging:opacity-0',
              isColumn ? 'h-1.5 w-4.5' : 'h-4.5 w-1.5',
            )}
          />
          <span
            aria-hidden
            className={cn(
              'absolute inset-0 flex scale-90 items-center justify-center rounded-sm border border-input bg-popover text-muted-foreground opacity-0',
              'transition-[opacity,scale] duration-100 ease-out',
              'group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100',
              'group-data-dragging:scale-100 group-data-dragging:opacity-100',
              'group-aria-expanded:scale-100 group-aria-expanded:border-primary group-aria-expanded:bg-primary group-aria-expanded:text-primary-foreground group-aria-expanded:opacity-100',
            )}
          >
            <Dots className="size-4" weight="bold" />
          </span>
        </DropdownMenuTrigger>
      </span>
      <DropdownMenuContent
        align="start"
        side={isColumn ? 'bottom' : 'right'}
        // The editor takes the focus as the menu closes (above).
        finalFocus={false}
      >
        <TableHandleMenuItems orientation={orientation} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

const INSERT_ICONS: Record<'above' | 'below' | 'left' | 'right', PhosphorIcon> = {
  above: ArrowUp,
  below: ArrowDown,
  left: ArrowLeft,
  right: ArrowRight,
}

/**
 * The column's or row's menu, through the TableHandles extension: insert one
 * on either side; on the first one, with headers on, the header toggle; then
 * Delete, last and on its own as every Plumo menu puts what removes content.
 */
function TableHandleMenuItems({ orientation }: Pick<TableHandleProps, 'orientation'>) {
  const editor = useBlockNoteEditor()
  const dict = useDictionary()
  const tableHandles = useExtension(TableHandlesExtension)
  const block = useExtensionState(TableHandlesExtension, { selector: (state) => state?.block })
  const index = useExtensionState(TableHandlesExtension, {
    selector: (state) => (orientation === 'column' ? state?.colIndex : state?.rowIndex),
  })

  if (index === undefined) return null

  const sides = orientation === 'row' ? (['above', 'below'] as const) : (['left', 'right'] as const)
  const isHeader = orientation === 'row' ? Boolean(block?.content.headerRows) : Boolean(block?.content.headerCols)
  const showsHeaderToggle = Boolean(block) && index === 0 && editor.settings.tables.headers

  return (
    <>
      {sides.map((side) => {
        const Icon = INSERT_ICONS[side]
        return (
          <DropdownMenuItem
            key={side}
            onClick={() => {
              tableHandles.addRowOrColumn(
                index,
                orientation === 'row'
                  ? { orientation: 'row', side: side as 'above' | 'below' }
                  : { orientation: 'column', side: side as 'left' | 'right' },
              )
            }}
          >
            <Icon aria-hidden="true" />
            {dict.table_handle[`add_${side}_menuitem`]}
          </DropdownMenuItem>
        )
      })}
      {showsHeaderToggle && block && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={isHeader}
            closeOnClick
            onClick={() => {
              editor.updateBlock(block, {
                content: {
                  ...block.content,
                  [orientation === 'row' ? 'headerRows' : 'headerCols']: isHeader ? undefined : 1,
                } as never,
              })
            }}
          >
            {orientation === 'row' ? dict.drag_handle.header_row_menuitem : dict.drag_handle.header_column_menuitem}
          </DropdownMenuCheckboxItem>
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onClick={() => tableHandles.removeRowOrColumn(index, orientation)}
        variant="destructive"
      >
        <Trash aria-hidden="true" />
        {orientation === 'row' ? dict.table_handle.delete_row_menuitem : dict.table_handle.delete_column_menuitem}
      </DropdownMenuItem>
    </>
  )
}

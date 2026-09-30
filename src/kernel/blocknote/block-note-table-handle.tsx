import { DotsSix, DotsSixVertical } from '@phosphor-icons/react'
import { getColspan, getRowspan } from '@blocknote/core'
import { TableHandlesExtension } from '@blocknote/core/extensions'
import {
  TableHandleMenu,
  useBlockNoteEditor,
  useComponentsContext,
  useExtension,
  useExtensionState,
  type TableHandleProps,
} from '@blocknote/react'
import { useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { setTableHandleTint } from './table-handle-tint'

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
 */
export function TableHandle({ orientation, hideOtherElements }: TableHandleProps) {
  const editor = useBlockNoteEditor()
  const Components = useComponentsContext()
  const tableHandles = useExtension(TableHandlesExtension)
  const state = useExtensionState(TableHandlesExtension)
  const [isDragging, setIsDragging] = useState(false)
  // Pointer-leave must not bring the other handle back while this one's menu
  // is open or it is being dragged.
  const holdsFocusRef = useRef(false)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const isDraggable = useMemo(() => {
    if (!state?.block || state.block.type !== 'table') return false
    if (orientation === 'column') {
      return tableHandles.getCellsAtColumnHandle(state.block, state.colIndex!).every(({ cell }) => getColspan(cell) === 1)
    }
    return tableHandles.getCellsAtRowHandle(state.block, state.rowIndex!).every(({ cell }) => getRowspan(cell) === 1)
  }, [orientation, state, tableHandles])

  if (!state || !Components) return null

  const isColumn = orientation === 'column'
  const index = isColumn ? state.colIndex : state.rowIndex
  const Dots = isColumn ? DotsSix : DotsSixVertical

  return (
    <Components.Generic.Menu.Root
      onOpenChange={(open: boolean) => {
        holdsFocusRef.current = open
        if (open) {
          tableHandles.freezeHandles()
          hideOtherElements(true)
          if (index !== undefined) {
            setTableHandleTint(editor.prosemirrorView, { blockId: state.block.id, orientation, index })
          }
        } else {
          tableHandles.unfreezeHandles()
          // Closed with Esc, the pointer can still be on this handle.
          hideOtherElements(buttonRef.current?.matches(':hover') ?? false)
          setTableHandleTint(editor.prosemirrorView, null)
          editor.focus()
        }
      }}
      position="right"
    >
      <Components.Generic.Menu.Trigger>
        <button
          ref={buttonRef}
          type="button"
          className={cn(
            'group relative flex cursor-grab items-center justify-center outline-none',
            isColumn ? 'h-3.5 w-5.5 -translate-y-[5px]' : 'h-5.5 w-3.5 -translate-x-[3px]',
          )}
          data-table-handle={orientation}
          data-dragging={isDragging || undefined}
          draggable={isDraggable}
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
        >
          <span
            aria-hidden
            className={cn(
              'rounded-sm border-2 border-surface-card bg-text-muted',
              'group-hover:opacity-0 group-focus-visible:opacity-0 group-data-dragging:opacity-0 group-data-[state=open]:opacity-0',
              isColumn ? 'h-1.5 w-4.5' : 'h-4.5 w-1.5',
            )}
          />
          <span
            aria-hidden
            className={cn(
              'absolute inset-0 flex scale-90 items-center justify-center rounded-sm border border-border-strong bg-surface-popover text-text-tertiary opacity-0',
              'transition-[opacity,scale] duration-100 ease-out',
              'group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100',
              'group-data-dragging:scale-100 group-data-dragging:opacity-100',
              'group-data-[state=open]:scale-100 group-data-[state=open]:border-accent-base group-data-[state=open]:bg-accent-base group-data-[state=open]:text-text-inverse group-data-[state=open]:opacity-100',
            )}
          >
            <Dots className="size-4" weight="bold" />
          </span>
        </button>
      </Components.Generic.Menu.Trigger>
      <TableHandleMenu orientation={orientation} />
    </Components.Generic.Menu.Root>
  )
}

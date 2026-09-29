import { memo, useMemo, useState, type DragEvent, type KeyboardEvent } from 'react'
import { CaretDown, CaretRight, FileText, Image } from '@phosphor-icons/react'
import { notePathFilename } from '@/lib/note-path-identity'
import { isImageFilePath } from '@/tabs/image-file'
import { tabParentHints } from '@/tabs/tab-labels'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/ui/context-menu'
import { SidebarLabel, SidebarRow, SidebarRowIcon, SidebarRowName } from '@/shell/sidebar-row'

const LABEL = 'Pinned'
/** The drag's own type, so neither the Explorer's folders nor the window's file drop take a Pinned row. */
export const PINNED_DRAG_MIME_TYPE = 'application/x-plumo-pinned-path'

export interface PinnedProps {
  /** The open Folder's pinned paths, in order. */
  paths: readonly string[]
  activeTabPath: string | null
  collapsed: boolean
  onToggleCollapsed: () => void
  /** A row was activated: its file opens in a Tab, as from the Explorer. */
  onOpen: (path: string) => void
  onUnpin: (path: string) => void
  /** Duplicate the row's file: the copy lands beside it, unpinned, and opens as the active Tab. */
  onDuplicate: (path: string) => void
  /** A row dropped before `before`, or last when it is null. */
  onMove: (path: string, before: string | null) => void
}

/** Where the dragged row would land: before a row, or after the last one. */
type DropSpot = { before: string | null } | null

/**
 * The Pinned section above the Explorer (CONTEXT.md, Pinned): a label, then
 * one row per pinned Document or Image file in the order the user gave. Not
 * rendered at all with nothing pinned. The label folds the section away; its
 * caret shows while the pointer is over the section or the label has focus.
 * The row whose file is the active Tab is selected, as its Explorer row is.
 * Rows are reordered by dragging within the section, or with ⌥↑ and ⌥↓; a
 * row cannot be dragged in from the Explorer. Two rows with the same name
 * each add their parent folder's name, dimmed, as Tabs do.
 */
export const Pinned = memo(function Pinned({ paths, activeTabPath, collapsed, onToggleCollapsed, onOpen, onUnpin, onDuplicate, onMove }: PinnedProps) {
  const hints = useMemo(() => tabParentHints(paths), [paths])
  const { dragging, dropSpot, rowDragProps, listDropProps } = usePinnedDrag(paths, onMove)
  if (paths.length === 0) return null

  const Caret = collapsed ? CaretRight : CaretDown
  return (
    <section className="group/pinned flex flex-none flex-col gap-0.5 pt-0.5" data-testid="pinned">
      <SidebarLabel>
        <button
          type="button"
          className="flex cursor-default items-center gap-1 rounded-sm outline-none focus-visible:focus-ring"
          aria-expanded={!collapsed}
          data-testid="pinned-toggle"
          onClick={onToggleCollapsed}
        >
          {LABEL}
          <Caret
            size={10}
            aria-hidden="true"
            className="text-text-muted opacity-0 transition-opacity duration-150 ease-out group-hover/pinned:opacity-100 group-focus-within/pinned:opacity-100"
            data-testid="pinned-caret"
          />
        </button>
      </SidebarLabel>
      {!collapsed && (
        <div className="flex flex-col gap-0.5" role="listbox" aria-label={LABEL} {...listDropProps}>
          {paths.map((path, index) => (
            <PinnedRow
              key={path}
              path={path}
              parentHint={hints.get(path)}
              active={path === activeTabPath}
              dragging={path === dragging}
              dropMark={dropMarkFor(dropSpot, path, index === paths.length - 1)}
              dragProps={rowDragProps(path)}
              onOpen={onOpen}
              onUnpin={onUnpin}
              onDuplicate={onDuplicate}
              onKeyboardMove={(offset) => {
                const target = index + offset
                if (target < 0 || target >= paths.length) return
                // Moving down one place is moving before the row two further on.
                onMove(path, offset < 0 ? paths[target] : paths[target + 1] ?? null)
              }}
            />
          ))}
        </div>
      )}
    </section>
  )
})

function dropMarkFor(spot: DropSpot, path: string, last: boolean): 'before' | 'after' | undefined {
  if (!spot) return undefined
  if (spot.before === path) return 'before'
  if (spot.before === null && last) return 'after'
  return undefined
}

/**
 * The drag that reorders the list. The row being dragged is held here rather
 * than read off the drag, so a drag that did not start in this list (an
 * Explorer row, a file from Finder) is never taken. Over a row, the upper
 * half drops before it and the lower half after it.
 */
function usePinnedDrag(paths: readonly string[], onMove: (path: string, before: string | null) => void) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropSpot, setDropSpot] = useState<DropSpot>(null)

  const end = () => {
    setDragging(null)
    setDropSpot(null)
  }

  const rowDragProps = (path: string) => ({
    draggable: true,
    onDragStart: (event: DragEvent<HTMLDivElement>) => {
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData(PINNED_DRAG_MIME_TYPE, path)
      setDragging(path)
    },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (!dragging) return
      event.preventDefault()
      event.dataTransfer.dropEffect = 'move'
      const box = event.currentTarget.getBoundingClientRect()
      const lowerHalf = event.clientY > box.top + box.height / 2
      const index = paths.indexOf(path)
      const before = lowerHalf ? paths[index + 1] ?? null : path
      setDropSpot((current) => (current?.before === before ? current : { before }))
    },
    onDragEnd: end,
  })

  const listDropProps = {
    onDragLeave: (event: DragEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropSpot(null)
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      if (!dragging) return
      event.preventDefault()
      if (dropSpot) onMove(dragging, dropSpot.before)
      end()
    },
  }

  return { dragging, dropSpot, rowDragProps, listDropProps }
}

interface PinnedRowProps {
  path: string
  parentHint?: string
  active: boolean
  dragging: boolean
  dropMark?: 'before' | 'after'
  dragProps: ReturnType<ReturnType<typeof usePinnedDrag>['rowDragProps']>
  onOpen: (path: string) => void
  onUnpin: (path: string) => void
  onDuplicate: (path: string) => void
  onKeyboardMove: (offset: -1 | 1) => void
}

function PinnedRow({ path, parentHint, active, dragging, dropMark, dragProps, onOpen, onUnpin, onDuplicate, onKeyboardMove }: PinnedRowProps) {
  const filename = notePathFilename(path)
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.altKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      onKeyboardMove(event.key === 'ArrowUp' ? -1 : 1)
      return
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onOpen(path)
    }
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarRow
          role="option"
          aria-selected={active}
          aria-label={filename}
          tabIndex={0}
          title={path}
          // WebKit will not start an HTML5 drag from inside `user-select: none` (the whole shell) without this.
          className="relative [-webkit-user-drag:element] data-dragging:opacity-50"
          data-testid={`pinned-row:${path}`}
          data-dragging={dragging || undefined}
          data-drop={dropMark}
          {...dragProps}
          onClick={() => onOpen(path)}
          onKeyDown={onKeyDown}
        >
          <SidebarRowIcon icon={isImageFilePath(path) ? Image : FileText} />
          <SidebarRowName>{filename}</SidebarRowName>
          {parentHint && <span className="flex-initial truncate text-2xs text-text-tertiary" data-testid="pinned-parent">{parentHint}</span>}
          {dropMark && (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-accent-base data-[at=after]:-bottom-px data-[at=before]:-top-px"
              data-at={dropMark}
              data-testid="pinned-drop-indicator"
            />
          )}
        </SidebarRow>
      </ContextMenuTrigger>
      <ContextMenuContent data-testid="pinned-menu">
        <ContextMenuItem onSelect={() => onUnpin(path)}>Unpin</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onDuplicate(path)}>Duplicate</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

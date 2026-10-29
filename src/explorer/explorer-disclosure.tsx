import { CaretRight, Folder, FolderOpen } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { SIDEBAR_ROW_ICON_COLORS } from '@/shell/sidebar-row'

interface ExplorerDisclosureProps {
  name: string
  expanded: boolean
  onToggle: () => void
}

/**
 * A folder row's icon, which is also its caret, as Notion's: the folder, shut
 * or open, until the row is hovered or has keyboard focus, then the caret in
 * its place, at once. A row whose context menu is open, or that is only
 * selected, shows the folder. The caret turns a quarter as the folder opens.
 * Clicking it expands or collapses the folder without selecting it (a click on
 * the rest of the row does both).
 */
export function ExplorerDisclosure({ name, expanded, onToggle }: ExplorerDisclosureProps) {
  const FolderIcon = expanded ? FolderOpen : Folder
  return (
    <button
      type="button"
      className={cn('flex h-5 w-3.5 flex-none items-center justify-center', SIDEBAR_ROW_ICON_COLORS, '[[aria-selected=true]>*>&]:text-text-primary')}
      tabIndex={-1}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
      onClick={(event) => { event.stopPropagation(); onToggle() }}
    >
      <FolderIcon size={14} aria-hidden="true" className="group-hover:hidden group-focus-visible:hidden" />
      <CaretRight
        size={12}
        aria-hidden="true"
        className={cn('hidden transition-transform duration-150 ease-out group-hover:block group-focus-visible:block', expanded && 'rotate-90')}
      />
    </button>
  )
}

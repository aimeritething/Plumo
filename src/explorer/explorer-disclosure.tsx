import type { MouseEvent } from 'react'
import { CaretRight, Folder, FolderOpen } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

interface ExplorerDisclosureProps {
  expanded: boolean
  onToggle: () => void
}

/**
 * A folder row's icon, which is also its caret, as Notion's: the folder, shut
 * or open, until the row is hovered or has keyboard focus, then the caret in
 * its place, at once. A row whose context menu is open, or that is only
 * selected, shows the folder. The caret turns a quarter as the folder opens.
 * Clicking it expands or collapses the folder without selecting it (a click on
 * the rest of the row does both). It sits inside the row's button, so it is
 * not a button itself: it is a pointer shortcut only, and the row says
 * whether the folder is open with its `aria-expanded`. Its colours are the
 * row's icon colours.
 */
export function ExplorerDisclosure({ expanded, onToggle }: ExplorerDisclosureProps) {
  const FolderIcon = expanded ? FolderOpen : Folder
  const toggle = (event: MouseEvent) => {
    event.stopPropagation()
    onToggle()
  }
  return (
    <span className="flex h-5 w-4 flex-none items-center justify-center" aria-hidden="true" data-testid="explorer-disclosure" onClick={toggle}>
      <FolderIcon size={16} className="group-hover/menu-button:hidden group-focus-visible/menu-button:hidden" />
      <CaretRight
        size={14}
        className={cn('hidden transition-transform duration-150 ease-out group-hover/menu-button:block group-focus-visible/menu-button:block', expanded && 'rotate-90')}
      />
    </span>
  )
}

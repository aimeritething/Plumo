import type { ComponentProps } from 'react'
import { DotsThree, Plus } from '@phosphor-icons/react'
import { Button } from '@/ui/button'
import { SimpleTooltip } from '@/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'

/**
 * The Explorer header's hover-only actions: "+" makes a new Document where
 * the selection points, one per double-click (the second click is dropped),
 * and "…" holds exactly New Folder, Collapse All, Reveal in Finder and Close
 * Folder. They show while the pointer is over the Explorer (its
 * `SidebarGroup`), while one of them has focus, and while the menu is open.
 */

interface ExplorerHeaderActionsProps {
  onNewDocument: () => void
  onNewFolder: () => void
  onCollapseAll: () => void
  onReveal: () => void
  onCloseFolder: () => void
}

/**
 * An 18px icon button on the label row with its tooltip; the open menu keeps
 * it in its hover colours. As a menu trigger's `render` it hands the
 * trigger's props on to the button, so the button says the menu is open.
 */
function HeaderAction({ label, ...props }: ComponentProps<'button'> & { label: string }) {
  return (
    <SimpleTooltip label={label} side="bottom">
      <Button variant="icon" size="icon-2xs" aria-label={label} {...props} />
    </SimpleTooltip>
  )
}

export function ExplorerHeaderActions(props: ExplorerHeaderActionsProps) {
  const { onNewDocument, onNewFolder, onCollapseAll, onReveal, onCloseFolder } = props

  return (
    <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity duration-150 ease-out group-hover/sidebar-group:opacity-100 focus-within:opacity-100 has-aria-expanded:opacity-100">
      <HeaderAction data-testid="explorer-new-document" label="New Document" onClick={(event) => { if (event.detail <= 1) onNewDocument() }}>
        <Plus aria-hidden="true" />
      </HeaderAction>
      <DropdownMenu>
        <DropdownMenuTrigger render={<HeaderAction data-testid="explorer-more-actions" label="More actions" />}>
          <DotsThree aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-50" data-testid="explorer-header-menu">
          <DropdownMenuItem onSelect={onNewFolder}>New Folder</DropdownMenuItem>
          <DropdownMenuItem onSelect={onCollapseAll}>Collapse All</DropdownMenuItem>
          <DropdownMenuItem onSelect={onReveal}>Reveal in Finder</DropdownMenuItem>
          <DropdownMenuItem onSelect={onCloseFolder}>Close Folder</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

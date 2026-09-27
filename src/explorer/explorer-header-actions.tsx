import type { ComponentProps } from 'react'
import { DotsThree, Plus } from '@phosphor-icons/react'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { ONE_OPEN_PER_DOUBLE_CLICK_PROPS } from '@/shell/sidebar-row'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'

/**
 * The Explorer header's hover-only actions: "+" makes a new
 * Document where the selection points, and "…" holds exactly New Folder,
 * Collapse All, Reveal in Finder and Close Folder. They show while the
 * pointer is over the Explorer (its section is the `explorer` group), while
 * one of them has focus, and while the menu is open.
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
 * it in its hover colours. As a menu trigger's Slot child it hands the
 * trigger's props on to the button, so the menu's data-state is the one kept.
 */
function HeaderAction({ label, ...props }: ComponentProps<'button'> & { label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="icon" size="icon-2xs" aria-label={label} {...props} />
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

export function ExplorerHeaderActions(props: ExplorerHeaderActionsProps) {
  const { onNewDocument, onNewFolder, onCollapseAll, onReveal, onCloseFolder } = props

  return (
    <div className="flex flex-none items-center gap-0.5 opacity-0 transition-opacity duration-150 ease-out group-hover/explorer:opacity-100 focus-within:opacity-100 has-data-[state=open]:opacity-100">
      <HeaderAction data-testid="explorer-new-document" label="New Document" onClick={onNewDocument} {...ONE_OPEN_PER_DOUBLE_CLICK_PROPS}>
        <Plus aria-hidden="true" />
      </HeaderAction>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <HeaderAction data-testid="explorer-more-actions" label="More actions">
            <DotsThree aria-hidden="true" />
          </HeaderAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" data-testid="explorer-header-menu">
          <DropdownMenuItem onSelect={onNewFolder}>New Folder</DropdownMenuItem>
          <DropdownMenuItem onSelect={onCollapseAll}>Collapse All</DropdownMenuItem>
          <DropdownMenuItem onSelect={onReveal}>Reveal in Finder</DropdownMenuItem>
          <DropdownMenuItem onSelect={onCloseFolder}>Close Folder</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

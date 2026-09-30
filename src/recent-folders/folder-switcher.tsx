import { memo, useMemo, type ComponentProps } from 'react'
import { CaretUpDown, Check } from '@phosphor-icons/react'
import type { ListedFile } from '@/folder/explorer'
import { cn } from '@/lib/cn'
import { SIDEBAR_ROW_CLASSES, SidebarRowIcon, SidebarRowName } from '@/shell/sidebar-row'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { FolderNameAndPath } from './folder-name-and-path'
import { folderContentsSummary, folderName, tildePath } from './recent-folders'

/** The gap between the row and what opens above it, the tooltip or the menu. */
const POPUP_OFFSET = 8

interface FolderSwitcherProps {
  /** The current Folder. */
  folder: string
  /** Its listing, for the tooltip's counts. */
  files: readonly ListedFile[]
  /** The Recent Folders, most recent first; the current Folder is one of them. */
  recentFolders: readonly string[]
  home: string | null
  /** A Recent Folder other than the current one was chosen. */
  onOpenRecent: (path: string) => void
  onOpenFolder: () => void
  onCloseFolder: () => void
  /** Settings…, set apart at the menu's end. */
  onOpenSettings: () => void
}

/**
 * The Folder switcher (CONTEXT.md, Folder switcher): the sidebar's last 52px,
 * the top row's height, with one 30px row centred in it naming the current
 * Folder. Only the row reacts. Hovering it shows the Folder's path and what it
 * holds; clicking it opens the Recent Folders above it, the current one
 * ticked, then Open Folder… and Close Folder, then, set apart, Settings….
 * Not rendered with no Folder open; ⌘, and the Plumo menu reach Settings then.
 */
export const FolderSwitcher = memo(function FolderSwitcher(props: FolderSwitcherProps) {
  const { folder, files, recentFolders, home, onOpenRecent, onOpenFolder, onCloseFolder, onOpenSettings } = props
  const summary = useMemo(() => folderContentsSummary(files), [files])

  return (
    <div className="flex flex-none flex-col pt-2.75 pb-0.75" data-testid="folder-switcher">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SwitcherRow name={folderName(folder)} path={tildePath(folder, home)} summary={summary} />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={POPUP_OFFSET}
          className="w-(--radix-dropdown-menu-trigger-width)"
          data-testid="folder-switcher-menu"
        >
          {recentFolders.map((path) => (
            <DropdownMenuItem
              key={path}
              className="h-10"
              aria-current={path === folder || undefined}
              data-testid={`recent-folder:${path}`}
              onSelect={() => {
                if (path !== folder) onOpenRecent(path)
              }}
            >
              <span className="flex size-3 flex-none items-center justify-center">
                {path === folder && <Check aria-hidden="true" className="size-3 text-text-primary" />}
              </span>
              <FolderNameAndPath path={path} home={home} />
            </DropdownMenuItem>
          ))}
          {recentFolders.length > 0 && <DropdownMenuSeparator />}
          <DropdownMenuItem onSelect={onOpenFolder}>
            <span className="size-3 flex-none" />
            Open Folder…
            <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onCloseFolder}>
            <span className="size-3 flex-none" />
            Close Folder
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onOpenSettings} data-testid="folder-switcher-settings">
            <span className="size-3 flex-none" />
            Settings…
            <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})

/**
 * The row, with its tooltip. As the menu trigger's Slot child it hands the
 * trigger's props on to the button, so the menu's `data-state` is the one
 * kept and the open menu holds the row in its hover colours.
 */
function SwitcherRow({ name, path, summary, className, ...props }: ComponentProps<'button'> & { name: string; path: string; summary: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className={cn(SIDEBAR_ROW_CLASSES, 'w-full', className)} data-testid="folder-switcher-row" {...props}>
          <SidebarRowIcon icon={CaretUpDown} />
          <SidebarRowName className="text-left">{name}</SidebarRowName>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" sideOffset={POPUP_OFFSET} className="flex-col gap-0.5" data-testid="folder-switcher-tooltip">
        <span className="wrap-anywhere">{path}</span>
        <span className="text-text-tertiary">{summary}</span>
      </TooltipContent>
    </Tooltip>
  )
}

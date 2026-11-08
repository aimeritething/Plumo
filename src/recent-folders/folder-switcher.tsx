import { memo, useMemo, type ComponentProps } from 'react'
import { CaretUpDown, Check } from '@phosphor-icons/react'
import type { ListedFile } from '@/folder/explorer'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/ui/sidebar'
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
  /** Settings, set apart at the menu's end. */
  onOpenSettings: () => void
}

/**
 * The Folder switcher (CONTEXT.md, Folder switcher): the sidebar's last 52px,
 * the top row's height, with one 32px row centred in it naming the current
 * Folder. Only the row reacts. Hovering it shows the Folder's path and what it
 * holds; clicking it opens the Recent Folders above it, the current one
 * ticked, then Open Folder… and Close Folder, then, set apart, Settings.
 * Not rendered with no Folder open; ⌘, and the Plumo menu reach Settings then.
 */
export const FolderSwitcher = memo(function FolderSwitcher(props: FolderSwitcherProps) {
  const { folder, files, recentFolders, home, onOpenRecent, onOpenFolder, onCloseFolder, onOpenSettings } = props
  const summary = useMemo(() => folderContentsSummary(files), [files])

  return (
    <SidebarMenu className="flex-none pt-2.5 pb-0.5" data-testid="folder-switcher">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger render={<SwitcherRow name={folderName(folder)} path={tildePath(folder, home)} summary={summary} />} />
          <DropdownMenuContent
            side="top"
            align="start"
            sideOffset={POPUP_OFFSET}
            matchTriggerWidth
            data-testid="folder-switcher-menu"
          >
            {recentFolders.map((path) => (
              <DropdownMenuItem
                key={path}
                className="h-10"
                aria-current={path === folder || undefined}
                data-testid={`recent-folder:${path}`}
                onClick={() => {
                  if (path !== folder) onOpenRecent(path)
                }}
              >
                <FolderNameAndPath path={path} home={home} />
                {path === folder && <Check aria-hidden="true" className="ms-auto size-3" />}
              </DropdownMenuItem>
            ))}
            {recentFolders.length > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={onOpenFolder}>
              Open Folder…
              <DropdownMenuShortcut>⌘O</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onCloseFolder}>
              Close Folder
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onOpenSettings} data-testid="folder-switcher-settings">
              Settings
              <DropdownMenuShortcut>⌘,</DropdownMenuShortcut>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
})

/**
 * The row, with its tooltip. As the menu trigger's `render` it hands the
 * trigger's props on to the row's button, so the menu's open / closed state is
 * the one kept and the open menu holds the row in its hover colours.
 */
function SwitcherRow({ name, path, summary, ...props }: ComponentProps<typeof SidebarMenuButton> & { name: string; path: string; summary: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<SidebarMenuButton data-testid="folder-switcher-row" {...props} />}>
        <CaretUpDown aria-hidden="true" />
        <span>{name}</span>
      </TooltipTrigger>
      <TooltipContent side="top" align="start" sideOffset={POPUP_OFFSET} className="flex-col gap-0.5" data-testid="folder-switcher-tooltip">
        <span className="wrap-anywhere">{path}</span>
        <span className="text-muted-foreground">{summary}</span>
      </TooltipContent>
    </Tooltip>
  )
}

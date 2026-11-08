import { memo } from 'react'
import { Folder } from '@phosphor-icons/react'
import { ScrollArea } from '@/ui/scroll-area'
import { SidebarGroup, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/ui/sidebar'
import { FolderNameAndPath } from './folder-name-and-path'

interface RecentFolderListProps {
  /** The Recent Folders, most recent first. */
  paths: readonly string[]
  home: string | null
  onOpen: (path: string) => void
}

/**
 * The Recent Folders with no Folder open, under the Open Folder button: one
 * row per Folder, its name and its path, and a click opens it. With none,
 * nothing is rendered and the sidebar is the plain No-Folder state.
 */
export const RecentFolderList = memo(function RecentFolderList({ paths, home, onOpen }: RecentFolderListProps) {
  if (paths.length === 0) return null
  return (
    <SidebarGroup className="min-h-0 gap-0.5 pt-6" role="region" aria-label="Recent Folders" data-testid="recent-folders">
      <SidebarGroupLabel>Recent</SidebarGroupLabel>
      <ScrollArea className="-mr-3 min-h-0" viewportClassName="pr-3">
        <SidebarMenu>
          {paths.map((path) => (
            <SidebarMenuItem key={path}>
              <SidebarMenuButton size="lg" data-testid={`recent-folder:${path}`} onClick={() => onOpen(path)}>
                <Folder aria-hidden="true" />
                <FolderNameAndPath path={path} home={home} />
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </ScrollArea>
    </SidebarGroup>
  )
})

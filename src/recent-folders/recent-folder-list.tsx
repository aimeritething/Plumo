import { memo } from 'react'
import { Folder } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { SIDEBAR_ROW_CLASSES, SidebarLabel, SidebarRowIcon } from '@/shell/sidebar-row'
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
    <section className="flex min-h-0 flex-col gap-0.5 overflow-y-auto pt-6" aria-label="Recent Folders" data-testid="recent-folders">
      <SidebarLabel>Recent</SidebarLabel>
      {paths.map((path) => (
        <button
          key={path}
          type="button"
          className={cn(SIDEBAR_ROW_CLASSES, 'h-10 w-full flex-none gap-2')}
          data-testid={`recent-folder:${path}`}
          onClick={() => onOpen(path)}
        >
          <SidebarRowIcon icon={Folder} />
          <FolderNameAndPath path={path} home={home} />
        </button>
      ))}
    </section>
  )
})

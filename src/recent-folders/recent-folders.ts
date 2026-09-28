import type { ListedFile } from '@/folder/explorer'
import { notePathFilename } from '@/lib/note-path-identity'
import type { FolderTabs, TabsByFolder } from '@/session/session-schema'

/**
 * The Recent Folders (CONTEXT.md, Recent Folders) and the Tabs each of them
 * had when it was last shown (ADR-0004). Everything here is a pure function of
 * that pair, so the rules — most recent first, at most ten, a Folder's Tabs
 * going with it when it falls off — are checked without React.
 */

export const MAX_RECENT_FOLDERS = 10

export interface RecentFolders {
  /** Most recent first; the current Folder is one of them. */
  paths: readonly string[]
  /** Every Folder's Tabs but the current one's. */
  tabsByFolder: TabsByFolder
}

/** The Tabs of the Folders not in `paths` are dropped. */
function keepingTabsOf(tabsByFolder: TabsByFolder, paths: readonly string[]): TabsByFolder {
  const kept = Object.entries(tabsByFolder).filter(([folder]) => paths.includes(folder))
  return kept.length === Object.keys(tabsByFolder).length ? tabsByFolder : Object.fromEntries(kept)
}

/** A Folder just opened goes first; the one pushed past ten falls off, and its Tabs with it. */
export function rememberFolder(recent: RecentFolders, folder: string): RecentFolders {
  if (recent.paths[0] === folder) return recent
  const paths = [folder, ...recent.paths.filter((path) => path !== folder)].slice(0, MAX_RECENT_FOLDERS)
  return { paths, tabsByFolder: keepingTabsOf(recent.tabsByFolder, paths) }
}

/** A Folder that would not list leaves the list, and its Tabs with it. */
export function forgetFolder(recent: RecentFolders, folder: string): RecentFolders {
  if (!recent.paths.includes(folder)) return recent
  const paths = recent.paths.filter((path) => path !== folder)
  return { paths, tabsByFolder: keepingTabsOf(recent.tabsByFolder, paths) }
}

/** The Tabs a Folder had as it was left; none leaves no key. */
export function stashTabs(recent: RecentFolders, folder: string, tabs: FolderTabs): RecentFolders {
  const others = Object.fromEntries(Object.entries(recent.tabsByFolder).filter(([key]) => key !== folder))
  return { ...recent, tabsByFolder: tabs.openEditors.length > 0 ? { ...others, [folder]: tabs } : others }
}

/** The Tabs a Folder had, taken out: they are the current Folder's from here on. */
export function takeTabs(recent: RecentFolders, folder: string): [FolderTabs | undefined, RecentFolders] {
  const { [folder]: tabs, ...others } = recent.tabsByFolder
  return tabs ? [tabs, { ...recent, tabsByFolder: others }] : [undefined, recent]
}

/**
 * The Session's pair, as the launch finds it. A Folder restored from before
 * there were Recent Folders joins the list; its own Tabs are the Session's
 * `openEditors`, so an entry for it in `tabsByFolder`, like one for a Folder
 * no longer in the list, is dropped.
 */
export function restoredRecentFolders(saved: RecentFolders, current: string | null): RecentFolders {
  const paths = current !== null && !saved.paths.includes(current) ? [current, ...saved.paths].slice(0, MAX_RECENT_FOLDERS) : saved.paths
  const tabsByFolder = keepingTabsOf(saved.tabsByFolder, paths.filter((path) => path !== current))
  return { paths, tabsByFolder }
}

/** A Folder's name, or the path itself for the root. */
export function folderName(path: string): string {
  return notePathFilename(path) || path
}

/** A path under the home directory as `~/…`, the way Finder's Go to Folder writes it. */
export function tildePath(path: string, home: string | null): string {
  if (!home) return path
  const root = home.replace(/\/+$/u, '')
  if (path === root) return '~'
  return path.startsWith(`${root}/`) ? `~${path.slice(root.length)}` : path
}

function counted(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * What the Folder holds, for the Folder switcher's tooltip: its Documents and
 * sub-folders, at any depth. Image files are not counted.
 */
export function folderContentsSummary(files: readonly ListedFile[]): string {
  const documents = files.filter((file) => file.kind === 'note').length
  const folders = files.filter((file) => file.kind === 'folder').length
  const documentPart = documents === 0 ? 'No Documents' : counted(documents, 'Document', 'Documents')
  return folders === 0 ? documentPart : `${documentPart}, ${counted(folders, 'folder', 'folders')}`
}

import { useCallback, useMemo, useRef, useState } from 'react'
import type { FolderTabs } from '@/session/session-schema'
import {
  forgetFolder,
  rememberFolder,
  restoredRecentFolders,
  stashTabs,
  takeTabs,
  type RecentFolders,
} from './recent-folders'

export interface RecentFoldersState extends RecentFolders {
  /** A Folder that has just been opened. */
  remember: (folder: string) => void
  /** A Folder that would not list. */
  forget: (folder: string) => void
  /** The Tabs a Folder had as it was left. */
  stash: (folder: string, tabs: FolderTabs) => void
  /** The Tabs a Folder had, handed over once as it is opened again. */
  take: (folder: string) => FolderTabs | undefined
  /** The Session's pair, put back at launch once the Folder is known. */
  restore: (saved: RecentFolders, current: string | null) => void
}

/**
 * The Recent Folders and the other Folders' Tabs. The pair is mirrored in a
 * ref so `take` reads, and clears, the Tabs of a Folder straight after it has
 * been opened, before React has rendered the change that opened it.
 */
export function useRecentFolders(): RecentFoldersState {
  const [recent, setRecent] = useState<RecentFolders>({ paths: [], tabsByFolder: {} })
  const recentRef = useRef(recent)

  const apply = useCallback((next: RecentFolders) => {
    if (next === recentRef.current) return
    recentRef.current = next
    setRecent(next)
  }, [])

  const remember = useCallback((folder: string) => apply(rememberFolder(recentRef.current, folder)), [apply])
  const forget = useCallback((folder: string) => apply(forgetFolder(recentRef.current, folder)), [apply])
  const stash = useCallback((folder: string, tabs: FolderTabs) => apply(stashTabs(recentRef.current, folder, tabs)), [apply])
  const take = useCallback((folder: string) => {
    const [tabs, next] = takeTabs(recentRef.current, folder)
    apply(next)
    return tabs
  }, [apply])
  const restore = useCallback((saved: RecentFolders, current: string | null) => apply(restoredRecentFolders(saved, current)), [apply])

  return useMemo(() => ({ ...recent, remember, forget, stash, take, restore }), [forget, recent, remember, restore, stash, take])
}

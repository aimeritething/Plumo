import { useCallback } from 'react'
import type { Tab } from '@/types'
import { showRefusalToast } from '@/editor/toasts'
import { FolderNotFoundError, normalizeFolderPath, type ChangeFolderOptions } from '@/folder/use-folder'
import { sessionEditors, type FolderTabs, type SessionEditor } from '@/session/session-schema'
import type { RecentFoldersState } from './use-recent-folders'

interface UseFolderSwitchOptions {
  folder: string | null
  tabs: readonly Tab[]
  activeTabPath: string | null
  /** `useFolder`'s change: resolves to whether this call made it. */
  changeFolder: (path: string | null, beforeChange: () => Promise<void>, options?: ChangeFolderOptions) => Promise<boolean>
  /** Settles every open Tab and closes them all; throws when a Write failure stops the change. */
  settleAndCloseAll: () => Promise<void>
  /** Reopens a Folder's Tabs, dropping the ones whose file is gone. */
  restoreOpenEditors: (editors: SessionEditor[], activePath: string | null, folder: string | null) => Promise<void> | void
  recent: RecentFoldersState
}

/**
 * Every Folder change the user makes: Open Folder…, a Recent Folder, Close
 * Folder. The Tabs are settled and closed as before, and the Folder being
 * left keeps them, with its active Tab, for when it is opened again
 * (ADR-0004). A Tab belongs to the Folder that was open when it was opened,
 * wherever its file lives. The Folder opened goes to the front of the Recent
 * Folders and gets back the Tabs it had.
 */
export function useFolderSwitch({ folder, tabs, activeTabPath, changeFolder, settleAndCloseAll, restoreOpenEditors, recent }: UseFolderSwitchOptions) {
  const { remember, stash, take, forget } = recent

  const switchFolder = useCallback(async (path: string | null, options?: ChangeFolderOptions) => {
    const leaving = folder
    const leftTabs: FolderTabs = {
      openEditors: sessionEditors(tabs.map((tab) => ({ path: tab.entry.path, mode: tab.mode }))),
      activePath: activeTabPath,
    }
    const changed = await changeFolder(path, async () => {
      await settleAndCloseAll()
      if (leaving !== null) stash(leaving, leftTabs)
    }, options)
    if (!changed || path === null) return
    const opened = normalizeFolderPath(path)
    remember(opened)
    const saved = take(opened)
    if (saved) await restoreOpenEditors(saved.openEditors, saved.activePath, opened)
  }, [activeTabPath, changeFolder, folder, remember, restoreOpenEditors, settleAndCloseAll, stash, tabs, take])

  // A Recent Folder is not checked before the list is shown: one that will
  // not list says so in a toast and leaves the list.
  const openRecentFolder = useCallback(async (path: string) => {
    try {
      await switchFolder(path, { reportMissing: false })
    } catch (error) {
      if (!(error instanceof FolderNotFoundError)) throw error
      showRefusalToast('Folder not found')
      forget(path)
    }
  }, [forget, switchFolder])

  return { switchFolder, openRecentFolder }
}

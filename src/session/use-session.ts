import { useEffect, useEffectEvent, useState } from 'react'
import type { ThemeMode } from '@/shell/theme-mode'
import type { Tab } from '@/types'
import { readSessionFile, updateSessionFile } from './session-file'
import { parseSession, sessionForOpenEditors, type OpenEditorInput, type SessionEditor, type SessionSidebar } from './session-schema'
import type { PinnedLists } from '@/pinned/pinned-list'
import type { RecentFolders } from '@/recent-folders/recent-folders'

interface UseSessionOptions {
  folder?: string | null
  restoreFolder?: (folder: string | null) => Promise<string | null>
  tabs: Tab[]
  activeTabPath: string | null
  /** The View → Appearance choice. */
  theme: ThemeMode
  /** Reopens the Session's Documents, dropping the ones that no longer exist. */
  restoreOpenEditors: (editors: SessionEditor[], activePath: string | null, folder?: string | null) => Promise<void> | void
  /** Puts the Session's appearance back. */
  restoreTheme: (theme: ThemeMode) => void
  /** Whether the sidebar is collapsed, and its width when shown. */
  sidebar: SessionSidebar
  restoreSidebar: (sidebar: SessionSidebar) => void
  /** Every Folder's Pinned list. */
  pinned?: PinnedLists
  restorePinned?: (pinned: PinnedLists) => void
  /** The Recent Folders and the other Folders' Tabs. */
  recent?: RecentFolders
  /** Puts them back, once the Folder the Session names has been opened or has failed to open. */
  restoreRecent?: (saved: RecentFolders, current: string | null) => void
}

const NO_PINNED_LISTS: PinnedLists = {}
const NO_RECENT_FOLDERS: RecentFolders = { paths: [], tabsByFolder: {} }

/** The Tabs as the Session file sees them, as one string so the write effect keys on it. */
function openEditorsKey(tabs: Tab[]): string {
  return JSON.stringify(tabs.map((tab): OpenEditorInput => ({ path: tab.entry.path, mode: tab.mode })))
}

/**
 * Restores the Session once at launch and hands every later change of the
 * Folder, open Tabs (each Document with its mode), appearance, sidebar,
 * Pinned lists, Recent Folders and the other Folders' Tabs to the Session file. Nothing is written before
 * the restore has settled, so a launch never overwrites the file with the
 * empty initial state. A file with an unknown version restores nothing and
 * is rewritten in the current schema by the first write.
 */
export function useSession({
  folder = null, restoreFolder, tabs, activeTabPath, theme, restoreOpenEditors, restoreTheme, sidebar, restoreSidebar,
  pinned = NO_PINNED_LISTS, restorePinned, recent = NO_RECENT_FOLDERS, restoreRecent,
}: UseSessionOptions) {
  const [restored, setRestored] = useState(false)
  const restore = useEffectEvent(async () => {
    const session = parseSession(await readSessionFile())
    if (!session) return
    restoreTheme(session.theme)
    restoreSidebar(session.sidebar)
    // Before the Folder, so its listing is the one the pins are checked against.
    restorePinned?.(session.pinned)
    const saved: RecentFolders = { paths: session.recentFolders, tabsByFolder: session.tabsByFolder }
    if (restoreFolder) {
      const restoredFolder = await restoreFolder(session.folder)
      restoreRecent?.(saved, restoredFolder)
      await restoreOpenEditors(session.openEditors, session.activePath, restoredFolder)
    } else {
      restoreRecent?.(saved, session.folder)
      await restoreOpenEditors(session.openEditors, session.activePath)
    }
  })

  useEffect(() => {
    let cancelled = false
    restore()
      .catch((error: unknown) => {
        console.warn('[session] Starting fresh: the Session could not be restored:', error)
      })
      .finally(() => {
        if (!cancelled) setRestored(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // Folder, Tab order, each Tab's mode, active Tab, appearance, sidebar, the
  // Pinned lists and the Recent Folders with their Tabs are what the file
  // holds; a content change inside a Tab does not touch it.
  const editorsKey = openEditorsKey(tabs)
  const { collapsed, width } = sidebar
  const sectionsKey = (sidebar.collapsedSections ?? []).join(',')
  const pinnedKey = JSON.stringify(pinned)
  const recentKey = JSON.stringify(recent)
  useEffect(() => {
    if (!restored) return
    const openEditors = JSON.parse(editorsKey) as OpenEditorInput[]
    const collapsedSections = sectionsKey === '' ? [] : (sectionsKey.split(',') as SessionSidebar['collapsedSections'])
    const session = sessionForOpenEditors(openEditors, activeTabPath, theme, folder, { collapsed, width, collapsedSections }, JSON.parse(pinnedKey) as PinnedLists, JSON.parse(recentKey) as RecentFolders)
    updateSessionFile(session).catch((error: unknown) => {
      console.warn('[session] Failed to hand the Session to the file:', error)
    })
  }, [activeTabPath, collapsed, editorsKey, folder, pinnedKey, recentKey, restored, sectionsKey, theme, width])

  return { restored }
}

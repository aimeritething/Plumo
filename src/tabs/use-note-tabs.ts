import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '@/platform/tauri'
import type { EditorMode, Tab } from '@/types'
import { noteEntryForPath } from '@/folder/note-entry'
import { imageEntryForPath, isImageFilePath } from './image-file'
import { restoreOpenEditors as restoreSurvivingEditors, type SessionEditor } from '@/session/session-schema'
import { documentRoot, documentLocation } from '@/folder/explorer'
import { allowVaultAssets } from '@/folder/vault-asset-scope'
import { cacheNoteContent } from '@/kernel/resolve/note-content-cache'
import * as tabsState from './note-tabs-state'
import { applyModeRule, EMPTY_NOTE_TABS, type NoteTabsState } from './note-tabs-state'

/**
 * The open Documents and Image files, in the kernel's `Tab` shape, under the
 * Tab rules of `noteTabsState`. Reads go through the boundary with the
 * Document's own directory as the root outside the Folder, or the Folder
 * inside it (ADR-0002). `setTabs` keeps the save hook's contract: it may
 * replace a Tab's content but never its order.
 *
 * An Image file is shown and never edited, so its Tab holds no bytes: the
 * picture reaches the view through the asset protocol and its metadata
 * through the Folder listing. Nothing here reads one, reloads one or writes
 * one — an Image Tab is a name and a path.
 *
 * A Document Tab carries its Rich or Raw mode. It is the Tab rule
 * in `noteTabsState` that decides it: whatever a Tab is given, invalid
 * Frontmatter makes it Raw, so every path that changes a Tab's content (a
 * save, a reload from disk, a restore) passes through that rule.
 */

async function readNoteContent(path: string, vaultPath: string, allowAssets = true): Promise<string> {
  const args = { path, vaultPath }
  if (!isTauri()) return mockInvoke<string>('get_note_content', args)

  // Before the read, so the content reaches the editor with the Document's
  // Attachments already viewable rather than a paint later.
  if (allowAssets) await allowVaultAssets(vaultPath)
  return invoke<string>('get_note_content', args)
}

async function readTab(path: string, folder?: string | null): Promise<Tab> {
  if (isImageFilePath(path)) return { entry: imageEntryForPath(path), content: '' }
  const content = await readNoteContent(path, documentRoot(path, folder), !documentLocation(path, folder).insideFolder)
  return { entry: noteEntryForPath(path, content), content }
}

function announceOpened(tab: Tab): void {
  if (isImageFilePath(tab.entry.path)) return
  cacheNoteContent(tab.entry.path, tab.content, tab.entry)
}

/** Read every Session entry; the ones that fail to read no longer exist and are dropped. */
async function readSurvivingTabs(editors: SessionEditor[], folder?: string | null): Promise<Map<string, Tab>> {
  const reads = await Promise.allSettled(editors.map((editor) => readTab(editor.path, folder)))
  const survivors = new Map<string, Tab>()
  reads.forEach((read, index) => {
    if (read.status === 'fulfilled') survivors.set(editors[index].path, read.value)
  })
  return survivors
}

/** With no Folder there is no listing, so no Image file's Session entry survives. */
const NO_FOLDER_LISTING = () => false

/**
 * `folderLists` answers whether the Folder still has a file, which is how an
 * Image file's Session entry is checked: a Document proves it survives by
 * being read, an Image file by being listed.
 */
export function useNoteTabs(folder?: string | null, folderLists: (path: string) => boolean = NO_FOLDER_LISTING) {
  const generation = useRef(0)
  /** Counts open requests, so a read that finishes after a later open knows it lost. */
  const latestOpen = useRef(0)
  const [state, setState] = useState<NoteTabsState>(EMPTY_NOTE_TABS)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  /**
   * Open a Document or an Image file as a Tab, or activate its Tab. A `mode`
   * puts a Document straight into Raw (⌘↵ in Quick Open) so Rich
   * never mounts for it, or switches an open one; the Tab rules still decide
   * whether it takes, and an Image Tab has no mode to set.
   *
   * The last open asked for decides the active Tab: a read that finishes
   * after a later open (a large file, then a small one) is dropped rather
   * than taking the Tab from it, so the file it was for is simply not opened.
   */
  const openNote = useCallback(async (path: string, mode?: EditorMode): Promise<void> => {
    latestOpen.current += 1
    const alreadyOpen = stateRef.current.tabs.some((tab) => tab.entry.path === path)
    if (alreadyOpen) {
      setState((prev) => {
        const activated = tabsState.activateTab(prev, path)
        return mode ? tabsState.setTabMode(activated, path, mode) : activated
      })
      return
    }
    const request = generation.current
    const open = latestOpen.current
    const tab = await readTab(path, folder)
    if (request !== generation.current || open !== latestOpen.current) return
    setState((prev) => tabsState.openTab(prev, mode ? { ...tab, mode } : tab))
    announceOpened(tab)
  }, [folder])

  /**
   * Restore rule: missing files are dropped, the active Tab
   * falls to its successor. A Document survives by reading; an Image file by
   * still being listed in the Folder, there being nothing to read. An entry's
   * kind is its extension, so a hand-edited `mode` on an Image file entry
   * changes nothing. Each Document comes back in the mode its entry names
   * (Rich when it names none), under the Tab rule. A Document opened before
   * the restore settles (a Finder launch) keeps its Tab and stays active.
   */
  const restoreOpenEditors = useCallback(async (editors: SessionEditor[], activePath: string | null, restoredFolder?: string | null) => {
    const opening = editors.filter((editor) => !isImageFilePath(editor.path) || folderLists(editor.path))
    const survivors = await readSurvivingTabs(opening, restoredFolder)
    const restored = restoreSurvivingEditors({ openEditors: opening, activePath }, new Set(survivors.keys()))
    const tabs = applyModeRule(restored.openEditors.map((editor) => ({ ...survivors.get(editor.path) as Tab, mode: editor.mode })))
    setState((prev) => {
      const openedMeanwhile = prev.tabs.filter((tab) => !survivors.has(tab.entry.path))
      return { tabs: [...tabs, ...openedMeanwhile], activeTabPath: prev.activeTabPath ?? restored.activePath }
    })
    const activeTab = tabs.find((tab) => tab.entry.path === restored.activePath)
    if (activeTab) announceOpened(activeTab)
  }, [folderLists])

  /**
   * Put the bytes on disk back into an open Document's Tab (the error bar's
   * Discard changes). The Tab keeps its place and the active Tab
   * does not move; a Document that is not open is left alone.
   *
   * An Image Tab has no bytes to read back, so it counts the reload instead
   * and the picture is fetched again at the new count. That count, not the
   * listing's whole-second `modifiedAt`, is what makes an overwrite land even
   * when the file keeps its size within the same second.
   */
  const reloadTab = useCallback(async (path: string, canReload: () => boolean = () => true): Promise<void> => {
    const original = stateRef.current.tabs.find((tab) => tab.entry.path === path)
    if (!original || !canReload()) return
    if (isImageFilePath(path)) {
      setState((prev) => ({
        ...prev,
        tabs: prev.tabs.map((tab) => (tab === original ? { ...tab, reloads: (tab.reloads ?? 0) + 1 } : tab)),
      }))
      return
    }
    const request = generation.current
    const content = await readNoteContent(path, documentRoot(path, folder), false)
    if (!canReload() || request !== generation.current) return
    setState((prev) => ({
      ...prev,
      tabs: applyModeRule(prev.tabs.map((tab) => tab === original && canReload() && tab.content !== content ? { ...tab, content } : tab)),
    }))
  }, [folder])

  const closeAllTabs = useCallback(() => {
    generation.current += 1
    stateRef.current = EMPTY_NOTE_TABS
    setState(EMPTY_NOTE_TABS)
  }, [])

  /**
   * An Explorer rename moved a file, or a folder above one. The Tab
   * follows the new path without re-reading: its bytes did not change.
   */
  const retargetTabs = useCallback((oldPath: string, newPath: string) => {
    setState((prev) => tabsState.retargetTabs(prev, oldPath, newPath))
  }, [])

  const closeTab = useCallback((path: string) => setState((prev) => tabsState.closeTab(prev, path)), [])
  const activateTab = useCallback((path: string) => setState((prev) => tabsState.activateTab(prev, path)), [])
  const activateTabAt = useCallback((index: number) => setState((prev) => tabsState.activateTabAt(prev, index)), [])
  const activateAdjacentTab = useCallback(
    (direction: 1 | -1) => setState((prev) => tabsState.activateAdjacentTab(prev, direction)),
    [],
  )

  /** ⌘\ and the segmented control: the mode of one Document Tab. */
  const setTabMode = useCallback((path: string, mode: EditorMode) => {
    setState((prev) => tabsState.setTabMode(prev, path, mode))
  }, [])

  const setTabs = useCallback((action: SetStateAction<Tab[]>) => {
    setState((prev) => {
      const tabs = applyModeRule(typeof action === 'function' ? action(prev.tabs) : action)
      return tabs === prev.tabs ? prev : { ...prev, tabs }
    })
  }, [])

  const { tabs, activeTabPath } = state
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.entry.path === activeTabPath) ?? null,
    [activeTabPath, tabs],
  )

  return {
    tabs,
    setTabs,
    activeTab,
    activeTabPath,
    openNote,
    closeTab,
    closeAllTabs,
    reloadTab,
    retargetTabs,
    activateTab,
    activateTabAt,
    activateAdjacentTab,
    setTabMode,
    restoreOpenEditors,
  }
}

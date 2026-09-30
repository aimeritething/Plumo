import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Tab } from './types'
import { CommandMenu } from '@/command-menu/command-menu'
import { Editor, type TabCommands } from '@/editor/editor'
import { Pinned } from '@/pinned/pinned'
import { usePinned } from '@/pinned/use-pinned'
import { Explorer } from '@/explorer/explorer'
import { useFolder, pickFolderToOpen } from '@/folder/use-folder'
import { useExplorerActions } from '@/explorer/use-explorer-actions'
import { useDuplicateFile } from '@/folder/use-duplicate-file'
import type { EditorMode } from '@/types'
import { useExplorerMemory } from '@/explorer/use-explorer-memory'
import { useDocumentWatcher } from '@/folder/use-document-watcher'
import { buildExplorerTree, documentRoot } from '@/folder/explorer'
import { findByNotePath } from '@/lib/note-path-identity'
import { isWithinPrefix } from '@/folder/folder-action-utils'
import { Sidebar } from '@/shell/sidebar'
import { SidebarToggle } from '@/shell/sidebar-toggle'
import { useAppearance } from '@/shell/use-appearance'
import { WriteFailureDialog } from '@/editor/write-failure-dialog'
import { dispatchAppCommand, isAppCommandId } from '@/shell/app-command-dispatcher'
import { commandMenuCommandEntries, commandMenuFileEntries } from '@/command-menu/command-menu-entries'
import { useAppKeyboard } from '@/shell/use-app-keyboard'
import { useCommandMenu } from '@/command-menu/use-command-menu'
import { useDocumentDrop } from '@/tabs/use-document-drop'
import { useEditorSave } from '@/editor/use-editor-save'
import { useFinderOpen } from '@/tabs/use-finder-open'
import { useMenuEvents, type MenuEventHandlers } from '@/shell/use-menu-events'
import { useNoteTabs } from '@/tabs/use-note-tabs'
import { useSession } from '@/session/use-session'
import { SettingsDialog } from '@/settings/settings-dialog'
import { useSettings } from '@/settings/use-settings'
import { FolderSwitcher } from '@/recent-folders/folder-switcher'
import { RecentFolderList } from '@/recent-folders/recent-folder-list'
import { useRecentFolders } from '@/recent-folders/use-recent-folders'
import { useFolderSwitch } from '@/recent-folders/use-folder-switch'
import { useHomeDir } from '@/platform/home-dir'
import { useSidebar } from '@/shell/use-sidebar'
import { copyPathWithToast, showClosedOutsideToast, showRefusalToast } from '@/editor/toasts'
import { useTabCommands } from '@/tabs/use-tab-commands'
import { openTabFileInDefaultApp, revealTabFile } from '@/tabs/tab-file-actions'
import { useThemeMode } from '@/shell/use-theme-mode'
import { useWriteFailureRecord, useWriteFailures } from '@/editor/use-write-failures'
import { closeAppWindow, exitApp } from '@/platform/app-window'
import { pickNoteToOpen } from '@/tabs/note-open-dialog'
import { openNotesSettled } from '@/tabs/note-open-request'
import { requestPlainTextPaste } from '@/editor/plain-text-paste'
import { requestEditorFocus } from '@/editor/use-editor-focus'
import { nativeTextFieldHasFocus, type EditorHistory } from '@/editor/editor-history'
import { activeTabPaths, isImageFilePath } from '@/tabs/image-file'

const noop = () => {}

/**
 * Rich-mode edits reach disk 1.5 s after the last keystroke: the kernel's
 * serialization debounce (RICH_EDITOR_CHANGE_DEBOUNCE_MS) is the idle wait,
 * and the save hook has no timer of its own (ADR-0003). Disk first; the
 * buffer stays put when the write is refused (Autosave, CONTEXT.md) and the
 * refusal becomes the Document's error bar.
 */
function useAutosaveOnEditorChange(
  handleContentChange: (path: string, content: string) => void,
  savePendingForPath: (path: string) => Promise<boolean>,
  recordFailure: (path: string, error: unknown) => void,
  isOpen: (path: string) => boolean,
) {
  return useCallback(
    (path: string, content: string) => {
      // A Document with no Tab is never written: the editor flushes its idle
      // debounce as the Tab it belonged to goes away, and a file that has just
      // been trashed or deleted in Finder must not come back.
      if (!isOpen(path)) return
      handleContentChange(path, content)
      savePendingForPath(path).catch((error: unknown) => recordFailure(path, error))
    },
    [handleContentChange, isOpen, recordFailure, savePendingForPath],
  )
}

/**
 * The save hook's persistence scope: the boundary root of every open
 * Document (ADR-0002), deepest first so a Document's own directory wins.
 * Scoping every Tab rather than the active one means a keystroke that lands
 * while a Tab switch is still writing is not cleared with the scope change;
 * the kernel flushes it at the path change and the write goes through.
 */
function useOpenNoteRoots(tabs: Tab[], folder: string | null): readonly string[] {
  const rootsKey = Array.from(new Set(tabs.map((tab) => documentRoot(tab.entry.path, folder))))
    .sort((a, b) => b.length - a.length)
    .join('\n')
  return useMemo(() => (rootsKey === '' ? [] : rootsKey.split('\n')), [rootsKey])
}

export default function App() {
  const folderState = useFolder()
  const { folder, changeFolder } = folderState
  const {
    tabs,
    setTabs,
    activeTabPath,
    openNote,
    closeTab,
    closeAllTabs,
    reloadTab,
    activateTab,
    activateTabAt,
    activateAdjacentTab,
    retargetTabs,
    setTabMode,
    restoreOpenEditors,
  } = useNoteTabs(folder, folderState.listsFile)
  const appearance = useAppearance()
  const { sidebar, slides: sidebarSlides, toggle: toggleSidebar, collapse: collapseSidebar, setWidth: setSidebarWidth, toggleSection: toggleSidebarSection, openSection: openSidebarSection, restore: restoreSidebar } = useSidebar()
  const pinned = usePinned(folder, folderState.files)
  const recent = useRecentFolders()
  const home = useHomeDir()
  const { restored } = useSession({
    folder,
    restoreFolder: folderState.restoreFolder,
    tabs,
    activeTabPath,
    restoreOpenEditors,
    sidebar,
    restoreSidebar,
    pinned: pinned.lists,
    restorePinned: pinned.restore,
    recent,
    restoreRecent: recent.restore,
  })
  const { restored: settingsRestored } = useSettings({ theme: appearance.themeMode, restoreTheme: appearance.restoreTheme })
  useThemeMode(appearance.themeMode, settingsRestored)
  const flushPendingEditorContentRef = useRef<((path: string) => void) | null>(null)
  const flushPendingRawContentRef = useRef<((path: string) => void) | null>(null)
  const hasPendingEditorContentRef = useRef<((path: string) => boolean) | null>(null)
  // Toggle Rich/Raw lives in the editor, which registers it here.
  const rawToggleRef = useRef<(() => void) | null>(null)
  // Find in the current Document lives there too, on whichever surface is showing.
  const findRef = useRef<(() => void) | null>(null)
  // Undo and Redo the same way: BlockNote's history in Rich mode, CodeMirror's in Raw.
  const historyRef = useRef<EditorHistory | null>(null)
  // Duplicate Block the same way, registered by the editor in Rich mode only.
  const duplicateBlockRef = useRef<(() => void) | null>(null)
  /** Push whichever surface is showing the Document's fresh keystrokes into the save buffer. */
  const flushEditorBuffers = useCallback((path: string) => {
    flushPendingEditorContentRef.current?.(path)
    flushPendingRawContentRef.current?.(path)
  }, [])
  const vaultPath = activeTabPath ? documentRoot(activeTabPath, folder) : undefined
  // Save, Toggle Rich/Raw and Find in Document follow the active Document;
  // an Image Tab leaves all three disabled. Its row in the
  // Folder listing is its byte size and the version its picture is fetched at.
  const { documentPath: activeDocumentPath, imagePath: activeImagePath } = activeTabPaths(activeTabPath)
  const activeImageFile = findByNotePath(folderState.files, activeImagePath) ?? null
  const persistenceScope = useOpenNoteRoots(tabs, folder)

  // A write that lands, from any path, clears the Document's error bar.
  const writeFailureRecord = useWriteFailureRecord()
  const { clearFailure: clearWriteFailure, recordFailure: recordWriteFailure } = writeFailureRecord
  const onNotePersisted = clearWriteFailure

  const { handleContentChange, savePendingForPath, discardPending, hasPendingSave, pendingContentFor } = useEditorSave({
    setTabs,
    onNotePersisted,
    persistenceScope,
  })

  /**
   * Push the rich editor's fresh keystrokes into the save buffer and write
   * the active Document's pending edits, while its directory is still the
   * persistence scope. Every Tab switch, close, ⌘S and ⌘Q goes through here
   * (a Document's pending edits are written before it closes). Only
   * the active Document's buffer: another Document's refused edits stay in
   * the save hook's buffer and are its own bar's to retry, never this Tab's.
   */
  const settleActiveNote = useCallback(async () => {
    if (!activeTabPath) return
    flushEditorBuffers(activeTabPath)
    await savePendingForPath(activeTabPath)
  }, [activeTabPath, flushEditorBuffers, savePendingForPath])

  /**
   * Retry: the save hook's buffer, which kept the refused edits and, once the
   * rich editor's fresh keystrokes are flushed into it, is the latest content.
   * The Tab's copy stands in when the buffer has since moved to another
   * Document.
   */
  const writeBuffer = useCallback(async (path: string, content: string) => {
    if (path === activeTabPath) flushEditorBuffers(path)
    if (await savePendingForPath(path)) return
    handleContentChange(path, content)
    await savePendingForPath(path)
  }, [activeTabPath, flushEditorBuffers, handleContentChange, savePendingForPath])

  /** Discard changes: forget the buffered edits, then read the disk bytes back into the Tab. */
  const revertToDisk = useCallback(async (path: string) => {
    discardPending(path)
    await reloadTab(path)
  }, [discardPending, reloadTab])

  const writeFailures = useWriteFailures({
    record: writeFailureRecord,
    tabs,
    activeTabPath,
    settleActiveNote,
    writeBuffer,
    revertToDisk,
    closeTab: closeTab,
    exitApp,
  })
  const { settleAndRecord, closeTabOrAsk, retry, discard, quit, answerPrompt, dismissPrompt } = writeFailures
  // The open paths, so a flush that arrives after a Tab has gone is refused
  // rather than recreating its file. The editor reaches this through a ref it
  // refreshes before its own swap effect runs, so the set is never the stale one.
  const openPaths = useMemo(() => new Set(tabs.map((tab) => tab.entry.path)), [tabs])
  const isOpenPath = useCallback((path: string) => openPaths.has(path), [openPaths])
  const onContentChange = useAutosaveOnEditorChange(handleContentChange, savePendingForPath, recordWriteFailure, isOpenPath)
  // Raw mode's keystrokes take the same road, after the raw editor's own idle
  // debounce (ADR-0003). A report that matches what the Tab already holds is
  // not an edit: the raw editor re-reports on unmount what a flush just wrote.
  const tabsRef = useRef(tabs)
  useLayoutEffect(() => {
    tabsRef.current = tabs
  }, [tabs])
  const onRawContentChange = useCallback((path: string, content: string) => {
    if (tabsRef.current.find((tab) => tab.entry.path === path)?.content === content) return
    onContentChange(path, content)
  }, [onContentChange])

  /** The open Tabs a path covers: the file itself, or everything under a folder. */
  const pathsUnder = useCallback((prefix: string) => (
    tabs.map((tab) => tab.entry.path).filter((path) => isWithinPrefix({ path, prefix }))
  ), [tabs])

  /**
   * Write the pending edits of every open Document at or under a path. Move to
   * Trash asks for this first, so a Document reaches the Trash holding the
   * edit that was still in the buffer. A refused write is swallowed rather
   * than recorded: the delete goes ahead either way, and the Tab that would
   * carry the error bar is about to close.
   */
  const settleTabsUnder = useCallback(async (prefix: string) => {
    for (const path of pathsUnder(prefix)) {
      if (path === activeTabPath) flushEditorBuffers(path)
      await savePendingForPath(path).catch(() => {})
    }
  }, [activeTabPath, flushEditorBuffers, pathsUnder, savePendingForPath])

  /**
   * Cancel the pending Autosave of every Tab at or under a path and close
   * them. The cancellation comes first: the buffered edits belong to a file
   * that is not there any more.
   */
  const dropTabsUnder = useCallback((prefix: string) => {
    for (const path of pathsUnder(prefix)) {
      discardPending(path)
      clearWriteFailure(path)
      closeTab(path)
    }
  }, [clearWriteFailure, closeTab, discardPending, pathsUnder])

  const tabCommands = useTabCommands({
    activeTabPath,
    settleActiveNote: settleAndRecord,
    closeTab: closeTabOrAsk,
    activateTab,
    activateTabAt,
    activateAdjacentTab,
    closeWindow: closeAppWindow,
  })

  // A Document or an Image file row: both open a real Tab.
  const openExplorerFile = useCallback((path: string) => {
    void openNotesSettled({ openNote, paths: [path], settleActiveNote: settleAndRecord })
  }, [openNote, settleAndRecord])
  // A Document opened by hand gets the keyboard: the editor takes focus once
  // its Tab is showing, so typing goes on without a click (AIM-457). An Image
  // file's Tab has nothing to type in.
  const focusEditorFor = useCallback((path: string) => {
    if (!isImageFilePath(path)) requestEditorFocus({ path })
  }, [])
  const openFileAndFocus = useCallback((path: string) => {
    openExplorerFile(path)
    focusEditorFor(path)
  }, [focusEditorFor, openExplorerFile])

  // A rename or move made in Plumo carries the Tabs and the pins along. A
  // change made in Finder is the watcher's, and moves Tabs only: the listing
  // no longer holding a pinned file is what unpins it (CONTEXT.md, Pinned).
  const { retarget: retargetPins } = pinned
  const retargetTabsAndPins = useCallback((oldPath: string, newPath: string) => {
    retargetTabs(oldPath, newPath)
    retargetPins(oldPath, newPath)
  }, [retargetPins, retargetTabs])

  // The Explorer's write operations. The tree is built here because
  // the placement rule behind ⌘N reads the selected row, and ⌘N is an app
  // command rather than the Explorer's own.
  const explorerTree = useMemo(
    () => (folder ? buildExplorerTree(folder, folderState.files) : null),
    [folder, folderState.files],
  )
  // Duplicate (CONTEXT.md): the Explorer's and Pinned's menus on a row, and
  // File ▸ Duplicate, the Command Menu and the "…" menu on the active Tab. The
  // copy holds what the Tab shows: its pending edits are written first, and a
  // refused write leaves them in the buffer, or on the Tab under a Write
  // failure, for the copy to take instead.
  const settleForDuplicate = useCallback(async (path: string) => {
    if (path === activeTabPath) flushEditorBuffers(path)
    await savePendingForPath(path).catch((error: unknown) => recordWriteFailure(path, error))
  }, [activeTabPath, flushEditorBuffers, recordWriteFailure, savePendingForPath])
  const unsavedContent = useCallback((path: string) => (
    pendingContentFor(path)
      ?? (writeFailureRecord.failuresRef.current[path] ? tabsRef.current.find((tab) => tab.entry.path === path)?.content : undefined)
  ), [pendingContentFor, writeFailureRecord.failuresRef])
  const openDuplicate = useCallback((path: string, mode: EditorMode | undefined) => {
    void openNotesSettled({ openNote: (target) => openNote(target, mode), paths: [path], settleActiveNote: settleAndRecord })
    focusEditorFor(path)
  }, [focusEditorFor, openNote, settleAndRecord])
  const duplicate = useDuplicateFile({
    folder,
    tree: explorerTree,
    tabs,
    settle: settleForDuplicate,
    unsavedContent,
    refresh: folderState.refresh,
    open: openDuplicate,
    showToast: showRefusalToast,
  })

  const explorerActions = useExplorerActions({
    folder,
    tree: explorerTree,
    activeTabPath,
    refresh: folderState.refresh,
    openNote: openExplorerFile,
    focusEditor: focusEditorFor,
    settleActiveDocument: settleAndRecord,
    retargetTabs: retargetTabsAndPins,
    settleTabsUnder,
    dropTabsUnder,
    showToast: showRefusalToast,
    duplicate,
  })

  // A Pinned row opens its file as its Explorer row would, and selects that
  // row, so the file the Tab shows is marked in both sections.
  const { select: selectExplorerRow } = explorerActions
  const openPinnedFile = useCallback((path: string) => {
    selectExplorerRow(path)
    openFileAndFocus(path)
  }, [openFileAndFocus, selectExplorerRow])
  // ⌘N and the tab bar's "+": with the sidebar collapsed there is no row to
  // name the Document in, so it keeps its Untitled name and the editor takes
  // focus (AIM-463). A Document named there hands focus to the editor too.
  const { createDocument } = explorerActions
  const createDocumentFromShell = useCallback(() => {
    createDocument({ rename: !sidebar.collapsed })
  }, [createDocument, sidebar.collapsed])
  const focusActiveEditor = useCallback(() => requestEditorFocus({}), [])
  const onTogglePinnedSection = useCallback(() => toggleSidebarSection('pinned'), [toggleSidebarSection])
  const onToggleExplorerSection = useCallback(() => toggleSidebarSection('explorer'), [toggleSidebarSection])
  const onOpenExplorerSection = useCallback(() => openSidebarSection('explorer'), [openSidebarSection])

  // Held here, above the sidebar, because collapsing the sidebar unmounts the Explorer.
  const explorerMemory = useExplorerMemory(folder)

  const settleAndCloseAll = useCallback(async () => {
    try {
      await settleAndRecord()
    } catch {
      if (activeTabPath) closeTabOrAsk(activeTabPath)
      throw new Error('Folder change stopped by a Write failure')
    }
    for (const tab of tabs) {
      const path = tab.entry.path
      if (writeFailureRecord.failuresRef.current[path] && !(await retry(path))) {
        closeTabOrAsk(path)
        throw new Error('Folder change stopped by a Write failure')
      }
      await savePendingForPath(path)
    }
    closeAllTabs()
    for (const tab of tabs) clearWriteFailure(tab.entry.path)
  }, [activeTabPath, clearWriteFailure, closeAllTabs, closeTabOrAsk, retry, savePendingForPath, settleAndRecord, tabs, writeFailureRecord.failuresRef])

  const { switchFolder, openRecentFolder } = useFolderSwitch({
    folder, tabs, activeTabPath, changeFolder, settleAndCloseAll, restoreOpenEditors, recent,
  })
  const onOpenFolder = useCallback(() => {
    void (async () => {
      const path = await pickFolderToOpen()
      if (path) await switchFolder(path)
    })().catch((error: unknown) => console.warn('Could not open Folder:', error))
  }, [switchFolder])
  const onCloseFolder = useCallback(() => {
    void switchFolder(null).catch((error: unknown) => console.warn('Could not close Folder:', error))
  }, [switchFolder])
  const onOpenRecentFolder = useCallback((path: string) => {
    openRecentFolder(path).catch((error: unknown) => console.warn('Could not open Folder:', error))
  }, [openRecentFolder])

  const isPending = useCallback((path: string) => Boolean(
    hasPendingEditorContentRef.current?.(path) || hasPendingSave(path) || writeFailureRecord.failuresRef.current[path]
  ), [hasPendingSave, writeFailureRecord.failuresRef])
  useDocumentWatcher({
    folder,
    paths: tabs.map((tab) => tab.entry.path),
    refresh: folderState.refresh,
    reload: reloadTab,
    isPending,
    listedPaths: folderState.listedPaths,
    retargetTabs: retargetTabs,
    dropTabsUnder: dropTabsUnder,
    onTabsClosed: showClosedOutsideToast,
  })

  /**
   * Opening a Document with no Folder open collapses the sidebar: there is
   * nothing to browse, so the editor takes the window. With a Folder open the
   * sidebar stays as it is. File → Open Document… and a `.md` dropped on the
   * window both open this way; the Explorer's rows cannot, there being no
   * Folder to click in.
   */
  const openLoneNote = useCallback(async (path: string) => {
    await openNote(path)
    if (folder === null) collapseSidebar()
  }, [collapseSidebar, folder, openNote])

  const onOpenNote = useCallback(() => {
    void (async () => {
      const path = await pickNoteToOpen()
      if (!path) return
      await openNotesSettled({ openNote: openLoneNote, paths: [path], settleActiveNote: settleAndRecord })
    })()
  }, [openLoneNote, settleAndRecord])

  // Save is disabled with no Document open — and an Image Tab is not one, so
  // ⌘S over a picture does nothing. The native menu item goes the same way
  // through update_menu_state. A refusal is the error bar's.
  const onSave = useCallback(() => {
    if (!activeDocumentPath) return
    settleAndRecord().catch(noop)
  }, [activeDocumentPath, settleAndRecord])

  // Toggle Rich/Raw (⌘\, View menu) is disabled with no Document open, like
  // Save: an undefined handler is how the dispatcher reads disabled, and the
  // native menu follows through update_menu_state.
  const onToggleRawEditor = useCallback(() => rawToggleRef.current?.(), [])
  // Find (⌘F, Edit menu) follows the same rule: no Document, no handler.
  const onFindInNote = useCallback(() => findRef.current?.(), [])
  // Undo and Redo (Edit menu, the Command Menu) too. ⌘Z never comes this way
  // from a text field, the field keeps it; a menu click while a rename field
  // or a find bar holds the caret leaves the Document's history alone (AIM-468).
  const onUndo = useCallback(() => {
    if (!nativeTextFieldHasFocus()) historyRef.current?.undo()
  }, [])
  const onRedo = useCallback(() => {
    if (!nativeTextFieldHasFocus()) historyRef.current?.redo()
  }, [])
  // Duplicate Block (⌘D, Edit menu, the Command Menu) needs a Document in Rich
  // mode, where there are Blocks; Raw mode keeps ⌘D for CodeMirror. A menu
  // click while a rename field or a find bar holds the caret does nothing.
  const activeDocumentMode = tabs.find((tab) => tab.entry.path === activeDocumentPath)?.mode
  const hasRichDocument = activeDocumentPath !== null && activeDocumentMode !== 'raw'
  const onDuplicateBlock = useCallback(() => {
    if (!nativeTextFieldHasFocus()) duplicateBlockRef.current?.()
  }, [])
  // Copy path (⌘⇧,, Edit menu, the tab bar's link button) works on any Tab,
  // an Image Tab included, so it goes with no Tab rather than no Document.
  const onCopyPath = useCallback(() => {
    if (activeTabPath) copyPathWithToast(activeTabPath)
  }, [activeTabPath])
  // Reveal in Finder and Open in Default App (File menu, the tab bar's "…",
  // an Image Tab's Open ↗) hand the active Tab's file to macOS, and go with
  // the Tab the same way.
  const onRevealInFinder = useCallback(() => {
    if (activeTabPath) revealTabFile(activeTabPath)
  }, [activeTabPath])
  const onOpenInDefaultApp = useCallback(() => {
    if (activeTabPath) openTabFileInDefaultApp(activeTabPath, folder)
  }, [activeTabPath, folder])
  // Pin/Unpin (File menu, the "…" menu, the Command Menu) acts on the active
  // Tab's file, which must be a Document or an Image file in the Folder; any
  // other Tab leaves it greyed, as a pinned file that has just left the
  // Folder is unpinned already.
  const activeTabPinned = activeTabPath !== null && pinned.isPinned(activeTabPath)
  const canPinActiveTab = activeTabPath !== null && (activeTabPinned || pinned.canPin(activeTabPath))
  const { toggle: togglePin } = pinned
  const onTogglePin = useCallback(() => {
    if (activeTabPath) togglePin(activeTabPath)
  }, [activeTabPath, togglePin])
  const onDuplicate = useCallback(() => {
    if (activeTabPath) duplicate(activeTabPath)
  }, [activeTabPath, duplicate])
  const tabFileCommands = useMemo<TabCommands>(() => ({
    pinned: activeTabPinned,
    onTogglePin: canPinActiveTab ? onTogglePin : undefined,
    onDuplicate: activeTabPath ? onDuplicate : undefined,
    onRevealInFinder: activeTabPath ? onRevealInFinder : undefined,
    onOpenInDefaultApp: activeTabPath ? onOpenInDefaultApp : undefined,
  }), [activeTabPath, activeTabPinned, canPinActiveTab, onDuplicate, onOpenInDefaultApp, onRevealInFinder, onTogglePin])

  // Paste without Formatting (⌘⇧V, Edit menu): the clipboard's text, read
  // through the carried Rust clipboard module in Tauri, inserted as plain
  // Markdown text into whichever surface holds the caret.
  const onPastePlainText = useCallback(() => {
    requestPlainTextPaste().catch((error: unknown) => console.warn('Paste without Formatting failed:', error))
  }, [])

  // The Command Menu (⌘K) and Quick Open (⌘P) are one palette in two modes.
  // ⌘K always opens; with no Folder it lists commands only.
  // Quick Open searches the Folder, so with none it is disabled like its menu
  // item, by handing the dispatcher no handler.
  const { open: commandMenuOpen, mode: commandMenuMode, openCommands: openCommandMenu, openFiles: openQuickOpen, close: closeCommandMenu } = useCommandMenu()
  const hasFolder = folder !== null
  const hasTab = activeTabPath !== null
  // Settings (⌘,, the Plumo menu, the Folder switcher) opens the dialog; a
  // second ⌘, while it is open changes nothing. ⌘W closes it and leaves the
  // Tabs alone, as ⌘W closes a macOS Settings window.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = useCallback(() => setSettingsOpen(true), [])
  const closeSettings = useCallback(() => setSettingsOpen(false), [])

  // ⌘[ toggles the sidebar in both states; in Raw mode it shadows CodeMirror's
  // indent-less (⌘] stays the editor's).
  const handlers = useMemo<MenuEventHandlers>(() => ({
    activeDocumentPath,
    hasFolder,
    hasTab,
    canPin: canPinActiveTab,
    hasRichDocument,
    onOpenNote,
    onOpenVault: onOpenFolder,
    onCloseVault: onCloseFolder,
    onSave,
    onQuit: quit,
    onToggleSidebar: toggleSidebar,
    onToggleRawEditor: activeDocumentPath ? onToggleRawEditor : undefined,
    onFindInNote: activeDocumentPath ? onFindInNote : undefined,
    onUndo: activeDocumentPath ? onUndo : undefined,
    onRedo: activeDocumentPath ? onRedo : undefined,
    onDuplicateBlock: hasRichDocument ? onDuplicateBlock : undefined,
    onCopyPath: hasTab ? onCopyPath : undefined,
    ...tabFileCommands,
    ...tabCommands.handlers,
    ...appearance.handlers,
    onOpenSettings: openSettings,
    ...(settingsOpen ? { onCloseTab: closeSettings } : {}),
    onCreateNote: createDocumentFromShell,
    onQuickOpen: hasFolder ? openQuickOpen : undefined,
    onCommandPalette: openCommandMenu,
    onPastePlainText,
  }), [activeDocumentPath, appearance.handlers, canPinActiveTab, createDocumentFromShell, hasFolder, hasRichDocument, hasTab, onCloseFolder, onCopyPath, onDuplicateBlock, onFindInNote, onOpenFolder, onOpenNote, onPastePlainText, onRedo, onSave, onToggleRawEditor, onUndo, openCommandMenu, openQuickOpen, openSettings, closeSettings, quit, settingsOpen, tabCommands, tabFileCommands, toggleSidebar])
  useAppKeyboard(handlers)
  useMenuEvents(handlers)

  // The palette's rows: every menu-bar command with its enable state, and the
  // Folder's Documents and Image files by name (CONTEXT.md, Command Menu).
  const commandMenuEntries = useMemo(() => [
    ...commandMenuCommandEntries({ hasDocument: activeDocumentPath !== null, hasFolder, hasTab, canPin: canPinActiveTab, hasRichDocument }),
    ...commandMenuFileEntries(folderState.files, folder),
  ], [activeDocumentPath, canPinActiveTab, folder, folderState.files, hasFolder, hasRichDocument, hasTab])
  // A command row runs the same handler its menu item and shortcut would.
  const runCommandMenuCommand = useCallback((id: string) => {
    closeCommandMenu()
    if (isAppCommandId(id)) dispatchAppCommand(id, handlers)
  }, [closeCommandMenu, handlers])
  // ↵ opens a Tab as the Explorer would; ⌘↵ opens a Document straight into Raw.
  const openCommandMenuFile = useCallback((path: string, { raw }: { raw: boolean }) => {
    closeCommandMenu()
    void openNotesSettled({
      openNote: (target) => openNote(target, raw ? 'raw' : undefined),
      paths: [path],
      settleActiveNote: settleAndRecord,
    })
    focusEditorFor(path)
  }, [closeCommandMenu, focusEditorFor, openNote, settleAndRecord])
  // A `.md` dropped on the window opens like File → Open Document…; an image
  // dropped over a Document is the editor's, and nothing else is picked up.
  useDocumentDrop({ openNote: openLoneNote, settleActiveNote: settleAndRecord })
  // Finder double-click, Open With and the Dock icon open the same way, once
  // the Session is back so the Folder is known. The shell stays
  // unpainted until the launch Document is in place.
  const { settled: finderOpenSettled } = useFinderOpen({ openNote: openLoneNote, settleActiveNote: settleAndRecord, ready: restored })

  // Nothing is painted until the Session and the Settings are back and any
  // Finder launch Document is open, so a launch never shows the expanded sidebar, or the
  // Session's Tab, for a frame before the right state (the window's own
  // background colour is the canvas until then).
  return (
    <div
      className="relative flex h-full w-full bg-surface-app text-text-primary data-restoring:invisible"
      data-testid="shell"
      data-restoring={!(restored && settingsRestored && finderOpenSettled) || undefined}
      data-sidebar-slides={sidebarSlides || undefined}
    >
      <Sidebar collapsed={sidebar.collapsed} slides={sidebarSlides} width={sidebar.width} onWidthChange={setSidebarWidth}>
        <Pinned
          paths={pinned.paths}
          activeTabPath={activeTabPath}
          collapsed={sidebar.collapsedSections?.includes('pinned') ?? false}
          onToggleCollapsed={onTogglePinnedSection}
          onOpen={openPinnedFile}
          onUnpin={togglePin}
          onDuplicate={duplicate}
          onMove={pinned.move}
        />
        <Explorer
          folder={folder}
          tree={explorerTree}
          activeTabPath={activeTabPath}
          onOpenFile={openFileAndFocus}
          actions={explorerActions}
          onFocusEditor={focusActiveEditor}
          memory={explorerMemory}
          onCloseFolder={onCloseFolder}
          onOpenFolder={onOpenFolder}
          error={folderState.error}
          pins={pinned}
          collapsed={sidebar.collapsedSections?.includes('explorer') ?? false}
          onToggleCollapsed={onToggleExplorerSection}
          onExpand={onOpenExplorerSection}
        />
        {folder === null ? (
          <RecentFolderList paths={recent.paths} home={home} onOpen={onOpenRecentFolder} />
        ) : (
          <FolderSwitcher
            folder={folder}
            files={folderState.files}
            recentFolders={recent.paths}
            home={home}
            onOpenRecent={onOpenRecentFolder}
            onOpenFolder={onOpenFolder}
            onCloseFolder={onCloseFolder}
            onOpenSettings={openSettings}
          />
        )}
      </Sidebar>
      <Editor
        tabs={tabs}
        activeTabPath={activeTabPath}
        imageFile={activeImageFile}
        vaultPath={vaultPath}
        folder={folder}
        hasPendingEditorContentRef={hasPendingEditorContentRef}
        onContentChange={onContentChange}
        onRawContentChange={onRawContentChange}
        flushPendingEditorContentRef={flushPendingEditorContentRef}
        flushPendingRawContentRef={flushPendingRawContentRef}
        rawToggleRef={rawToggleRef}
        findRef={findRef}
        historyRef={historyRef}
        duplicateBlockRef={duplicateBlockRef}
        onSetTabMode={setTabMode}
        onActivateTab={tabCommands.activateTabSettled}
        onCloseTab={tabCommands.closeTabSettled}
        onNewDocument={hasFolder ? createDocumentFromShell : undefined}
        tabCommands={tabFileCommands}
        writeFailure={writeFailures.failureFor(activeTabPath)}
        writeFailurePending={writeFailures.pendingFor(activeTabPath)}
        onRetryWrite={retry}
        onDiscardWrite={discard}
        onCopyPath={onCopyPath}
        themeMode={appearance.themeMode}
        sidebarCollapsed={sidebar.collapsed}
      />
      <SidebarToggle collapsed={sidebar.collapsed} onToggle={toggleSidebar} />
      <WriteFailureDialog
        prompt={writeFailures.prompt}
        pending={writeFailures.promptPending ?? writeFailures.pendingFor(writeFailures.prompt?.path ?? null)}
        onAnswer={answerPrompt}
        onDismiss={dismissPrompt}
      />
      <CommandMenu
        open={commandMenuOpen}
        mode={commandMenuMode}
        entries={commandMenuEntries}
        onClose={closeCommandMenu}
        onRunCommand={runCommandMenuCommand}
        onOpenFile={openCommandMenuFile}
      />
      <SettingsDialog
        open={settingsOpen}
        onClose={closeSettings}
        theme={appearance.themeMode}
        onThemeChange={appearance.setThemeMode}
      />
    </div>
  )
}

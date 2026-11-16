import type { EditorMode, Tab } from '@/types'
import { isWithinPrefix, replaceFolderPrefix } from '@/folder/folder-action-utils'
import { frontmatterForcesRaw } from '@/kernel/markdown/frontmatter-status'
import { isImageFilePath } from './image-file'
import { noteStem } from '@/folder/note-entry'
import { notePathFilename } from '@/lib/note-path-identity'

/**
 * The Tab rules, as pure transitions over the open Tabs in
 * the kernel's `Tab` shape. A Document has at most one Tab; closing the
 * active Tab activates the one to its right, else the left; navigation is
 * positional. New Plumo code: the kernel persists neither tabs nor their order.
 *
 * A Document Tab also carries its mode: Rich for any freshly opened
 * Document, remembered per Tab, and Raw whenever the Document's Frontmatter is
 * invalid, so Rich mode never rewrites bytes it could not round-trip. That
 * rule is applied to every Tab whose content changes hands here, and an Image
 * Tab has no mode at all.
 */

export interface NoteTabsState {
  /** Tab order. */
  tabs: Tab[]
  activeTabPath: string | null
}

export const EMPTY_NOTE_TABS: NoteTabsState = { tabs: [], activeTabPath: null }

function indexOfPath(tabs: Tab[], path: string | null): number {
  return path === null ? -1 : tabs.findIndex((tab) => tab.entry.path === path)
}

/** The mode a Tab is allowed to be in: an Image Tab has none, invalid Frontmatter forces Raw, else the one it asked for (Rich by default). */
function ruledMode(tab: Tab): EditorMode | undefined {
  if (isImageFilePath(tab.entry.path)) return undefined
  return frontmatterForcesRaw(tab.content) ? 'raw' : tab.mode ?? 'rich'
}

function withRuledMode(tab: Tab): Tab {
  const mode = ruledMode(tab)
  return mode === tab.mode ? tab : { ...tab, mode }
}

/** Every Tab under the mode rule; the same array back when nothing changes. */
export function applyModeRule(tabs: Tab[]): Tab[] {
  let changed = false
  const ruled = tabs.map((tab) => {
    const next = withRuledMode(tab)
    if (next !== tab) changed = true
    return next
  })
  return changed ? ruled : tabs
}

/** Append a freshly read Document and activate it; a Document already open is only activated. */
export function openTab(state: NoteTabsState, tab: Tab): NoteTabsState {
  const path = tab.entry.path
  if (indexOfPath(state.tabs, path) !== -1) return activateTab(state, path)
  return { tabs: [...state.tabs, withRuledMode(tab)], activeTabPath: path }
}

/**
 * Put a Document Tab in Rich or Raw mode (⌘\, the Source mode button).
 * Rich is refused while the Frontmatter is invalid; an
 * Image Tab and a path that is not open are left alone.
 */
export function setTabMode(state: NoteTabsState, path: string, mode: EditorMode): NoteTabsState {
  const index = indexOfPath(state.tabs, path)
  if (index === -1) return state
  const tab = state.tabs[index]
  const ruled = withRuledMode({ ...tab, mode })
  if (ruled.mode === tab.mode) return state
  const tabs = state.tabs.slice()
  tabs[index] = ruled
  return { ...state, tabs }
}

/** The Tab that takes over when the one at `index` closes: the right neighbour, else the left, else none. */
function successorPath(tabs: Tab[], index: number): string | null {
  const successor = tabs[index + 1] ?? tabs[index - 1]
  return successor ? successor.entry.path : null
}

export function closeTab(state: NoteTabsState, path: string): NoteTabsState {
  const index = indexOfPath(state.tabs, path)
  if (index === -1) return state
  const tabs = state.tabs.filter((tab) => tab.entry.path !== path)
  const activeTabPath = state.activeTabPath === path ? successorPath(state.tabs, index) : state.activeTabPath
  return { tabs, activeTabPath }
}

export function activateTab(state: NoteTabsState, path: string): NoteTabsState {
  if (state.activeTabPath === path || indexOfPath(state.tabs, path) === -1) return state
  return { ...state, activeTabPath: path }
}

/** Jump to the Tab at `index` (0-based); out of range is a no-op. */
export function activateTabAt(state: NoteTabsState, index: number): NoteTabsState {
  const target = state.tabs[index]
  return target ? activateTab(state, target.entry.path) : state
}

/** The same Tab at a new path: its bytes are untouched, only its name moves. */
function movedTab(tab: Tab, path: string): Tab {
  const filename = notePathFilename(path)
  return { ...tab, entry: { ...tab.entry, path, filename, title: noteStem(filename) } }
}

/**
 * Follow a rename: an open Document or Image file moves to its new path, and a
 * renamed folder takes every Tab beneath it along. The Tabs
 * keep their order and their content, so nothing is re-read; the active Tab
 * stays active at its new path.
 */
export function retargetTabs(state: NoteTabsState, oldPath: string, newPath: string): NoteTabsState {
  if (oldPath === newPath) return state
  const moved = (path: string) => replaceFolderPrefix({ path, oldPrefix: oldPath, newPrefix: newPath })
  if (!state.tabs.some((tab) => isWithinPrefix({ path: tab.entry.path, prefix: oldPath }))) return state

  const tabs = state.tabs.map((tab) => (
    isWithinPrefix({ path: tab.entry.path, prefix: oldPath }) ? movedTab(tab, moved(tab.entry.path)) : tab
  ))
  const activeTabPath = state.activeTabPath && isWithinPrefix({ path: state.activeTabPath, prefix: oldPath })
    ? moved(state.activeTabPath)
    : state.activeTabPath
  return { tabs, activeTabPath }
}

/** Previous (-1) or next (+1) Tab positionally, wrapping at either end. */
export function activateAdjacentTab(state: NoteTabsState, direction: 1 | -1): NoteTabsState {
  const count = state.tabs.length
  if (count === 0) return state
  const current = Math.max(indexOfPath(state.tabs, state.activeTabPath), 0)
  return activateTabAt(state, (current + direction + count) % count)
}

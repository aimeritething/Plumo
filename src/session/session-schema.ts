import type { EditorMode } from '@/types'
import { isImageFilePath } from '@/tabs/image-file'
import { parsePinnedLists, type PinnedLists } from '@/pinned/pinned-list'
import { MAX_RECENT_FOLDERS, type RecentFolders } from '@/recent-folders/recent-folders'

/**
 * The Session file: one `session.json` in the app's config
 * directory, restored on launch. This module is the schema. The Rust side
 * owns the file itself and the `window` frame, which it merges in when it
 * writes; the renderer sends everything else and never reads `window` back.
 *
 * `folder` roots the Explorer; `sidebar` is whether it is collapsed, how
 * wide it is when shown and which of its sections are folded away; `pinned` is
 * each Folder's Pinned list, keyed by the Folder's path, so a Folder opened
 * again gets its pins back. The theme is not here: it is a Setting, in the
 * Settings file (`@/settings/settings-schema`); a `theme` left in an older
 * Session is ignored.
 * `openEditors` and `activePath` are the current Folder's Tabs; `tabsByFolder`
 * holds every other Folder's, as they were when it was last shown, and
 * `recentFolders` is the Recent Folders, most recent first.
 */

export const SESSION_VERSION = 1

export type SessionEditorMode = EditorMode

export interface SessionEditor {
  path: string
  /** `rich | raw` for a Document; omitted for an Image file (kind derives from the extension). */
  mode?: SessionEditorMode
}

/** A sidebar section that folds away under its label (the Explorer's is the Folder's name). */
export type SidebarSection = 'pinned' | 'explorer'

export interface SessionSidebar {
  collapsed: boolean
  width: number
  /** The sections folded away; one left out is open. */
  collapsedSections?: readonly SidebarSection[]
}

/** A Folder's Tabs, in order, and its active Tab, as it had them when it was last shown. */
export interface FolderTabs {
  openEditors: SessionEditor[]
  activePath: string | null
}

/** Each Folder's Tabs but the current one's, keyed by the Folder's path; a Folder with none has no key. */
export type TabsByFolder = Readonly<Record<string, FolderTabs>>

export interface Session {
  version: typeof SESSION_VERSION
  folder: string | null
  /** Tab order. */
  openEditors: SessionEditor[]
  activePath: string | null
  sidebar: SessionSidebar
  /** Each Folder's pinned paths, in order; a Folder with none has no key. */
  pinned: PinnedLists
  /** The Recent Folders' paths, most recent first. */
  recentFolders: string[]
  tabsByFolder: TabsByFolder
}

export interface RestoredOpenEditors {
  openEditors: SessionEditor[]
  activePath: string | null
}

export const DEFAULT_SESSION_SIDEBAR: SessionSidebar = { collapsed: false, width: 260 }

/** The sidebar's drag range. A width outside it, restored or dragged, lands on the nearer end. */
export const SIDEBAR_MIN_WIDTH = 180
export const SIDEBAR_MAX_WIDTH = 480

export function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)))
}

const EDITOR_MODES = new Set<SessionEditorMode>(['rich', 'raw'])
const SIDEBAR_SECTIONS = new Set<string>(['pinned', 'explorer'] satisfies SidebarSection[])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseEditor(value: unknown): SessionEditor | null {
  if (!isRecord(value) || typeof value.path !== 'string') return null
  const mode = typeof value.mode === 'string' && EDITOR_MODES.has(value.mode as SessionEditorMode)
    ? (value.mode as SessionEditorMode)
    : undefined
  return mode ? { path: value.path, mode } : { path: value.path }
}

function parseEditors(value: unknown): SessionEditor[] {
  if (!Array.isArray(value)) return []
  return value.map(parseEditor).filter((editor): editor is SessionEditor => editor !== null)
}

function parseCollapsedSections(value: unknown): SidebarSection[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((section): section is SidebarSection => typeof section === 'string' && SIDEBAR_SECTIONS.has(section)))]
}

function parseSidebar(value: unknown): SessionSidebar {
  if (!isRecord(value)) return DEFAULT_SESSION_SIDEBAR
  const sidebar: SessionSidebar = {
    collapsed: typeof value.collapsed === 'boolean' ? value.collapsed : DEFAULT_SESSION_SIDEBAR.collapsed,
    width: typeof value.width === 'number' && Number.isFinite(value.width) ? clampSidebarWidth(value.width) : DEFAULT_SESSION_SIDEBAR.width,
  }
  const collapsedSections = parseCollapsedSections(value.collapsedSections)
  return collapsedSections.length > 0 ? { ...sidebar, collapsedSections } : sidebar
}

function parseNullableString(value: unknown): string | null {
  return typeof value === 'string' ? value : null
}

/** Paths only, each once, at most ten. */
function parseRecentFolders(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((path): path is string => typeof path === 'string' && path !== ''))].slice(0, MAX_RECENT_FOLDERS)
}

/** A Folder whose entry holds no Tab leaves no key. */
function parseTabsByFolder(value: unknown): TabsByFolder {
  if (!isRecord(value)) return {}
  const byFolder: Record<string, FolderTabs> = {}
  for (const [folder, tabs] of Object.entries(value)) {
    if (!isRecord(tabs)) continue
    const openEditors = parseEditors(tabs.openEditors)
    if (openEditors.length > 0) byFolder[folder] = { openEditors, activePath: parseNullableString(tabs.activePath) }
  }
  return byFolder
}

/**
 * The Session the file holds, or null when there is none to restore: a
 * missing file, something that is not a Session, or an unknown `version`
 * (which the shell then rewrites in the current schema).
 */
export function parseSession(raw: unknown): Session | null {
  if (!isRecord(raw) || raw.version !== SESSION_VERSION) return null
  return {
    version: SESSION_VERSION,
    folder: parseNullableString(raw.folder),
    openEditors: parseEditors(raw.openEditors),
    activePath: parseNullableString(raw.activePath),
    sidebar: parseSidebar(raw.sidebar),
    pinned: parsePinnedLists(raw.pinned),
    recentFolders: parseRecentFolders(raw.recentFolders),
    tabsByFolder: parseTabsByFolder(raw.tabsByFolder),
  }
}

/**
 * The next surviving entry after `index` in `paths`, else the nearest
 * surviving one before it. Mirrors the successor rule for closing a Tab.
 */
function nearestSurvivor(paths: string[], index: number, survives: ReadonlySet<string>): string | null {
  const after = paths.slice(index + 1).find((path) => survives.has(path))
  if (after) return after
  const before = paths.slice(0, index).reverse().find((path) => survives.has(path))
  return before ?? null
}

/**
 * Restore rule: a Tab whose file no longer exists is dropped
 * silently; if it was the active one, the next surviving Tab in order becomes
 * active.
 */
export function restoreOpenEditors(
  session: Pick<Session, 'openEditors' | 'activePath'>,
  survives: ReadonlySet<string>,
): RestoredOpenEditors {
  const openEditors = session.openEditors.filter((editor) => survives.has(editor.path))
  if (openEditors.length === 0) return { openEditors, activePath: null }

  const paths = session.openEditors.map((editor) => editor.path)
  const activeIndex = session.activePath === null ? -1 : paths.indexOf(session.activePath)
  if (activeIndex === -1) return { openEditors, activePath: openEditors[0].path }
  if (survives.has(paths[activeIndex])) return { openEditors, activePath: paths[activeIndex] }
  return { openEditors, activePath: nearestSurvivor(paths, activeIndex, survives) }
}

/** What the shell hands over per open Tab: its path and, for a Document, the mode it is in. */
export interface OpenEditorInput {
  path: string
  mode?: SessionEditorMode
}

/** An Image file entry carries no `mode`; a Document with none named is Rich. */
export function sessionEditors(editors: readonly OpenEditorInput[]): SessionEditor[] {
  return editors.map(({ path, mode }) => (isImageFilePath(path) ? { path } : { path, mode: mode ?? 'rich' }))
}

const NO_RECENT_FOLDERS: RecentFolders = { paths: [], tabsByFolder: {} }

/**
 * The Session for the open Tabs, each Document with its Rich or Raw mode,
 * the sidebar state, every Folder's Pinned list, the
 * Recent Folders and the other Folders' Tabs. An Image file entry
 * carries no `mode`: its kind comes from the extension. A Document with no
 * mode named is written as Rich, the default for a freshly opened one.
 */
export function sessionForOpenEditors(
  openEditors: readonly OpenEditorInput[],
  activePath: string | null,
  folder: string | null = null,
  sidebar: SessionSidebar = DEFAULT_SESSION_SIDEBAR,
  pinned: PinnedLists = {},
  recent: RecentFolders = NO_RECENT_FOLDERS,
): Session {
  const { collapsed, width, collapsedSections = [] } = sidebar
  return {
    version: SESSION_VERSION,
    folder,
    openEditors: sessionEditors(openEditors),
    activePath,
    sidebar: collapsedSections.length > 0 ? { collapsed, width, collapsedSections } : { collapsed, width },
    pinned,
    recentFolders: [...recent.paths],
    tabsByFolder: recent.tabsByFolder,
  }
}

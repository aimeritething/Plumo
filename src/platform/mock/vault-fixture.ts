import { lockedExtension } from '@/folder/explorer-names'
import { notePathFilename } from '@/lib/note-path-identity'
import { styleCatalogEntries, type StyleCatalogEntry } from './style-catalog'

/**
 * In-memory Folder fixture: the stand-in for the Rust side when Plumo runs in a
 * plain browser (`pnpm dev`, the Playwright smoke specs). It answers the
 * commands the shell needs to boot, list and edit from memory and rejects
 * everything else with the same message the kernel's mock used, so a spec that
 * reaches an unanswered command fails loudly rather than silently.
 *
 * The default seed is a handful of small files the specs lean on, plus the style
 * catalog under `Style catalog/` (see `./style-catalog`): the Documents a person
 * reads while tuning styles. The catalog changes often, so a spec never asserts
 * on what is inside it.
 *
 * Extending it for a later spec: seed files through `createMockVault(seed)` or
 * `reset(seed)`, stand in for Finder with `seedPendingOpen` (the path a launch by
 * document finds buffered; kept in localStorage so the next page load, like a
 * relaunch, drains it), `queuePendingOpen` (buffer only) and `openFromFinder`
 * (buffer and poke, an open while Plumo is running), and assert on `calls`
 * (every invocation in order). Add a case to the `answer` switch when a
 * spec needs a command the fixture does not answer yet. The system file dialog
 * has no command behind it, so the fixture stands in for that too: a spec
 * queues the path the user "chooses" with `queueDialogSelection` and the shell
 * takes it with `takeDialogSelection`. What another app does to the Folder
 * behind Plumo's back is `writeNote`, `removeFile` and `movePath`, each followed
 * by `emitExternalChange` with the paths a watcher would have reported.
 *
 * Like a real directory tree, every ancestor folder of a seeded or saved path
 * exists implicitly. Shapes follow the Rust commands: absolute paths in,
 * Folder-relative `/`-separated paths for the folder commands, `modifiedAt` in
 * seconds, errors as the Rust boundary's strings. `list_files` is shared with
 * the Plumo-owned Rust scanner; `take_pending_open` with the Rust side's
 * `PendingOpen` buffer.
 */

export const MOCK_VAULT_PATH = '/Users/plumo/Documents/Notes'

export type MockVaultFileKind = 'note' | 'folder' | 'image'

export interface MockVaultFile {
  path: string
  kind: MockVaultFileKind
  /** Present for notes only. */
  content?: string
  /** Present for images only: what the asset protocol would serve, as a data URL. */
  dataUrl?: string
  /** Seconds since the epoch, as the Rust side reports it. */
  modifiedAt: number
  fileSize: number
}

export type MockVaultListing = Pick<MockVaultFile, 'path' | 'kind' | 'modifiedAt' | 'fileSize'>

/** A picture the fixture can serve: an SVG of the given natural size, weighing the given bytes. */
export interface MockVaultImage {
  width: number
  height: number
  fileSize: number
  fill?: string
  /** Extra SVG markup inside the picture, so a spec can plant a `<script>` an `<img>` must not run. */
  markup?: string
}

export interface MockVaultCall {
  command: string
  args: Record<string, unknown> | undefined
}

export interface MockVaultCommands {
  list_files: { args: { vaultPath: string }; result: MockVaultListing[] }
  get_note_content: { args: { path: string; vaultPath?: string }; result: string }
  save_note_content: { args: { path: string; content: string; vaultPath?: string }; result: void }
  start_vault_watcher: { args: { path: string }; result: void }
  stop_vault_watcher: { args?: undefined; result: void }
  take_pending_open: { args?: undefined; result: string[] }
  read_session: { args?: undefined; result: unknown }
  update_session: { args: { session: unknown }; result: void }
  read_settings: { args?: undefined; result: unknown }
  update_settings: { args: { settings: unknown }; result: void }
  quit_app: { args?: undefined; result: void }
  create_note_content: { args: { path: string; content: string; vaultPath?: string }; result: void }
  duplicate_vault_file: { args: { path: string; newPath: string; vaultPath?: string }; result: void }
  create_vault_folder: { args: { vaultPath: string; folderName: string; parentPath?: string }; result: string }
  rename_vault_file: { args: { vaultPath: string; oldPath: string; newStem: string }; result: { new_path: string } }
  rename_vault_folder: { args: { vaultPath: string; folderPath: string; newName: string }; result: { old_path: string; new_path: string } }
  move_note_to_folder: { args: { vaultPath: string; oldPath: string; folderPath: string }; result: { new_path: string } }
  delete_note: { args: { path: string; vaultPath: string }; result: string }
  delete_vault_folder: { args: { vaultPath: string; folderPath: string }; result: string }
  reveal_path_in_file_manager: { args: { path: string }; result: void }
  open_vault_file_external: { args: { path: string; vaultPath?: string }; result: void }
  copy_text_to_clipboard: { args: { text: string }; result: void }
}

export interface MockVault {
  readonly vaultPath: string
  readonly calls: MockVaultCall[]
  invoke<C extends keyof MockVaultCommands>(command: C, args?: MockVaultCommands[C]['args']): Promise<MockVaultCommands[C]['result']>
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>
  files(): MockVaultFile[]
  /** Write a note directly, without going through (or logging) a command. */
  writeNote(path: string, content: string): void
  /** Write an Image file directly: the stand-in for a picture saved from another app. */
  writeImage(path: string, image: MockVaultImage): void
  /** What the asset protocol would serve for an Image file, or null when there is no such picture. */
  assetUrl(path: string): string | null
  /** The last path handed to Reveal in Finder, to Open in Default App, and the last text put on the clipboard. */
  revealedPath(): string | null
  openedExternallyPath(): string | null
  clipboardText(): string | null
  removeFile(path: string): void
  /** Move a file or a whole folder without going through a command: Finder's stand-in. */
  movePath(path: string, newPath: string): void
  emitExternalChange(paths: string[]): void
  watchedPath(): string | null
  /** Buffer paths for the next `take_pending_open`, without a poke. */
  queuePendingOpen(paths: string[]): void
  /** Buffer paths and poke the renderer, as the Rust side does for an open while Plumo is running. */
  openFromFinder(paths: string[]): void
  /** Plant the Finder open the next launch (page load) finds buffered, as a launch by document does. */
  seedPendingOpen(paths: string[]): void
  /** Queue what the next Open Document… dialogs "return", in order. */
  queueDialogSelection(paths: string[]): void
  /** The next queued dialog selection, or null for a cancelled dialog. */
  takeDialogSelection(): string | null
  /** Make `save_note_content` refuse these paths, as a read-only file would; an empty list lifts it. */
  markReadOnly(paths: string[]): void
  /** Plant the Session file the next launch (page load) reads; null removes it. */
  seedSession(session: unknown): void
  /** Plant the Settings file the next launch (page load) reads; null removes it. */
  seedSettings(settings: unknown): void
  /** Restore the seed (or a new one), clear the watcher, the pending opens, the dialog queue, the read-only marks, the Session and Settings files and the call log. */
  reset(seed?: MockVaultFile[]): void
}

declare global {
  interface Window {
    /** The fixture, installed by `installMockVault` in `./index` so specs can seed and inspect it. */
    __plumoMockVault?: MockVault
  }
}

const ACTIVE_VAULT_PATH_ERROR = 'Path must stay inside the active vault'
const ACTIVE_VAULT_UNAVAILABLE_ERROR = 'Active vault is not available'
const FILE_DOES_NOT_EXIST_ERROR = 'File does not exist'
const NOT_A_NOTE_ERROR = 'Path is not a note'
const NOT_AN_IMAGE_ERROR = 'Path is not an Image file'
const FILE_EXISTS_ERROR = 'File already exists'
const NAME_TAKEN_ERROR = 'A file with that name already exists'
const READ_ONLY_ERROR = 'Failed to write file: Permission denied (os error 13)'
const SESSION_STORAGE_KEY = 'plumo:mock-session'
const SETTINGS_STORAGE_KEY = 'plumo:mock-settings'
const PENDING_OPEN_STORAGE_KEY = 'plumo:mock-pending-open'
/** The stand-in for the Rust side's poke; `listenForOpenRequests` hears it outside Tauri. */
const OPEN_FILES_EVENT = 'plumo:open-files'

export const DEFAULT_MOCK_VAULT_FILES: MockVaultFile[] = [
  file('Welcome.md', 'note', '# Welcome\n\nThis Folder lives in memory. Edits stay for the life of the page.\n', 1_757_500_000),
  file('Reading list.md', 'note', '# Reading list\n\n- [ ] A Philosophy of Software Design\n- [x] Practical Vim\n', 1_757_500_100),
  file('Projects', 'folder', undefined, 1_757_500_200),
  file('Projects/Plumo.md', 'note', '---\ntitle: Plumo\n---\n# Plumo\n\nA small desktop app for Markdown files.\n', 1_757_500_300),
  file('Attachments', 'folder', undefined, 1_757_500_400),
  image('Attachments/lake.png', { width: 1920, height: 1080, fileSize: 245_760 }, 1_757_500_500),
  ...styleCatalogEntries().map(catalogFile),
]

function file(
  relativePath: string,
  kind: MockVaultFileKind,
  content: string | undefined,
  modifiedAt: number,
  fileSize = content?.length ?? 0,
): MockVaultFile {
  return { path: `${MOCK_VAULT_PATH}/${relativePath}`, kind, content, modifiedAt, fileSize }
}

/** An SVG of the requested natural size; the extension the Folder shows is the app's business, not the bytes'. */
function imageDataUrl({ width, height, fill = '#5b7cfa', markup = '' }: MockVaultImage): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="${fill}"/>${markup}</svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

function image(relativePath: string, picture: MockVaultImage, modifiedAt: number): MockVaultFile {
  return {
    path: `${MOCK_VAULT_PATH}/${relativePath}`,
    kind: 'image',
    dataUrl: imageDataUrl(picture),
    modifiedAt,
    fileSize: picture.fileSize,
  }
}

function catalogFile({ relativePath, content, dataUrl, fileSize }: StyleCatalogEntry): MockVaultFile {
  const path = `${MOCK_VAULT_PATH}/${relativePath}`
  return dataUrl === undefined
    ? { path, kind: 'note', content, modifiedAt: 1_757_600_000, fileSize }
    : { path, kind: 'image', dataUrl, modifiedAt: 1_757_600_000, fileSize }
}

function nowInSeconds(): number {
  return Math.floor(Date.now() / 1000)
}

function isInsideVault(path: string, vaultPath: string): boolean {
  return path === vaultPath || path.startsWith(`${vaultPath}/`)
}

function listing({ path, kind, modifiedAt, fileSize }: MockVaultFile): MockVaultListing {
  return { path, kind, modifiedAt, fileSize }
}

/** The ancestor directories of `path` below the root, shallowest first. */
function ancestorFolders(path: string, vaultPath: string): string[] {
  const segments = path.slice(vaultPath.length + 1).split('/').slice(0, -1)
  return segments.map((_, index) => `${vaultPath}/${segments.slice(0, index + 1).join('/')}`)
}

/** The mock Session and Settings files live in localStorage so a reload restores them like a relaunch. */
function readStoredFile(key: string): unknown {
  try {
    const raw = globalThis.localStorage?.getItem(key)
    return raw === null || raw === undefined ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

/** A Finder launch's paths, planted for the next page load; taking them clears the slot. */
function takeStoredPendingOpen(): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(PENDING_OPEN_STORAGE_KEY)
    globalThis.localStorage?.removeItem(PENDING_OPEN_STORAGE_KEY)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((path): path is string => typeof path === 'string') : []
  } catch {
    return []
  }
}

function writeStoredPendingOpen(paths: string[]): void {
  try {
    globalThis.localStorage?.setItem(PENDING_OPEN_STORAGE_KEY, JSON.stringify(paths))
  } catch {
    // Storage can be unavailable in restricted contexts; there is then no launch by document.
  }
}

function writeStoredFile(key: string, contents: unknown): void {
  try {
    if (contents === null || contents === undefined) globalThis.localStorage?.removeItem(key)
    else globalThis.localStorage?.setItem(key, JSON.stringify(contents))
  } catch {
    // Storage can be unavailable in restricted contexts; the file then lasts the page.
  }
}

function writeStoredSession(session: unknown): void {
  writeStoredFile(SESSION_STORAGE_KEY, session)
}

function writeStoredSettings(settings: unknown): void {
  writeStoredFile(SETTINGS_STORAGE_KEY, settings)
}

export function createMockVault(seed: MockVaultFile[] = DEFAULT_MOCK_VAULT_FILES): MockVault {
  const vaultPath = MOCK_VAULT_PATH
  let seedFiles = seed
  let files = new Map<string, MockVaultFile>()
  let watched: string | null = null
  let pendingOpen: string[] = []
  let dialogSelections: string[] = []
  let readOnlyPaths = new Set<string>()
  let revealed: string | null = null
  let openedExternally: string | null = null
  let clipboard: string | null = null
  const calls: MockVaultCall[] = []

  function ensureFolders(path: string, modifiedAt: number): void {
    for (const folder of ancestorFolders(path, vaultPath)) {
      if (!files.has(folder)) files.set(folder, { path: folder, kind: 'folder', modifiedAt, fileSize: 0 })
    }
  }

  /** Load the seed; a fresh fixture (a page load) finds the Session file the last one left. */
  function load(nextSeed: MockVaultFile[]): void {
    seedFiles = nextSeed
    files = new Map()
    for (const entry of nextSeed) {
      ensureFolders(entry.path, entry.modifiedAt)
      files.set(entry.path, { ...entry })
    }
    watched = null
    pendingOpen = takeStoredPendingOpen()
    dialogSelections = []
    readOnlyPaths = new Set()
    revealed = null
    openedExternally = null
    clipboard = null
    calls.length = 0
  }

  function reset(nextSeed: MockVaultFile[] = seedFiles): void {
    load(nextSeed)
    writeStoredSession(null)
    writeStoredSettings(null)
  }

  function requireRoot(candidate: unknown): void {
    if (candidate !== vaultPath && (typeof candidate !== 'string' || files.get(candidate)?.kind !== 'folder')) {
      throw new Error(ACTIVE_VAULT_UNAVAILABLE_ERROR)
    }
  }

  function requireInsideVault(candidate: unknown): string {
    if (typeof candidate !== 'string' || !isInsideVault(candidate, vaultPath)) {
      throw new Error(ACTIVE_VAULT_PATH_ERROR)
    }
    return candidate
  }

  function writeNote(candidate: unknown, content: string): void {
    const path = requireInsideVault(candidate)
    const existing = files.get(path)
    if (existing && existing.kind !== 'note') throw new Error(NOT_A_NOTE_ERROR)
    const modifiedAt = nowInSeconds()
    ensureFolders(path, modifiedAt)
    files.set(path, { path, kind: 'note', content, modifiedAt, fileSize: content.length })
  }

  function writeImage(candidate: unknown, picture: MockVaultImage): void {
    const path = requireInsideVault(candidate)
    const existing = files.get(path)
    if (existing && existing.kind !== 'image') throw new Error(NOT_AN_IMAGE_ERROR)
    const modifiedAt = nowInSeconds()
    ensureFolders(path, modifiedAt)
    files.set(path, { path, kind: 'image', dataUrl: imageDataUrl(picture), modifiedAt, fileSize: picture.fileSize })
  }

  /** Every path at or under a prefix, the way a directory rename moves a subtree. */
  function pathsUnder(prefix: string): string[] {
    return Array.from(files.keys()).filter((path) => path === prefix || path.startsWith(`${prefix}/`))
  }

  /** A rename is one move: the entries come out at the new prefix and nothing else changes. */
  function movePrefix(oldPrefix: string, newPrefix: string): void {
    if (files.has(newPrefix)) throw new Error(NAME_TAKEN_ERROR)
    for (const path of pathsUnder(oldPrefix)) {
      const entry = files.get(path) as MockVaultFile
      files.delete(path)
      const next = `${newPrefix}${path.slice(oldPrefix.length)}`
      files.set(next, { ...entry, path: next })
    }
  }

  /** The path a file takes when only its stem changes; the extension is the Explorer's to lock. */
  function renameStem(path: string, stem: string): string {
    const name = notePathFilename(path)
    return `${path.slice(0, path.length - name.length)}${stem}${lockedExtension(name).extension}`
  }

  function answer(command: string, args: Record<string, unknown> | undefined): unknown {
    switch (command) {
      case 'list_files': {
        requireRoot(args?.vaultPath)
        const root = args?.vaultPath as string
        return Array.from(files.values()).filter((file) => file.path !== root && isInsideVault(file.path, root))
          .filter((file) => !file.path.slice(root.length + 1).split('/').some((part) => part.startsWith('.') || part === 'node_modules'))
          .map(listing)
      }
      case 'get_note_content': {
        const note = files.get(requireInsideVault(args?.path))
        if (note?.kind !== 'note') throw new Error(FILE_DOES_NOT_EXIST_ERROR)
        return note.content ?? ''
      }
      case 'save_note_content': {
        const path = requireInsideVault(args?.path)
        if (readOnlyPaths.has(path)) throw new Error(READ_ONLY_ERROR)
        writeNote(path, typeof args?.content === 'string' ? args.content : '')
        return undefined
      }
      case 'start_vault_watcher': {
        watched = requireInsideVault(args?.path)
        return undefined
      }
      case 'stop_vault_watcher': {
        watched = null
        return undefined
      }
      case 'take_pending_open': {
        const drained = pendingOpen
        pendingOpen = []
        return drained
      }
      case 'read_session':
        return readStoredFile(SESSION_STORAGE_KEY)
      case 'update_session': {
        writeStoredSession(args?.session ?? null)
        return undefined
      }
      case 'read_settings':
        return readStoredFile(SETTINGS_STORAGE_KEY)
      case 'update_settings': {
        writeStoredSettings(args?.settings ?? null)
        return undefined
      }
      // The renderer's last step of ⌘Q; in a browser there is nothing to exit,
      // so the call log is the whole effect.
      case 'quit_app':
        return undefined
      case 'create_note_content': {
        const path = requireInsideVault(args?.path)
        if (files.has(path)) throw new Error(`${FILE_EXISTS_ERROR}: ${path}`)
        writeNote(path, typeof args?.content === 'string' ? args.content : '')
        return undefined
      }
      case 'duplicate_vault_file': {
        const source = files.get(requireInsideVault(args?.path))
        const path = requireInsideVault(args?.newPath)
        if (!source || source.kind === 'folder') throw new Error(FILE_DOES_NOT_EXIST_ERROR)
        if (files.has(path)) throw new Error(`${FILE_EXISTS_ERROR}: ${path}`)
        files.set(path, { ...source, path, modifiedAt: nowInSeconds() })
        return undefined
      }
      case 'create_vault_folder': {
        requireRoot(args?.vaultPath)
        const parent = typeof args?.parentPath === 'string' && args.parentPath
          ? `${args.vaultPath as string}/${args.parentPath}`
          : (args?.vaultPath as string)
        const name = String(args?.folderName ?? '')
        const path = requireInsideVault(`${parent}/${name}`)
        if (files.has(path)) throw new Error(`Folder '${name}' already exists`)
        files.set(path, { path, kind: 'folder', modifiedAt: nowInSeconds(), fileSize: 0 })
        return name
      }
      case 'rename_vault_file': {
        requireRoot(args?.vaultPath)
        const path = requireInsideVault(args?.oldPath)
        if (!files.has(path)) throw new Error(FILE_DOES_NOT_EXIST_ERROR)
        const next = renameStem(path, String(args?.newStem ?? ''))
        if (next !== path) movePrefix(path, next)
        return { new_path: next }
      }
      case 'rename_vault_folder': {
        requireRoot(args?.vaultPath)
        const root = args?.vaultPath as string
        const relative = String(args?.folderPath ?? '')
        const path = requireInsideVault(`${root}/${relative}`)
        if (files.get(path)?.kind !== 'folder') throw new Error(`Folder does not exist: ${relative}`)
        const nextRelative = `${relative.split('/').slice(0, -1).concat(String(args?.newName ?? '')).join('/')}`
        const next = requireInsideVault(`${root}/${nextRelative}`)
        if (next !== path) movePrefix(path, next)
        return { old_path: relative, new_path: nextRelative }
      }
      case 'move_note_to_folder': {
        requireRoot(args?.vaultPath)
        const root = args?.vaultPath as string
        const path = requireInsideVault(args?.oldPath)
        if (!files.has(path)) throw new Error(FILE_DOES_NOT_EXIST_ERROR)
        const relative = String(args?.folderPath ?? '').trim()
        const destination = requireInsideVault(relative ? `${root}/${relative}` : root)
        if (destination !== root && files.get(destination)?.kind !== 'folder') {
          throw new Error(`Folder does not exist: ${relative}`)
        }
        const next = `${destination}/${notePathFilename(path)}`
        if (next !== path) movePrefix(path, next)
        return { new_path: next }
      }
      // Move to Trash: the fixture has no Trash to move anything into, so the
      // entry simply leaves the Folder, which is all the Explorer can see.
      case 'delete_note': {
        requireRoot(args?.vaultPath)
        const path = requireInsideVault(args?.path)
        if (files.get(path)?.kind === 'folder') throw new Error(`Path is not a file: ${path}`)
        if (!files.has(path)) throw new Error(FILE_DOES_NOT_EXIST_ERROR)
        files.delete(path)
        return path
      }
      case 'delete_vault_folder': {
        requireRoot(args?.vaultPath)
        const root = args?.vaultPath as string
        const relative = String(args?.folderPath ?? '')
        const path = requireInsideVault(`${root}/${relative}`)
        if (files.get(path)?.kind !== 'folder') throw new Error(`Folder does not exist: ${relative}`)
        for (const child of pathsUnder(path)) files.delete(child)
        return relative
      }
      case 'reveal_path_in_file_manager': {
        revealed = requireInsideVault(args?.path)
        return undefined
      }
      case 'open_vault_file_external': {
        const path = requireInsideVault(args?.path)
        if (!files.has(path)) throw new Error(FILE_DOES_NOT_EXIST_ERROR)
        openedExternally = path
        return undefined
      }
      case 'copy_text_to_clipboard': {
        clipboard = String(args?.text ?? '')
        return undefined
      }
      default:
        throw new Error(`No mock handler for command: ${command}`)
    }
  }

  load(seed)

  return {
    vaultPath,
    calls,
    async invoke(command: string, args?: Record<string, unknown>) {
      calls.push({ command, args })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the overloads carry the per-command type
      return answer(command, args) as any
    },
    files: () => Array.from(files.values(), (entry) => ({ ...entry })),
    writeNote,
    writeImage,
    assetUrl: (path) => files.get(path)?.dataUrl ?? null,
    removeFile: (path) => { files.delete(requireInsideVault(path)) },
    movePath: (path, newPath) => movePrefix(requireInsideVault(path), requireInsideVault(newPath)),
    emitExternalChange: (paths) => {
      window.dispatchEvent(new CustomEvent('plumo:external-change', { detail: paths }))
    },
    watchedPath: () => watched,
    revealedPath: () => revealed,
    openedExternallyPath: () => openedExternally,
    clipboardText: () => clipboard,
    queuePendingOpen: (paths) => {
      pendingOpen = [...pendingOpen, ...paths]
    },
    openFromFinder: (paths) => {
      pendingOpen = [...pendingOpen, ...paths]
      window.dispatchEvent(new CustomEvent(OPEN_FILES_EVENT, { detail: paths }))
    },
    seedPendingOpen: writeStoredPendingOpen,
    queueDialogSelection: (paths) => {
      dialogSelections = [...dialogSelections, ...paths]
    },
    takeDialogSelection: () => {
      const [next, ...rest] = dialogSelections
      dialogSelections = rest
      return next ?? null
    },
    markReadOnly: (paths) => {
      readOnlyPaths = new Set(paths)
    },
    seedSession: writeStoredSession,
    seedSettings: writeStoredSettings,
    reset,
  }
}

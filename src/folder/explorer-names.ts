import type { ExplorerNode } from './explorer'
import { noteRootForPath } from './note-entry'

/**
 * The naming rules behind Explorer creation and rename: where
 * a new row lands, what a free name is, and which stems the filesystem will
 * take. Everything here is pure; the Tauri commands are the backstop, and the
 * Rust filename-rules module is still the authority at commit time.
 */

export type ExplorerRowKind = ExplorerNode['kind']

export interface LockedName {
  /** The part the inline input edits. */
  stem: string
  /** Dim static text beside the input; never editable. Empty for a folder. */
  extension: string
}

const RESERVED_DEVICE_NAMES = new Set([
  'CON', 'PRN', 'AUX', 'NUL',
  'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9',
  'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9',
])

const REFUSED_CHARACTERS = /[<>:"\\|?*]/u

const ROW_KIND_LABELS: Record<ExplorerRowKind, string> = {
  note: 'A Document',
  image: 'An Image file',
  folder: 'A folder',
}

function findNodeWithParent(
  node: ExplorerNode,
  path: string,
  parent: ExplorerNode | null,
): { node: ExplorerNode; parent: ExplorerNode | null } | null {
  if (node.path === path) return { node, parent }
  for (const child of node.children) {
    const found = findNodeWithParent(child, path, node)
    if (found) return found
  }
  return null
}

function findNode(root: ExplorerNode, path: string): ExplorerNode | null {
  return findNodeWithParent(root, path, null)?.node ?? null
}

/**
 * Where a new Document or folder lands, one rule for ⌘N, the header "+" and
 * the context menu: a folder (or the Folder itself) takes it inside, a Document or
 * Image file row takes it into its parent, and nothing selected means the
 * Folder root.
 */
export function creationParentPath(root: ExplorerNode, selectedPath: string | null): string {
  if (!selectedPath) return root.path
  const found = findNodeWithParent(root, selectedPath, null)
  if (!found) return root.path
  if (found.node.kind === 'folder') return found.node.path
  return found.parent?.path ?? root.path
}

/** The names already in a folder, so a new or renamed row can avoid them. */
export function siblingNames(
  root: ExplorerNode,
  path: string,
  options: { of?: 'siblings' | 'children' } = {},
): string[] {
  const folderPath = options.of === 'children' ? path : noteRootForPath(path)
  const folder = findNode(root, folderPath)
  if (!folder) return []
  return folder.children
    .filter((child) => options.of === 'children' || child.path !== path)
    .map((child) => child.name)
}

/**
 * The first free name in Finder's shape: `Untitled.md`, then `Untitled 2.md`,
 * `Untitled 3.md`. Case-insensitive, because the filesystem under Plumo is.
 */
export function nextAvailableName(taken: Iterable<string>, base: string, extension: string): string {
  const held = new Set(Array.from(taken, (name) => name.toLocaleLowerCase()))
  const candidate = (suffix: number) => (suffix === 1 ? `${base}${extension}` : `${base} ${suffix}${extension}`)
  let suffix = 1
  while (held.has(candidate(suffix).toLocaleLowerCase())) suffix += 1
  return candidate(suffix)
}

/**
 * A Duplicate's name in Finder's shape: `Plan copy.md`, then `Plan copy 2.md`.
 * A name already ending in ` copy` or ` copy N` counts on from there rather
 * than stacking another ` copy`, so duplicating `Plan copy.md` gives
 * `Plan copy 2.md`. The extension stays as it was.
 */
export function duplicateName(taken: Iterable<string>, filename: string): string {
  const { stem, extension } = lockedExtension(filename)
  return nextAvailableName(taken, `${stem.replace(/ copy(?: \d+)?$/u, '')} copy`, extension)
}

/**
 * The editable stem and the locked extension of a file name. A leading dot is
 * part of the stem, so a dotfile is never left with an empty name.
 */
export function lockedExtension(name: string): LockedName {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { stem: name, extension: '' }
  return { stem: name.slice(0, dot), extension: name.slice(dot) }
}

/** `/` can never enter a name, so the input drops it as it is typed. */
export function stripBlockedNameCharacters(value: string): string {
  return value.replaceAll('/', '')
}

function hasControlCharacter(value: string): boolean {
  // eslint-disable-next-line no-control-regex -- the point of the check
  return /[\u0000-\u001f\u007f]/u.test(value)
}

/** Whether a folder already holds a name. The filesystem under Plumo is case-insensitive, so the check is too. */
export function isNameTaken(siblings: readonly string[], name: string): boolean {
  return siblings.some((sibling) => sibling.toLocaleLowerCase() === name.toLocaleLowerCase())
}

/**
 * What is wrong with a name, exactly as it was typed, reported inline under the
 * row on commit — or null when the name will do. An empty stem is not an
 * error: a blank commit cancels the rename instead.
 *
 * The stem arrives untrimmed on purpose. A trailing space is one of the names
 * the Explorer refuses, and the Rust side would quietly trim it away, so it
 * has to be caught here while the user can still see it.
 */
export function nameCommitError(options: {
  kind: ExplorerRowKind
  stem: string
  extension: string
  siblings: readonly string[]
}): string | null {
  const { kind, stem, extension, siblings } = options
  const trimmed = stem.trim()
  if (!trimmed) return null
  if (hasControlCharacter(stem)) return 'A name cannot contain control characters'
  if (REFUSED_CHARACTERS.test(stem)) return 'A name cannot contain < > : " \\ | ? *'
  if (stem.endsWith('.') || stem.endsWith(' ')) return 'A name cannot end with a space or a dot'
  if (trimmed.startsWith('.')) return 'A name cannot start with a dot'
  if (RESERVED_DEVICE_NAMES.has(trimmed.split('.')[0].toUpperCase())) return `${trimmed} is a reserved name`

  const name = `${trimmed}${extension}`
  return isNameTaken(siblings, name) ? `${ROW_KIND_LABELS[kind]} named ${name} already exists` : null
}

/**
 * What the Explorer's context menu holds, per row kind. The
 * table is data so the menu component stays a renderer and the order is
 * checked by a test rather than by eye.
 *
 * Pin, Duplicate, Reveal in Finder and Copy Path here act on the row the menu was
 * opened on. The manifest commands of the same names (File and Edit menus,
 * the Command Menu) act on the active Tab instead. Pin reads Unpin on a row
 * that is already pinned; a folder has neither (CONTEXT.md, Pinned).
 */

export type ExplorerMenuAction =
  | 'pin'
  | 'newDocument'
  | 'newFolder'
  | 'rename'
  | 'duplicate'
  | 'trash'
  | 'reveal'
  | 'copyPath'

/** A row the menu can act on, the Folder itself (its header) and the empty area below the tree. */
export type ExplorerMenuTargetKind = 'note' | 'image' | 'folder' | 'root' | 'empty'

export type ExplorerMenuEntry =
  | { kind: 'item'; action: ExplorerMenuAction }
  | { kind: 'separator' }

export const EXPLORER_MENU_LABELS: Record<ExplorerMenuAction, string> = {
  pin: 'Pin',
  newDocument: 'New Document',
  newFolder: 'New Folder',
  rename: 'Rename…',
  duplicate: 'Duplicate',
  trash: 'Move to Trash',
  reveal: 'Reveal in Finder',
  copyPath: 'Copy Path',
}

/** Pin's label on a row that is pinned already. */
export const EXPLORER_UNPIN_LABEL = 'Unpin'

/** Whether the item removes what it acts on, which draws it in the `destructive` style. */
export function isDestructiveExplorerMenuAction(action: ExplorerMenuAction): boolean {
  return action === 'trash'
}

const SEPARATOR: ExplorerMenuEntry = { kind: 'separator' }

function items(...actions: ExplorerMenuAction[]): ExplorerMenuEntry[] {
  return actions.map((action) => ({ kind: 'item', action }))
}

const CREATION = items('newDocument', 'newFolder')
const HAND_OFFS = items('reveal', 'copyPath')
const RENAME = items('rename')
// A folder cannot be duplicated (CONTEXT.md, Duplicate).
const RENAME_AND_DUPLICATE = items('rename', 'duplicate')
const PIN = items('pin')
// Last and on its own, as every menu puts what removes content.
const TRASH = items('trash')

const MENUS: Record<ExplorerMenuTargetKind, ExplorerMenuEntry[]> = {
  note: [...PIN, SEPARATOR, ...RENAME_AND_DUPLICATE, SEPARATOR, ...HAND_OFFS, SEPARATOR, ...TRASH],
  image: [...PIN, SEPARATOR, ...RENAME_AND_DUPLICATE, SEPARATOR, ...HAND_OFFS, SEPARATOR, ...TRASH],
  folder: [...CREATION, SEPARATOR, ...RENAME, SEPARATOR, ...HAND_OFFS, SEPARATOR, ...TRASH],
  root: [...CREATION, SEPARATOR, ...HAND_OFFS],
  empty: CREATION,
}

export function explorerMenuEntries(target: ExplorerMenuTargetKind): readonly ExplorerMenuEntry[] {
  return MENUS[target]
}

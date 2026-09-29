import {
  APP_COMMAND_APP_MENU_ITEMS,
  APP_COMMAND_IDS,
  APP_COMMAND_MENU_SECTIONS,
  APP_COMMAND_MENU_STATE_GROUPS,
  type AppCommandMenuItem,
} from '@/shell/app-command-catalog'
import type { CommandMenuEntry } from './command-menu-matcher'
import { documentLocation, type ListedFile } from '@/folder/explorer'
import { notePathFilename } from '@/lib/note-path-identity'

/**
 * What the Command Menu can list (CONTEXT.md): every command in the native
 * menu bar and nothing else, plus the Folder's Document and Image file names.
 * Both lists are read off the same sources the menu bar and the Explorer use,
 * the shared command manifest and the Folder listing, so the palette cannot
 * drift from either.
 */

/** The enable state of the manifest's menu groups, as the App knows it. */
export interface CommandMenuState {
  /** A Document is the active Tab: Save, Toggle Rich/Raw and Find. */
  hasDocument: boolean
  /** A Folder is open: New Document, Quick Open and Close Folder. */
  hasFolder: boolean
  /** Any Tab is open, an Image Tab included: Close Tab. */
  hasTab: boolean
  /** The active Tab's file can be pinned or unpinned: a Document or an Image file in the Folder. */
  canPin: boolean
  /** The active Tab is a Document in Rich mode: Duplicate Block. */
  hasRichDocument: boolean
}

const APP_MENU_LABEL = 'Plumo'
/** Running the Command Menu from inside the Command Menu is noise. */
const EXCLUDED_COMMAND_IDS = new Set<string>([APP_COMMAND_IDS.viewCommandPalette])

function groupEnabled(commandId: string, state: CommandMenuState): boolean {
  if (APP_COMMAND_MENU_STATE_GROUPS.noteDependent.includes(commandId)) return state.hasDocument
  if (APP_COMMAND_MENU_STATE_GROUPS.tabDependent.includes(commandId)) return state.hasTab
  if (APP_COMMAND_MENU_STATE_GROUPS.vaultDependent.includes(commandId)) return state.hasFolder
  if (APP_COMMAND_MENU_STATE_GROUPS.pinnableDependent.includes(commandId)) return state.canPin
  if (APP_COMMAND_MENU_STATE_GROUPS.richNoteDependent.includes(commandId)) return state.hasRichDocument
  return true
}

function* commandItems(items: readonly AppCommandMenuItem[], labelPrefix: string): Generator<{ item: Extract<AppCommandMenuItem, { kind: 'command' }>; label: string }> {
  for (const item of items) {
    if (item.kind === 'command') yield { item, label: `${labelPrefix}${item.label}` }
    else if (item.kind === 'submenu') yield* commandItems(item.items, `${labelPrefix}${item.label}: `)
  }
}

function entriesForMenu(menuLabel: string, items: readonly AppCommandMenuItem[], state: CommandMenuState): CommandMenuEntry[] {
  const entries: CommandMenuEntry[] = []
  for (const { item, label } of commandItems(items, '')) {
    if (EXCLUDED_COMMAND_IDS.has(item.commandId)) continue
    entries.push({
      kind: 'command',
      id: item.commandId,
      name: label,
      detail: menuLabel,
      shortcut: item.shortcut,
      enabled: item.enabled !== false && groupEnabled(item.commandId, state),
    })
  }
  return entries
}

/** Every menu-bar command as a palette row, in menu order, File through Window and then the Plumo menu's Quit. */
export function commandMenuCommandEntries(state: CommandMenuState): CommandMenuEntry[] {
  return [
    ...APP_COMMAND_MENU_SECTIONS.flatMap((section) => entriesForMenu(section.label, section.items, state)),
    ...entriesForMenu(APP_MENU_LABEL, APP_COMMAND_APP_MENU_ITEMS, state),
  ]
}

/** The Folder's Documents and Image files as palette rows; folders are not rows, and no Folder means no rows. */
export function commandMenuFileEntries(files: readonly ListedFile[], folder: string | null): CommandMenuEntry[] {
  if (folder === null) return []
  const entries: CommandMenuEntry[] = []
  for (const file of files) {
    if (file.kind === 'folder') continue
    entries.push({
      kind: file.kind === 'note' ? 'document' : 'image',
      id: file.path,
      name: notePathFilename(file.path),
      detail: documentLocation(file.path, folder).parents.join(' › '),
    })
  }
  return entries
}

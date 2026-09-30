import appCommandManifest from './app-command-manifest.json' with { type: 'json' }
import { isMac } from '@/platform/os'

type AppCommandKey = keyof typeof appCommandManifest.commands
type ShortcutEventLike = Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'key' | 'code'>

export type AppCommandShortcutCombo =
  | 'command-or-ctrl'
  | 'command-or-ctrl-shift'
  | 'command-shift'
export type AppCommandDeterministicQaMode =
  | 'renderer-shortcut-event'
  | 'native-menu-command'

export interface AppCommandDeterministicQaDefinition {
  preferredMode: AppCommandDeterministicQaMode
  supportsRendererShortcutEvent: boolean
  supportsNativeMenuCommand: boolean
  requiresManualNativeAcceleratorQa: boolean
}

export interface AppCommandShortcutEventOptions {
  preferControl?: boolean
}

interface AppCommandShortcutAlternateEvent {
  key: string
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

export type AppCommandShortcutEventInit = Pick<
  KeyboardEventInit,
  'altKey' | 'bubbles' | 'cancelable' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'
>

type SimpleHandlerKey =
  | 'onQuit'
  | 'onOpenSettings'
  | 'onCreateNote'
  | 'onOpenVault'
  | 'onOpenNote'
  | 'onCloseVault'
  | 'onQuickOpen'
  | 'onSave'
  | 'onCloseTab'
  | 'onUndo'
  | 'onRedo'
  | 'onPastePlainText'
  | 'onDuplicateBlock'
  | 'onFindInNote'
  | 'onCommandPalette'
  | 'onToggleSidebar'
  | 'onToggleRawEditor'
  | 'onCopyPath'
  | 'onTogglePin'
  | 'onDuplicate'
  | 'onRevealInFinder'
  | 'onOpenInDefaultApp'
  | 'onAppearanceSystem'
  | 'onAppearanceDark'
  | 'onAppearanceLight'
  | 'onPreviousTab'
  | 'onNextTab'
  | 'onJumpToTab1'
  | 'onJumpToTab2'
  | 'onJumpToTab3'
  | 'onJumpToTab4'
  | 'onJumpToTab5'
  | 'onJumpToTab6'
  | 'onJumpToTab7'
  | 'onJumpToTab8'
  | 'onJumpToTab9'

type AppCommandRoute =
  | { kind: 'handler'; handler: SimpleHandlerKey }

interface AppCommandShortcutDefinition {
  combo: AppCommandShortcutCombo
  key: string
  aliases?: string[]
  code?: string
  display: string
  macosAlternateEvents?: AppCommandShortcutAlternateEvent[]
}

interface AppCommandManifestShortcutDefinition extends AppCommandShortcutDefinition {
  accelerator: string
  requiresManualNativeAcceleratorQa?: boolean
}

interface AppCommandManifestDefinition {
  id: string
  route: AppCommandRoute
  menuOwned: boolean
  shortcut?: AppCommandManifestShortcutDefinition
  preferredShortcutQaMode?: AppCommandDeterministicQaMode
}

export interface AppCommandDefinition {
  route: AppCommandRoute
  menuOwned: boolean
  shortcut?: AppCommandShortcutDefinition
  preferredShortcutQaMode?: AppCommandDeterministicQaMode
}

type PlatformLabel = string | {
  macos?: string
  windows?: string
  linux?: string
  default: string
}

type AppCommandMenuManifestItem =
  | { kind: 'separator' }
  | {
      kind: 'command'
      command: AppCommandKey
      id?: string
      label: PlatformLabel
      accelerator?: string | null
      enabled?: boolean
    }
  | {
      kind: 'submenu'
      label: PlatformLabel
      items: AppCommandMenuManifestItem[]
    }

interface AppCommandMenuManifestSection {
  label: string
  items: AppCommandMenuManifestItem[]
}

export type AppCommandMenuItem =
  | { kind: 'separator' }
  | {
      kind: 'command'
      commandId: string
      menuItemId: string
      label: string
      shortcut?: string
      enabled?: boolean
    }
  | {
      kind: 'submenu'
      label: string
      items: AppCommandMenuItem[]
    }

type AppCommandMenuStateGroupReference =
  | { command: AppCommandKey }
  | { id: string }

type AppCommandMenuStateGroupName = keyof typeof appCommandManifest.menuStateGroups

const APP_COMMAND_MANIFEST_COMMANDS = appCommandManifest.commands as Record<AppCommandKey, AppCommandManifestDefinition>
const APP_COMMAND_MANIFEST_MENUS = appCommandManifest.menus as AppCommandMenuManifestSection[]
const APP_COMMAND_MANIFEST_APP_MENU = appCommandManifest.appMenu as AppCommandMenuManifestItem[]
const APP_COMMAND_MANIFEST_STATE_GROUPS = appCommandManifest.menuStateGroups as Record<
  AppCommandMenuStateGroupName,
  AppCommandMenuStateGroupReference[]
>

export const APP_COMMAND_IDS = Object.fromEntries(
  Object.entries(APP_COMMAND_MANIFEST_COMMANDS).map(([key, command]) => [key, command.id]),
) as { readonly [K in AppCommandKey]: string }

export type AppCommandId = (typeof APP_COMMAND_IDS)[AppCommandKey]

const APP_COMMAND_SET = new Set<string>(Object.values(APP_COMMAND_IDS))

function toShortcutDefinition(
  shortcut: AppCommandManifestShortcutDefinition | undefined,
): AppCommandShortcutDefinition | undefined {
  if (!shortcut) return undefined

  return {
    combo: shortcut.combo,
    key: shortcut.key,
    aliases: shortcut.aliases,
    code: shortcut.code,
    display: shortcut.display,
    macosAlternateEvents: shortcut.macosAlternateEvents,
  }
}

export const APP_COMMAND_DEFINITIONS = Object.fromEntries(
  Object.values(APP_COMMAND_MANIFEST_COMMANDS).map((command) => [
    command.id,
    {
      route: command.route,
      menuOwned: command.menuOwned,
      shortcut: toShortcutDefinition(command.shortcut),
      preferredShortcutQaMode: command.preferredShortcutQaMode,
    },
  ]),
) as Record<AppCommandId, AppCommandDefinition>

function resolvePlatformLabel(label: PlatformLabel): string {
  if (typeof label === 'string') return label
  if (isMac() && label.macos) return label.macos
  return label.default
}

function formatAcceleratorDisplay(accelerator: string): string {
  const commandPrefix = isMac() ? '⌘' : 'Ctrl+'
  const commandShiftPrefix = isMac() ? '⌘⇧' : 'Ctrl+Shift+'

  return accelerator
    .replaceAll('CmdOrCtrl+Shift+', commandShiftPrefix)
    .replaceAll('CmdOrCtrl+', commandPrefix)
    .replaceAll('Backspace', isMac() ? '⌫' : 'Backspace')
    .replaceAll('Delete', isMac() ? '⌦' : 'Delete')
    .replaceAll('Left', isMac() ? '←' : 'Left')
    .replaceAll('Right', isMac() ? '→' : 'Right')
    .replaceAll('Enter', isMac() ? '↵' : 'Enter')
}

function menuShortcutForCommand(
  item: Extract<AppCommandMenuManifestItem, { kind: 'command' }>,
  command: AppCommandManifestDefinition,
): string | undefined {
  if (typeof item.accelerator === 'string') return formatAcceleratorDisplay(item.accelerator)
  if (command.shortcut) return formatShortcutDisplay(command.shortcut)
  return undefined
}

function toMenuItem(item: AppCommandMenuManifestItem): AppCommandMenuItem {
  if (item.kind === 'separator') return { kind: 'separator' }

  if (item.kind === 'submenu') {
    return {
      kind: 'submenu',
      label: resolvePlatformLabel(item.label),
      items: item.items.map(child => toMenuItem(child)),
    }
  }

  const command = Reflect.get(APP_COMMAND_MANIFEST_COMMANDS, item.command) as AppCommandManifestDefinition
  const label = resolvePlatformLabel(item.label)
  return {
    kind: 'command',
    commandId: command.id,
    menuItemId: item.id ?? command.id,
    label,
    shortcut: menuShortcutForCommand(item, command),
    enabled: item.enabled,
  }
}

function menuCommandIds(items: AppCommandMenuItem[]): string[] {
  return items.flatMap(item => {
    if (item.kind === 'command') return [item.commandId]
    if (item.kind === 'submenu') return menuCommandIds(item.items)
    return []
  })
}

export function getAppCommandMenuSections() {
  return APP_COMMAND_MANIFEST_MENUS.map(section => ({
    label: section.label,
    items: section.items.map(item => toMenuItem(item)),
  }))
}

export const APP_COMMAND_MENU_SECTIONS = getAppCommandMenuSections()

/** The Plumo menu's manifest items (Quit); About, Services and Hide are the platform's own. */
export const APP_COMMAND_APP_MENU_ITEMS = APP_COMMAND_MANIFEST_APP_MENU.map(item => toMenuItem(item))

export const APP_COMMAND_MENU_STATE_GROUPS = Object.fromEntries(
  Object.entries(APP_COMMAND_MANIFEST_STATE_GROUPS).map(([name, references]) => [
    name,
    references.map(reference => 'command' in reference
      ? (Reflect.get(APP_COMMAND_MANIFEST_COMMANDS, reference.command) as AppCommandManifestDefinition).id
      : reference.id),
  ]),
) as Record<AppCommandMenuStateGroupName, string[]>

const NATIVE_MENU_COMMAND_SET = new Set<string>(
  [
    ...APP_COMMAND_MENU_SECTIONS.flatMap(section => menuCommandIds(section.items)),
    ...menuCommandIds(APP_COMMAND_APP_MENU_ITEMS),
  ].filter(id => APP_COMMAND_SET.has(id)),
)

const MANUAL_NATIVE_ACCELERATOR_QA_COMMAND_SET = new Set<AppCommandId>(
  Object.values(APP_COMMAND_MANIFEST_COMMANDS)
    .filter(command => command.shortcut?.requiresManualNativeAcceleratorQa)
    .map(command => command.id),
)

const shortcutKeyMaps = {
  'command-or-ctrl': new Map<string, AppCommandId>(),
  'command-or-ctrl-shift': new Map<string, AppCommandId>(),
  'command-shift': new Map<string, AppCommandId>(),
} satisfies Record<AppCommandShortcutCombo, Map<string, AppCommandId>>

const shortcutCodeMaps = {
  'command-or-ctrl': new Map<string, AppCommandId>(),
  'command-or-ctrl-shift': new Map<string, AppCommandId>(),
  'command-shift': new Map<string, AppCommandId>(),
} satisfies Record<AppCommandShortcutCombo, Map<string, AppCommandId>>

const macosAlternateShortcutMap = new Map<string, AppCommandId>()

const COMMAND_ONLY_COMBOS: readonly AppCommandShortcutCombo[] = ['command-or-ctrl']
const COMMAND_SHIFT_COMBOS: readonly AppCommandShortcutCombo[] = ['command-shift', 'command-or-ctrl-shift']
const COMMAND_OR_CTRL_SHIFT_COMBOS: readonly AppCommandShortcutCombo[] = ['command-or-ctrl-shift']
const NO_SHORTCUT_COMBOS: readonly AppCommandShortcutCombo[] = []

function normalizeShortcutKey(key: string): string {
  if (key.length === 1) return key.toLowerCase()
  return key
}

function alternateShortcutSignature(event: AppCommandShortcutAlternateEvent): string {
  return [event.altKey, event.ctrlKey, event.metaKey, event.shiftKey, normalizeShortcutKey(event.key)].join(':')
}

function isPlatformRedoAlternate(event: ShortcutEventLike): boolean {
  const signature = `${isMac()}:${event.altKey}:${event.ctrlKey}:${event.metaKey}:${event.shiftKey}:${normalizeShortcutKey(event.key)}`
  return signature === 'false:false:true:false:false:y'
}

function registerShortcutDefinition(id: AppCommandId, shortcut: AppCommandShortcutDefinition): void {
  const shortcutKeyMap = Reflect.get(shortcutKeyMaps, shortcut.combo) as Map<string, AppCommandId>
  shortcutKeyMap.set(normalizeShortcutKey(shortcut.key), id)
  for (const alias of shortcut.aliases ?? []) {
    shortcutKeyMap.set(normalizeShortcutKey(alias), id)
  }
  if (shortcut.code) {
    const shortcutCodeMap = Reflect.get(shortcutCodeMaps, shortcut.combo) as Map<string, AppCommandId>
    shortcutCodeMap.set(shortcut.code, id)
  }
  for (const event of shortcut.macosAlternateEvents ?? []) {
    macosAlternateShortcutMap.set(alternateShortcutSignature(event), id)
  }
}

function registerShortcutDefinitions(): void {
  for (const [id, definition] of Object.entries(APP_COMMAND_DEFINITIONS) as Array<[AppCommandId, AppCommandDefinition]>) {
    if (definition.shortcut) {
      registerShortcutDefinition(id, definition.shortcut)
    }
  }
}

registerShortcutDefinitions()

export function isAppCommandId(value: string): value is AppCommandId {
  return APP_COMMAND_SET.has(value)
}

export function isNativeMenuCommandId(value: string): value is AppCommandId {
  return NATIVE_MENU_COMMAND_SET.has(value)
}

export function getDeterministicShortcutQaDefinition(
  id: AppCommandId,
): AppCommandDeterministicQaDefinition | null {
  const definition = Reflect.get(APP_COMMAND_DEFINITIONS, id) as AppCommandDefinition
  if (!definition.shortcut) return null

  return {
    preferredMode:
      definition.preferredShortcutQaMode
      ?? (definition.menuOwned ? 'native-menu-command' : 'renderer-shortcut-event'),
    supportsRendererShortcutEvent: true,
    supportsNativeMenuCommand: definition.menuOwned,
    requiresManualNativeAcceleratorQa: MANUAL_NATIVE_ACCELERATOR_QA_COMMAND_SET.has(id),
  }
}

export function getShortcutEventInit(
  id: AppCommandId,
  options: AppCommandShortcutEventOptions = {},
): AppCommandShortcutEventInit | null {
  const shortcut = (Reflect.get(APP_COMMAND_DEFINITIONS, id) as AppCommandDefinition).shortcut
  if (!shortcut) return null

  const useControl = options.preferControl ?? false

  return {
    key: shortcut.key,
    code: shortcut.code,
    altKey: false,
    bubbles: true,
    cancelable: true,
    ctrlKey: useControl,
    metaKey: !useControl,
    shiftKey: shortcut.combo !== 'command-or-ctrl',
  }
}

interface ShortcutModifierState {
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
}

function shiftedShortcutCombos(metaKey: boolean, ctrlKey: boolean): readonly AppCommandShortcutCombo[] {
  if (!metaKey) return COMMAND_OR_CTRL_SHIFT_COMBOS
  if (ctrlKey) return COMMAND_OR_CTRL_SHIFT_COMBOS
  return COMMAND_SHIFT_COMBOS
}

export function shortcutCombosForEvent(event: ShortcutModifierState): readonly AppCommandShortcutCombo[] {
  const { altKey, ctrlKey, metaKey, shiftKey } = event
  if (altKey) return NO_SHORTCUT_COMBOS
  if (!metaKey) {
    if (!ctrlKey) return NO_SHORTCUT_COMBOS
  }
  if (isMac()) {
    if (ctrlKey) return NO_SHORTCUT_COMBOS
  }
  if (shiftKey) return shiftedShortcutCombos(metaKey, ctrlKey)
  return COMMAND_ONLY_COMBOS
}

export function findShortcutCommandId(
  combo: AppCommandShortcutCombo,
  key: string,
  code?: string,
): AppCommandId | null {
  const keyMatch = (Reflect.get(shortcutKeyMaps, combo) as Map<string, AppCommandId>).get(normalizeShortcutKey(key))
  if (keyMatch) return keyMatch

  if (code) {
    const codeMatch = (Reflect.get(shortcutCodeMaps, combo) as Map<string, AppCommandId>).get(code)
    if (codeMatch) return codeMatch
  }

  return null
}

export function findShortcutCommandIdForEvent(event: ShortcutEventLike): AppCommandId | null {
  if (isPlatformRedoAlternate(event)) return APP_COMMAND_IDS.editRedo

  if (isMac()) {
    const alternateCommandId = macosAlternateShortcutMap.get(alternateShortcutSignature(event))
    if (alternateCommandId) return alternateCommandId
  }

  for (const combo of shortcutCombosForEvent(event)) {
    const commandId = findShortcutCommandId(combo, event.key, event.code)
    if (commandId) return commandId
  }
  return null
}

export function formatShortcutDisplay(
  shortcut: Pick<AppCommandShortcutDefinition, 'display'>,
): string {
  if (isMac()) return shortcut.display

  return shortcut.display
    .replaceAll('⌘⇧', 'Ctrl+Shift+')
    .replaceAll('⌘', 'Ctrl+')
    .replaceAll('⌫', 'Backspace')
    .replaceAll('⌦', 'Delete')
    .replaceAll('←', 'Left')
    .replaceAll('→', 'Right')
    .replaceAll('↵', 'Enter')
}

export function getAppCommandShortcutDisplay(id: AppCommandId): string | undefined {
  const shortcut = (Reflect.get(APP_COMMAND_DEFINITIONS, id) as AppCommandDefinition).shortcut
  return shortcut ? formatShortcutDisplay(shortcut) : undefined
}

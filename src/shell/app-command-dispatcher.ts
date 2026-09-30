import {
  APP_COMMAND_DEFINITIONS,
  type AppCommandId,
  type AppCommandDefinition,
} from './app-command-catalog'

export const APP_COMMAND_EVENT_NAME = 'plumo:dispatch-command'

export {
  APP_COMMAND_IDS,
  findShortcutCommandId,
  findShortcutCommandIdForEvent,
  isAppCommandId,
  isNativeMenuCommandId,
} from './app-command-catalog'
export type { AppCommandDefinition, AppCommandId, AppCommandShortcutCombo } from './app-command-catalog'

export type AppCommandDispatchSource =
  | 'direct'
  | 'renderer-keyboard'
  | 'native-menu'
  | 'app-event'

type SuppressedShortcutSource = Extract<AppCommandDispatchSource, 'renderer-keyboard'>

export interface AppCommandHandlers {
  /** ⌘Q: write every pending edit, then exit. */
  onQuit?: () => void
  /** Settings (Plumo menu, ⌘,, the Folder switcher): opens the Settings dialog; while it is open, nothing. */
  onOpenSettings?: () => void
  onCreateNote: () => void
  onOpenVault?: () => void
  onOpenNote?: () => void
  onCloseVault?: () => void
  /** ⌘P: disabled with no Folder, like its menu item, by handing no handler. */
  onQuickOpen?: () => void
  onSave: () => void
  onCloseTab?: () => void
  /** Undo and Redo on the active Document's surface; disabled with no Document, like Save, by handing no handler. */
  onUndo?: () => void
  onRedo?: () => void
  onPastePlainText: () => void
  /** ⌘D: copies the selected Blocks, or the caret's; disabled unless a Document is in Rich mode. */
  onDuplicateBlock?: () => void
  onFindInNote?: () => void
  onCommandPalette: () => void
  onToggleSidebar?: () => void
  onToggleRawEditor?: () => void
  /** ⌘⇧,: the active Tab's absolute path onto the clipboard; disabled with no Tab. */
  onCopyPath?: () => void
  /** Pin/Unpin (File menu, the tab bar's "…"): the active Tab's file in the Pinned list. */
  onTogglePin?: () => void
  /** Duplicate (File menu, the tab bar's "…"): a copy of the active Tab's file, beside it; disabled with no Tab. */
  onDuplicate?: () => void
  /** Reveal in Finder (File menu, the tab bar's "…"): the active Tab's file, selected in Finder. */
  onRevealInFinder?: () => void
  /** Open in Default App (File menu, the tab bar's "…"): the active Tab's file, handed to the app macOS opens it with. */
  onOpenInDefaultApp?: () => void
  onAppearanceSystem?: () => void
  onAppearanceDark?: () => void
  onAppearanceLight?: () => void
  onPreviousTab?: () => void
  onNextTab?: () => void
  onJumpToTab1?: () => void
  onJumpToTab2?: () => void
  onJumpToTab3?: () => void
  onJumpToTab4?: () => void
  onJumpToTab5?: () => void
  onJumpToTab6?: () => void
  onJumpToTab7?: () => void
  onJumpToTab8?: () => void
  onJumpToTab9?: () => void
}

type SimpleHandlerKey = keyof Pick<
  AppCommandHandlers,
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
>

type SimpleHandlerExecutor = (handlers: AppCommandHandlers) => void

const SIMPLE_HANDLER_EXECUTORS: readonly [SimpleHandlerKey, SimpleHandlerExecutor][] = [
  ['onQuit', (handlers) => handlers.onQuit?.()],
  ['onOpenSettings', (handlers) => handlers.onOpenSettings?.()],
  ['onCreateNote', (handlers) => handlers.onCreateNote()],
  ['onOpenVault', (handlers) => handlers.onOpenVault?.()],
  ['onOpenNote', (handlers) => handlers.onOpenNote?.()],
  ['onCloseVault', (handlers) => handlers.onCloseVault?.()],
  ['onQuickOpen', (handlers) => handlers.onQuickOpen?.()],
  ['onSave', (handlers) => handlers.onSave()],
  ['onCloseTab', (handlers) => handlers.onCloseTab?.()],
  ['onUndo', (handlers) => handlers.onUndo?.()],
  ['onRedo', (handlers) => handlers.onRedo?.()],
  ['onPastePlainText', (handlers) => handlers.onPastePlainText()],
  ['onDuplicateBlock', (handlers) => handlers.onDuplicateBlock?.()],
  ['onFindInNote', (handlers) => handlers.onFindInNote?.()],
  ['onCommandPalette', (handlers) => handlers.onCommandPalette()],
  ['onToggleSidebar', (handlers) => handlers.onToggleSidebar?.()],
  ['onToggleRawEditor', (handlers) => handlers.onToggleRawEditor?.()],
  ['onCopyPath', (handlers) => handlers.onCopyPath?.()],
  ['onTogglePin', (handlers) => handlers.onTogglePin?.()],
  ['onDuplicate', (handlers) => handlers.onDuplicate?.()],
  ['onRevealInFinder', (handlers) => handlers.onRevealInFinder?.()],
  ['onOpenInDefaultApp', (handlers) => handlers.onOpenInDefaultApp?.()],
  ['onAppearanceSystem', (handlers) => handlers.onAppearanceSystem?.()],
  ['onAppearanceDark', (handlers) => handlers.onAppearanceDark?.()],
  ['onAppearanceLight', (handlers) => handlers.onAppearanceLight?.()],
  ['onPreviousTab', (handlers) => handlers.onPreviousTab?.()],
  ['onNextTab', (handlers) => handlers.onNextTab?.()],
  ['onJumpToTab1', (handlers) => handlers.onJumpToTab1?.()],
  ['onJumpToTab2', (handlers) => handlers.onJumpToTab2?.()],
  ['onJumpToTab3', (handlers) => handlers.onJumpToTab3?.()],
  ['onJumpToTab4', (handlers) => handlers.onJumpToTab4?.()],
  ['onJumpToTab5', (handlers) => handlers.onJumpToTab5?.()],
  ['onJumpToTab6', (handlers) => handlers.onJumpToTab6?.()],
  ['onJumpToTab7', (handlers) => handlers.onJumpToTab7?.()],
  ['onJumpToTab8', (handlers) => handlers.onJumpToTab8?.()],
  ['onJumpToTab9', (handlers) => handlers.onJumpToTab9?.()],
]

function runSimpleHandler(handler: SimpleHandlerKey, handlers: AppCommandHandlers): void {
  const executor = SIMPLE_HANDLER_EXECUTORS.find(([key]) => key === handler)?.[1]
  executor?.(handlers)
}

const SHORTCUT_ECHO_DEDUPE_WINDOW_MS = 150
let lastCommandDispatch:
  | {
      id: AppCommandId
      source: AppCommandDispatchSource
      timestamp: number
    }
  | null = null

let lastSuppressedShortcutCommand:
  | {
      id: AppCommandId
      source: SuppressedShortcutSource
      timestamp: number
    }
  | null = null

function now(): number {
  return globalThis.performance?.now?.() ?? Date.now()
}

function isShortcutEchoPair(a: AppCommandDispatchSource, b: AppCommandDispatchSource): boolean {
  return (
    (a === 'renderer-keyboard' && b === 'native-menu') ||
    (a === 'native-menu' && b === 'renderer-keyboard')
  )
}

function shouldSuppressDuplicateCommand(
  id: AppCommandId,
  source: AppCommandDispatchSource,
  currentTimestamp: number,
): boolean {
  if (!lastCommandDispatch || lastCommandDispatch.id !== id) return false
  if (!isShortcutEchoPair(source, lastCommandDispatch.source)) return false
  return currentTimestamp - lastCommandDispatch.timestamp <= SHORTCUT_ECHO_DEDUPE_WINDOW_MS
}

function shouldSuppressShortcutEchoAfterKeyboardYield(
  id: AppCommandId,
  source: AppCommandDispatchSource,
  currentTimestamp: number,
): boolean {
  if (source !== 'native-menu') return false
  if (!lastSuppressedShortcutCommand || lastSuppressedShortcutCommand.id !== id) return false
  return currentTimestamp - lastSuppressedShortcutCommand.timestamp <= SHORTCUT_ECHO_DEDUPE_WINDOW_MS
}

function dispatchDefinition(
  definition: AppCommandDefinition,
  handlers: AppCommandHandlers,
): boolean {
  switch (definition.route.kind) {
    case 'handler': {
      runSimpleHandler(definition.route.handler as SimpleHandlerKey, handlers)
      return true
    }
  }
}

export function dispatchAppCommand(id: AppCommandId, handlers: AppCommandHandlers): boolean {
  return executeAppCommand(id, handlers, 'direct')
}

export function executeAppCommand(
  id: AppCommandId,
  handlers: AppCommandHandlers,
  source: AppCommandDispatchSource,
): boolean {
  const timestamp = now()
  if (shouldSuppressShortcutEchoAfterKeyboardYield(id, source, timestamp)) {
    return false
  }
  if (shouldSuppressDuplicateCommand(id, source, timestamp)) {
    return false
  }

  const definition = Reflect.get(APP_COMMAND_DEFINITIONS, id) as AppCommandDefinition
  const dispatched = dispatchDefinition(definition, handlers)
  if (dispatched) {
    lastCommandDispatch = { id, source, timestamp }
  }
  return dispatched
}

export function recordSuppressedShortcutCommand(
  id: AppCommandId,
  source: SuppressedShortcutSource = 'renderer-keyboard',
): void {
  lastSuppressedShortcutCommand = { id, source, timestamp: now() }
}

export function resetAppCommandDispatchStateForTests(): void {
  lastCommandDispatch = null
  lastSuppressedShortcutCommand = null
}

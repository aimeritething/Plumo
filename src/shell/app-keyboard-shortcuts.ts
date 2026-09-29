import {
  APP_COMMAND_IDS,
  executeAppCommand,
  findShortcutCommandIdForEvent,
  recordSuppressedShortcutCommand,
  type AppCommandId,
  type AppCommandHandlers,
} from './app-command-dispatcher'

export type KeyboardActions = Pick<
  AppCommandHandlers,
  | 'onQuit'
  | 'onQuickOpen'
  | 'onCommandPalette'
  | 'onCreateNote'
  | 'onOpenVault'
  | 'onOpenNote'
  | 'onCloseVault'
  | 'onSave'
  | 'onCloseTab'
  | 'onUndo'
  | 'onRedo'
  | 'onFindInNote'
  | 'onPastePlainText'
  | 'onDuplicateBlock'
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
> & {
  canUndo?: boolean
  canRedo?: boolean
}

const TEXT_EDITING_KEYS = new Set(['Backspace', 'Delete'])
const TEXT_EDITING_BLOCKED_COMMANDS = new Set<AppCommandId>([
  APP_COMMAND_IDS.editUndo,
  APP_COMMAND_IDS.editRedo,
])

function isTextInputFocused(): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  if (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') return true
  return active.isContentEditable || active.closest('[contenteditable="true"]') !== null
}

function shouldFocusedTextOwnCommand(commandId: AppCommandId, key: string): boolean {
  return TEXT_EDITING_KEYS.has(key) || TEXT_EDITING_BLOCKED_COMMANDS.has(commandId)
}

function handleFocusedTextCommand(event: KeyboardEvent, commandId: AppCommandId): boolean {
  if (!isTextInputFocused()) return false
  if (!shouldFocusedTextOwnCommand(commandId, event.key)) return false
  recordSuppressedShortcutCommand(commandId, 'renderer-keyboard')
  return true
}

function isEditorFindScopeFocused(): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  return active.closest('[data-editor-find-scope="true"]') !== null
}

function selectionBelongsToEditor(editor: Element, selection: Selection): boolean {
  const { anchorNode, focusNode } = selection
  if (!anchorNode || !focusNode) return false
  return editor.contains(anchorNode) && editor.contains(focusNode)
}

function activeRichEditor(): Element | null {
  const active = document.activeElement
  return active instanceof HTMLElement ? active.closest('.bn-editor') : null
}

function activeTextSelection(): Selection | null {
  const selection = window.getSelection()
  return selection && !selection.isCollapsed && selection.rangeCount > 0 ? selection : null
}

function hasActiveRichEditorTextSelection(): boolean {
  const editor = activeRichEditor()
  const selection = activeTextSelection()
  return Boolean(editor && selection && selectionBelongsToEditor(editor, selection))
}

function activateRichEditorCreateLink(): boolean {
  const button = document.querySelector<HTMLButtonElement>('[data-test="createLink"]')
  if (!button) return false
  button.click()
  return true
}

/**
 * ⌘K over a non-empty Rich selection is the editor's link command. With no
 * link button mounted to press, the chord falls through to the Command Menu
 * rather than doing nothing.
 */
function handleRichEditorCreateLinkShortcut(event: KeyboardEvent): boolean {
  if (!hasActiveRichEditorTextSelection()) return false
  if (!activateRichEditorCreateLink()) return false
  event.preventDefault()
  event.stopPropagation()
  return true
}

/** The chords the Command Menu lets through while it is open: its own two, so they switch or close it, and Quit. */
const COMMAND_MENU_PASSTHROUGH = new Set<AppCommandId>([
  APP_COMMAND_IDS.viewCommandPalette,
  APP_COMMAND_IDS.fileQuickOpen,
  APP_COMMAND_IDS.appQuit,
])

function isCommandMenuFocused(): boolean {
  const active = document.activeElement
  return active instanceof HTMLElement && active.closest('[data-command-palette="true"]') !== null
}

/** The palette is modal: ⌘W, ⌘N and the rest must not act on the window behind it. */
function handleCommandMenuModalCommand(event: KeyboardEvent, commandId: AppCommandId): boolean {
  if (!isCommandMenuFocused() || COMMAND_MENU_PASSTHROUGH.has(commandId)) return false
  event.preventDefault()
  return true
}

/**
 * What counts as a modal layer: Plumo's dialogs (Write failure, the lightbox,
 * a diagram opened large) and its menus (a context menu, a dropdown), by the
 * `data-slot` their `ui/` primitives carry, while they are open and not
 * during the exit animation. A popover or a tooltip is not one.
 */
const MODAL_LAYER_SELECTOR = ['dialog-content', 'context-menu-content', 'dropdown-menu-content', 'select-content']
  .map((slot) => `[data-slot="${slot}"][data-state="open"]`)
  .join(',')

/** What a modal layer lets through: Quit, which settles unsaved work itself. */
const MODAL_LAYER_PASSTHROUGH = new Set<AppCommandId>([APP_COMMAND_IDS.appQuit])

/**
 * A dialog or a menu owns the keyboard while it is open, as a native one
 * would: ⌘W must not close the Tab behind a Write failure, ⌘N must not create
 * a Document behind a context menu. The key is claimed and recorded as
 * yielded, so the native menu's echo of it is dropped too.
 */
function handleModalLayerCommand(event: KeyboardEvent, commandId: AppCommandId): boolean {
  // The Command Menu is a dialog too, with a rule of its own just above: its two chords switch or close it.
  if (isCommandMenuFocused() || MODAL_LAYER_PASSTHROUGH.has(commandId)) return false
  if (document.querySelector(MODAL_LAYER_SELECTOR) === null) return false
  event.preventDefault()
  recordSuppressedShortcutCommand(commandId, 'renderer-keyboard')
  return true
}

/** The commands a held key may repeat: walking the Tabs. Every other command runs once per press. */
const REPEATABLE_COMMANDS = new Set<AppCommandId>([
  APP_COMMAND_IDS.windowPreviousTab,
  APP_COMMAND_IDS.windowNextTab,
])

/**
 * A key held a moment too long is still one press: ⌘W held would close every
 * Tab and then the window, ⌘N would create a row of Untitled Documents, ⌘[ and
 * ⌘K would flicker. The repeat is claimed, so it goes nowhere else, and
 * recorded as yielded, so the native menu's echo of it is dropped.
 */
function handleRepeatedCommand(event: KeyboardEvent, commandId: AppCommandId): boolean {
  if (!event.repeat || REPEATABLE_COMMANDS.has(commandId)) return false
  event.preventDefault()
  recordSuppressedShortcutCommand(commandId, 'renderer-keyboard')
  return true
}

export function handleAppKeyboardEvent(actions: KeyboardActions, event: KeyboardEvent) {
  const commandId = findShortcutCommandIdForEvent(event)
  if (commandId === null) return
  // ⌘F is the Document's find (both modes) unless the caret is
  // in some other text field, the Command Menu's input or an Explorer rename,
  // which keeps the chord.
  if (commandId === APP_COMMAND_IDS.editFindInNote && isTextInputFocused() && !isEditorFindScopeFocused()) return
  // ⌘D is Duplicate Block over a Document in Rich mode. Anywhere else it is
  // left alone: in Raw mode it stays CodeMirror's, in a text field the field's.
  if (
    commandId === APP_COMMAND_IDS.editDuplicateBlock
    && (!actions.onDuplicateBlock || (isTextInputFocused() && !activeRichEditor()))
  ) return
  if (
    commandId === APP_COMMAND_IDS.viewCommandPalette
    && handleRichEditorCreateLinkShortcut(event)
  ) return

  if (handleCommandMenuModalCommand(event, commandId)) return
  // A focused text field keeps its own ⌘Z and ⌘⌫, held or not, inside a dialog or not.
  if (handleFocusedTextCommand(event, commandId)) return
  if (handleModalLayerCommand(event, commandId)) return
  if (handleRepeatedCommand(event, commandId)) return

  event.preventDefault()
  executeAppCommand(commandId, actions, 'renderer-keyboard')
}

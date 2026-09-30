import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_COMMAND_IDS, executeAppCommand, resetAppCommandDispatchStateForTests } from './app-command-dispatcher'
import { handleAppKeyboardEvent, type KeyboardActions } from './app-keyboard-shortcuts'

function actions(overrides: Partial<KeyboardActions> = {}): KeyboardActions {
  return {
    onCreateNote: vi.fn(),
    onQuickOpen: vi.fn(),
    onSave: vi.fn(),
    onPastePlainText: vi.fn(),
    onCommandPalette: vi.fn(),
    onFindInNote: vi.fn(),
    ...overrides,
  }
}

function press(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
  return new KeyboardEvent('keydown', { key, metaKey: true, bubbles: true, cancelable: true, ...init })
}

describe('handleAppKeyboardEvent', () => {
  beforeEach(() => {
    resetAppCommandDispatchStateForTests()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('⌘K opens the Command Menu', () => {
    const handlers = actions()
    const event = press('k')
    handleAppKeyboardEvent(handlers, event)
    expect(handlers.onCommandPalette).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('⌘, opens the Settings, and ⌘⇧, stays Copy Path', () => {
    const handlers = actions({ onOpenSettings: vi.fn(), onCopyPath: vi.fn() })

    const settings = press(',', { code: 'Comma' })
    handleAppKeyboardEvent(handlers, settings)
    expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1)
    expect(settings.defaultPrevented).toBe(true)

    handleAppKeyboardEvent(handlers, press('<', { code: 'Comma', shiftKey: true }))
    expect(handlers.onCopyPath).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1)
  })

  it('⌘K with text selected in Rich mode goes to the editor\'s link command, not the Command Menu', () => {
    document.body.innerHTML = `
      <div class="bn-editor" contenteditable="true" tabindex="0"><p>Some text</p></div>
      <button data-test="createLink">Link</button>
    `
    const editor = document.querySelector<HTMLElement>('.bn-editor')!
    const link = document.querySelector<HTMLButtonElement>('[data-test="createLink"]')!
    const onLink = vi.fn()
    link.addEventListener('click', onLink)
    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(editor.firstElementChild!)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)

    const handlers = actions()
    handleAppKeyboardEvent(handlers, press('k'))
    expect(onLink).toHaveBeenCalledTimes(1)
    expect(handlers.onCommandPalette).not.toHaveBeenCalled()
  })

  it('⌘K with a selection but no link button to press falls through to the Command Menu', () => {
    document.body.innerHTML = '<div class="bn-editor" contenteditable="true" tabindex="0"><p>Some text</p></div>'
    const editor = document.querySelector<HTMLElement>('.bn-editor')!
    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(editor.firstElementChild!)
    window.getSelection()!.removeAllRanges()
    window.getSelection()!.addRange(range)

    const handlers = actions()
    handleAppKeyboardEvent(handlers, press('k'))
    expect(handlers.onCommandPalette).toHaveBeenCalledTimes(1)
  })

  it('while the Command Menu has focus, only ⌘K, ⌘P and ⌘Q get through', () => {
    document.body.innerHTML = '<div data-command-palette="true"><input type="text" /></div>'
    document.querySelector('input')!.focus()
    const handlers = actions({ onCloseTab: vi.fn(), onCreateNote: vi.fn(), onQuit: vi.fn() })

    const closeTab = press('w')
    handleAppKeyboardEvent(handlers, closeTab)
    expect(handlers.onCloseTab).not.toHaveBeenCalled()
    expect(closeTab.defaultPrevented).toBe(true)
    handleAppKeyboardEvent(handlers, press('n'))
    expect(handlers.onCreateNote).not.toHaveBeenCalled()

    handleAppKeyboardEvent(handlers, press('k'))
    handleAppKeyboardEvent(handlers, press('p'))
    handleAppKeyboardEvent(handlers, press('q'))
    expect(handlers.onCommandPalette).toHaveBeenCalledTimes(1)
    expect(handlers.onQuickOpen).toHaveBeenCalledTimes(1)
    expect(handlers.onQuit).toHaveBeenCalledTimes(1)
  })

  it('⌘K with a collapsed selection in Rich mode still opens the Command Menu', () => {
    document.body.innerHTML = '<div class="bn-editor" contenteditable="true" tabindex="0"><p>Some text</p></div>'
    const editor = document.querySelector<HTMLElement>('.bn-editor')!
    editor.focus()
    window.getSelection()!.collapse(editor.firstElementChild!.firstChild, 2)

    const handlers = actions()
    handleAppKeyboardEvent(handlers, press('k'))
    expect(handlers.onCommandPalette).toHaveBeenCalledTimes(1)
  })

  it('⌘P is Quick Open', () => {
    const handlers = actions()
    handleAppKeyboardEvent(handlers, press('p'))
    expect(handlers.onQuickOpen).toHaveBeenCalledTimes(1)
  })

  it('⌘⇧, is Copy path, whether the shifted key reads "," or "<", even from inside the editor', () => {
    document.body.innerHTML = '<div class="bn-editor" contenteditable="true" tabindex="0">Text</div>'
    document.querySelector<HTMLElement>('.bn-editor')!.focus()
    const handlers = actions({ onCopyPath: vi.fn() })
    const event = press(',', { shiftKey: true, code: 'Comma' })
    handleAppKeyboardEvent(handlers, event)
    handleAppKeyboardEvent(handlers, press('<', { shiftKey: true, code: 'Comma' }))
    expect(handlers.onCopyPath).toHaveBeenCalledTimes(2)
    expect(event.defaultPrevented).toBe(true)
  })

  it('⌘F opens find with the editor focused, or with nothing focused', () => {
    document.body.innerHTML = '<div data-editor-find-scope="true"><div class="bn-editor" contenteditable="true" tabindex="0">Text</div></div>'
    const handlers = actions()
    handleAppKeyboardEvent(handlers, press('f'))
    expect(handlers.onFindInNote).toHaveBeenCalledTimes(1)

    document.querySelector<HTMLElement>('.bn-editor')!.focus()
    handleAppKeyboardEvent(handlers, press('f'))
    expect(handlers.onFindInNote).toHaveBeenCalledTimes(2)
  })

  it('⌘D duplicates Blocks from the Rich editor', () => {
    document.body.innerHTML = '<div class="bn-editor" contenteditable="true" tabindex="0">Text</div>'
    document.querySelector<HTMLElement>('.bn-editor')!.focus()
    const handlers = actions({ onDuplicateBlock: vi.fn() })
    const event = press('d')
    handleAppKeyboardEvent(handlers, event)
    expect(handlers.onDuplicateBlock).toHaveBeenCalledTimes(1)
    expect(event.defaultPrevented).toBe(true)
  })

  it('⌘D is left to CodeMirror in Raw mode, where Duplicate Block has no handler', () => {
    document.body.innerHTML = '<div class="cm-content" contenteditable="true" tabindex="0">Text</div>'
    document.querySelector<HTMLElement>('.cm-content')!.focus()
    const event = press('d')
    handleAppKeyboardEvent(actions(), event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('⌘D leaves a text field outside the Rich editor alone, such as a rename field', () => {
    document.body.innerHTML = '<input type="text" />'
    document.querySelector('input')!.focus()
    const handlers = actions({ onDuplicateBlock: vi.fn() })
    const event = press('d')
    handleAppKeyboardEvent(handlers, event)
    expect(handlers.onDuplicateBlock).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('⌘F leaves a text field outside the editor alone, such as the palette\'s input', () => {
    document.body.innerHTML = '<div data-command-palette="true"><input type="text" /></div>'
    document.querySelector('input')!.focus()
    const handlers = actions()
    const event = press('f')
    handleAppKeyboardEvent(handlers, event)
    expect(handlers.onFindInNote).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })
  describe('a held key', () => {
    it('runs a command once: the repeats of ⌘W, ⌘N, ⌘[ and ⌘K do nothing', () => {
      const handlers = actions({ onCloseTab: vi.fn(), onToggleSidebar: vi.fn() })

      for (const key of ['w', 'n', '[', 'k']) {
        handleAppKeyboardEvent(handlers, press(key))
        const repeat = press(key, { repeat: true })
        handleAppKeyboardEvent(handlers, repeat)
        handleAppKeyboardEvent(handlers, press(key, { repeat: true }))
        // Still claimed, so the key does not fall through to the browser or to the native menu.
        expect(repeat.defaultPrevented).toBe(true)
      }

      expect(handlers.onCloseTab).toHaveBeenCalledTimes(1)
      expect(handlers.onCreateNote).toHaveBeenCalledTimes(1)
      expect(handlers.onToggleSidebar).toHaveBeenCalledTimes(1)
      expect(handlers.onCommandPalette).toHaveBeenCalledTimes(1)
    })

    it('drops the native menu\'s echo of a repeat as well', () => {
      const handlers = actions({ onCloseTab: vi.fn() })
      handleAppKeyboardEvent(handlers, press('w'))
      handleAppKeyboardEvent(handlers, press('w', { repeat: true }))

      expect(executeAppCommand(APP_COMMAND_IDS.fileCloseTab, handlers, 'native-menu')).toBe(false)
      expect(handlers.onCloseTab).toHaveBeenCalledTimes(1)
    })

    it('keeps walking the Tabs: ⌘⇧] and ⌘⇧[ repeat', () => {
      const handlers = actions({ onNextTab: vi.fn(), onPreviousTab: vi.fn() })

      handleAppKeyboardEvent(handlers, press(']', { shiftKey: true }))
      handleAppKeyboardEvent(handlers, press(']', { shiftKey: true, repeat: true }))
      handleAppKeyboardEvent(handlers, press('[', { shiftKey: true, repeat: true }))

      expect(handlers.onNextTab).toHaveBeenCalledTimes(2)
      expect(handlers.onPreviousTab).toHaveBeenCalledTimes(1)
    })

    it('leaves ⌘=, ⌘- and ⌘0 alone: Zoom is not a command in v0.1, so the keys are not swallowed (AIM-468)', () => {
      for (const key of ['=', '-', '0']) {
        const event = press(key)
        handleAppKeyboardEvent(actions(), event)
        expect(event.defaultPrevented, key).toBe(false)
      }
    })

    it('leaves ⌘Z to a focused text field, repeats included', () => {
      document.body.innerHTML = '<input type="text" />'
      document.querySelector('input')!.focus()
      const repeat = press('z', { repeat: true })

      handleAppKeyboardEvent(actions({ onUndo: vi.fn() }), repeat)

      expect(repeat.defaultPrevented).toBe(false)
    })
  })

  describe('a modal layer', () => {
    const layers = [
      { name: 'a dialog (Write failure, the lightbox)', slot: 'dialog-content' },
      { name: 'a context menu', slot: 'context-menu-content' },
      { name: 'a dropdown menu', slot: 'dropdown-menu-content' },
    ]

    it.each(layers)('$name keeps ⌘W, ⌘N and ⌘K off the window behind it, and lets ⌘Q through', ({ slot }) => {
      document.body.innerHTML = `<div data-slot="${slot}" data-state="open"></div>`
      const handlers = actions({ onCloseTab: vi.fn(), onQuit: vi.fn() })

      for (const key of ['w', 'n', 'k']) {
        const event = press(key)
        handleAppKeyboardEvent(handlers, event)
        expect(event.defaultPrevented).toBe(true)
      }
      handleAppKeyboardEvent(handlers, press('q'))

      expect(handlers.onCloseTab).not.toHaveBeenCalled()
      expect(handlers.onCreateNote).not.toHaveBeenCalled()
      expect(handlers.onCommandPalette).not.toHaveBeenCalled()
      expect(handlers.onQuit).toHaveBeenCalledTimes(1)
    })

    it('leaves the Command Menu, a dialog itself, to its own rule: ⌘K and ⌘P still switch it', () => {
      document.body.innerHTML = '<div data-slot="dialog-content" data-state="open" data-command-palette="true"><input type="text" /></div>'
      document.querySelector('input')!.focus()
      const handlers = actions()

      handleAppKeyboardEvent(handlers, press('k'))
      handleAppKeyboardEvent(handlers, press('p'))

      expect(handlers.onCommandPalette).toHaveBeenCalledTimes(1)
      expect(handlers.onQuickOpen).toHaveBeenCalledTimes(1)
    })

    it('lets ⌘W and ⌘, through to the Settings dialog, which routes them to itself, and nothing else', () => {
      document.body.innerHTML = '<div data-slot="dialog-content" data-state="open" data-settings-dialog="true"></div>'
      const handlers = actions({ onCloseTab: vi.fn(), onOpenSettings: vi.fn() })

      handleAppKeyboardEvent(handlers, press('w'))
      handleAppKeyboardEvent(handlers, press(',', { code: 'Comma' }))
      const newDocument = press('n')
      handleAppKeyboardEvent(handlers, newDocument)

      expect(handlers.onCloseTab).toHaveBeenCalledTimes(1)
      expect(handlers.onOpenSettings).toHaveBeenCalledTimes(1)
      expect(handlers.onCreateNote).not.toHaveBeenCalled()
      expect(newDocument.defaultPrevented).toBe(true)
    })

    it('keeps ⌘W off the Tabs when a menu is open over the Settings dialog', () => {
      document.body.innerHTML = '<div data-slot="dialog-content" data-state="open" data-settings-dialog="true"></div><div data-slot="dropdown-menu-content" data-state="open"></div>'
      const handlers = actions({ onCloseTab: vi.fn() })

      handleAppKeyboardEvent(handlers, press('w'))

      expect(handlers.onCloseTab).not.toHaveBeenCalled()
    })

    it('stops counting once it is closing', () => {
      document.body.innerHTML = '<div data-slot="dialog-content" data-state="closed"></div>'
      const handlers = actions({ onCloseTab: vi.fn() })

      handleAppKeyboardEvent(handlers, press('w'))

      expect(handlers.onCloseTab).toHaveBeenCalledTimes(1)
    })

    it('leaves ⌘Z to a text field inside it', () => {
      document.body.innerHTML = '<div data-slot="dialog-content" data-state="open"><input type="text" /></div>'
      document.querySelector('input')!.focus()
      const event = press('z')

      handleAppKeyboardEvent(actions({ onUndo: vi.fn() }), event)

      expect(event.defaultPrevented).toBe(false)
    })
  })
})

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { APP_COMMAND_EVENT_NAME, resetAppCommandDispatchStateForTests } from './app-command-dispatcher'
import { dispatchMenuEvent, useMenuEvents, type MenuEventHandlers } from './use-menu-events'

const runtime = vi.hoisted(() => ({
  inTauri: false,
  invoke: vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>(() => Promise.resolve(null)),
  listeners: new Map<string, (event: { payload: string }) => void>(),
}))

vi.mock('@/platform/tauri', () => ({
  isTauri: () => runtime.inTauri,
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => runtime.invoke(cmd, args),
}))

vi.mock('@tauri-apps/api/event', () => ({
  listen: async (name: string, handler: (event: { payload: string }) => void) => {
    runtime.listeners.set(name, handler)
    return () => { runtime.listeners.delete(name) }
  },
}))

function makeHandlers(overrides: Partial<MenuEventHandlers> = {}): MenuEventHandlers {
  return {
    activeDocumentPath: null,
    hasFolder: false,
    hasTab: false,
    onCreateNote: vi.fn(),
    onOpenNote: vi.fn(),
    onQuickOpen: vi.fn(),
    onSave: vi.fn(),
    onPastePlainText: vi.fn(),
    onCommandPalette: vi.fn(),
    ...overrides,
  }
}

async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useMenuEvents', () => {
  beforeEach(() => {
    runtime.inTauri = false
    runtime.invoke.mockClear()
    runtime.listeners.clear()
    resetAppCommandDispatchStateForTests()
  })

  afterEach(() => {
    delete window.__plumoTest
  })

  it('runs the active Tab file commands from their File menu items, and nothing without a handler', () => {
    const handlers = makeHandlers({ hasTab: true, onTogglePin: vi.fn(), onRevealInFinder: vi.fn(), onOpenInDefaultApp: vi.fn() })

    dispatchMenuEvent('file-toggle-pin', handlers)
    dispatchMenuEvent('file-reveal-in-finder', handlers)
    dispatchMenuEvent('file-open-in-default-app', handlers)

    expect(handlers.onTogglePin).toHaveBeenCalledTimes(1)
    expect(handlers.onRevealInFinder).toHaveBeenCalledTimes(1)
    expect(handlers.onOpenInDefaultApp).toHaveBeenCalledTimes(1)
    expect(() => dispatchMenuEvent('file-toggle-pin', makeHandlers())).not.toThrow()
  })

  it('dispatches a native menu event id to its command handler', () => {
    const handlers = makeHandlers()

    dispatchMenuEvent('file-open-note', handlers)
    dispatchMenuEvent('file-save', handlers)
    dispatchMenuEvent('not-a-command', handlers)

    expect(handlers.onOpenNote).toHaveBeenCalledTimes(1)
    expect(handlers.onSave).toHaveBeenCalledTimes(1)
  })

  it('runs commands posted on the window as app events', () => {
    const handlers = makeHandlers()
    renderHook(() => useMenuEvents(handlers))

    act(() => {
      window.dispatchEvent(new CustomEvent(APP_COMMAND_EVENT_NAME, { detail: 'file-save' }))
    })

    expect(handlers.onSave).toHaveBeenCalledTimes(1)
  })

  it('exposes the browser menu bridge for the smoke specs', () => {
    const handlers = makeHandlers()
    renderHook(() => useMenuEvents(handlers))

    act(() => {
      window.__plumoTest?.dispatchBrowserMenuCommand?.('file-open-note')
    })

    expect(handlers.onOpenNote).toHaveBeenCalledTimes(1)
  })

  it('outside Tauri it never talks to the native menu', () => {
    renderHook(() => useMenuEvents(makeHandlers({ activeDocumentPath: '/n/a.md' })))

    expect(runtime.invoke).not.toHaveBeenCalled()
  })

  describe('in Tauri', () => {
    beforeEach(() => {
      runtime.inTauri = true
    })

    it('listens for menu-event and dispatches its payload', async () => {
      const handlers = makeHandlers()
      renderHook(() => useMenuEvents(handlers))
      await flushMicrotasks()

      act(() => {
        runtime.listeners.get('menu-event')?.({ payload: 'file-save' })
      })

      expect(handlers.onSave).toHaveBeenCalledTimes(1)
    })

    it('the app menu\'s Quit item reaches onQuit, so the renderer flushes before the app exits', async () => {
      const handlers = makeHandlers({ onQuit: vi.fn() })
      renderHook(() => useMenuEvents(handlers))
      await flushMicrotasks()

      act(() => {
        runtime.listeners.get('menu-event')?.({ payload: 'app-quit' })
      })

      expect(handlers.onQuit).toHaveBeenCalledTimes(1)
    })

    it('keeps the Document-dependent menu items in step with the active Document', async () => {
      const { rerender } = renderHook(
        ({ activeDocumentPath }: { activeDocumentPath: string | null }) => useMenuEvents(makeHandlers({ activeDocumentPath })),
        { initialProps: { activeDocumentPath: null } },
      )
      await flushMicrotasks()

      expect(runtime.invoke).toHaveBeenCalledWith('update_menu_state', { state: { hasActiveNote: false, hasVault: false, hasTab: false, canPin: false } })

      rerender({ activeDocumentPath: '/n/a.md' })
      await flushMicrotasks()

      expect(runtime.invoke).toHaveBeenLastCalledWith('update_menu_state', { state: { hasActiveNote: true, hasVault: false, hasTab: false, canPin: false } })
      expect(runtime.invoke).toHaveBeenCalledTimes(2)

      // Save, Toggle Rich/Raw and Find in Document go back to disabled over an
      // Image Tab, which the App reports by having no active Document.
      rerender({ activeDocumentPath: null })
      await flushMicrotasks()

      expect(runtime.invoke).toHaveBeenLastCalledWith('update_menu_state', { state: { hasActiveNote: false, hasVault: false, hasTab: false, canPin: false } })
    })

    // New Document, Quick Open and Close Folder follow the open Folder;
    // with none open, ⌘N's menu item is greyed.
    it('keeps the Folder-dependent menu items in step with the open Folder', async () => {
      const { rerender } = renderHook(
        ({ hasFolder }: { hasFolder: boolean }) => useMenuEvents(makeHandlers({ hasFolder })),
        { initialProps: { hasFolder: false } },
      )
      await flushMicrotasks()

      expect(runtime.invoke).toHaveBeenLastCalledWith('update_menu_state', { state: { hasActiveNote: false, hasVault: false, hasTab: false, canPin: false } })

      rerender({ hasFolder: true })
      await flushMicrotasks()

      expect(runtime.invoke).toHaveBeenLastCalledWith('update_menu_state', { state: { hasActiveNote: false, hasVault: true, hasTab: false, canPin: false } })
      expect(runtime.invoke).toHaveBeenCalledTimes(2)
    })

    // Close Tab follows any open Tab, an Image Tab included;
    // with zero Tabs its item is greyed while ⌘W still closes the window.
    it('keeps the Tab-dependent menu item in step with the open Tabs', async () => {
      const { rerender } = renderHook(
        ({ hasTab }: { hasTab: boolean }) => useMenuEvents(makeHandlers({ hasTab })),
        { initialProps: { hasTab: false } },
      )
      await flushMicrotasks()

      rerender({ hasTab: true })
      await flushMicrotasks()

      expect(runtime.invoke).toHaveBeenLastCalledWith('update_menu_state', { state: { hasActiveNote: false, hasVault: false, hasTab: true, canPin: false } })
      expect(runtime.invoke).toHaveBeenCalledTimes(2)
    })

    // Pin/Unpin follows whether the active Tab's file is in the Folder, not
    // merely whether a Tab is open.
    it('keeps Pin/Unpin in step with whether the active Tab can be pinned', async () => {
      const { rerender } = renderHook(
        ({ canPin }: { canPin: boolean }) => useMenuEvents(makeHandlers({ hasTab: true, canPin })),
        { initialProps: { canPin: false } },
      )
      await flushMicrotasks()

      rerender({ canPin: true })
      await flushMicrotasks()

      expect(runtime.invoke).toHaveBeenLastCalledWith('update_menu_state', { state: { hasActiveNote: false, hasVault: false, hasTab: true, canPin: true } })
    })
  })
})

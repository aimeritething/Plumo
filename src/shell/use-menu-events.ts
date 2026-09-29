import { useEffect, useMemo, useRef } from 'react'
import { isTauri } from '@/platform/tauri'
import {
  APP_COMMAND_EVENT_NAME,
  executeAppCommand,
  isAppCommandId,
  type AppCommandHandlers,
} from './app-command-dispatcher'
import { cleanupTauriEventListener, type TauriUnlisten } from '@/platform/tauri-event-cleanup'

export interface MenuEventHandlers extends AppCommandHandlers {
  /** The active Tab's path when it is a Document; null with no Tab, or with an Image Tab. */
  activeDocumentPath: string | null
  /** Whether a Folder is open; New Document, Quick Open and Close Folder follow it. */
  hasFolder: boolean
  /** Whether any Tab is open, an Image Tab included; Close Tab's menu item follows it. */
  hasTab: boolean
  /** Whether the active Tab's file can be pinned: a Document or an Image file in the Folder. Pin/Unpin follows it. */
  canPin?: boolean
  /** Whether the active Tab is a Document in Rich mode, where there are Blocks. Duplicate Block follows it. */
  hasRichDocument?: boolean
}

declare global {
  /** The `window.__plumoTest` hooks the unit and smoke specs drive the app through. */
  interface TestBridge {
    dispatchBrowserMenuCommand?: (id: string) => void
  }

  interface Window {
    __plumoTest?: TestBridge
  }
}

interface MenuStatePayload {
  hasActiveNote: boolean
  hasVault: boolean
  hasTab: boolean
  canPin: boolean
  hasRichNote: boolean
}

function readCustomEventDetail(event: Event): string | null {
  if (!(event instanceof CustomEvent) || typeof event.detail !== 'string') {
    return null
  }
  return event.detail
}

function createWindowCommandListener(
  dispatch: (id: string) => void,
): (event: Event) => void {
  return (event: Event) => {
    const detail = readCustomEventDetail(event)
    if (detail) {
      dispatch(detail)
    }
  }
}

function syncNativeMenuState(state: MenuStatePayload): void {
  if (!isTauri()) return

  import('@tauri-apps/api/core')
    .then(({ invoke }) => invoke('update_menu_state', { state }))
    .catch((err) => console.warn('[menu] Failed to sync native menu state:', err))
}

function useNativeMenuEventListener(handlersRef: { current: MenuEventHandlers }) {
  useEffect(() => {
    if (!isTauri()) return

    let disposed = false
    let unlisten: TauriUnlisten | null = null

    import('@tauri-apps/api/event')
      .then(async ({ listen }) => {
        const teardown = await listen<string>('menu-event', (event) => {
          dispatchMenuEvent(event.payload, handlersRef.current)
        })

        if (disposed) {
          cleanupTauriEventListener(teardown)
          return
        }

        unlisten = teardown
      })
      .catch(() => {
        /* not in Tauri */
      })

    return () => {
      disposed = true
      cleanupTauriEventListener(unlisten)
    }
  }, [handlersRef])
}

function useWindowAppCommandListener(handlersRef: { current: MenuEventHandlers }) {
  useEffect(() => {
    const handleCommandEvent = createWindowCommandListener((detail) => {
      if (isAppCommandId(detail)) {
        executeAppCommand(detail, handlersRef.current, 'app-event')
      }
    })

    window.addEventListener(APP_COMMAND_EVENT_NAME, handleCommandEvent)
    return () => window.removeEventListener(APP_COMMAND_EVENT_NAME, handleCommandEvent)
  }, [handlersRef])
}

function useTestMenuCommandBridge(handlersRef: { current: MenuEventHandlers }) {
  useEffect(() => {
    const bridge = (id: string) => {
      dispatchMenuEvent(id, handlersRef.current)
    }

    window.__plumoTest = {
      ...window.__plumoTest,
      dispatchBrowserMenuCommand: bridge,
    }

    return () => {
      if (window.__plumoTest?.dispatchBrowserMenuCommand === bridge) {
        delete window.__plumoTest.dispatchBrowserMenuCommand
      }
    }
  }, [handlersRef])
}

function useNativeMenuStateSync(state: MenuStatePayload) {
  useEffect(() => {
    syncNativeMenuState(state)
  }, [state])
}

/** Dispatch a Tauri menu event ID to the matching handler. Exported for testing. */
export function dispatchMenuEvent(id: string, h: MenuEventHandlers): void {
  if (!isAppCommandId(id)) return
  executeAppCommand(id, h, 'native-menu')
}

/** Listen for native macOS menu events and dispatch them to the appropriate handlers. */
export function useMenuEvents(handlers: MenuEventHandlers) {
  const ref = useRef(handlers)
  const hasActiveNote = handlers.activeDocumentPath !== null
  const hasVault = handlers.hasFolder
  const hasTab = handlers.hasTab
  const canPin = handlers.canPin ?? false
  const hasRichNote = handlers.hasRichDocument ?? false
  const menuState = useMemo(
    () => ({ hasActiveNote, hasVault, hasTab, canPin, hasRichNote }),
    [canPin, hasActiveNote, hasRichNote, hasTab, hasVault],
  )

  useEffect(() => {
    ref.current = handlers
  }, [handlers])

  useNativeMenuEventListener(ref)
  useWindowAppCommandListener(ref)
  useTestMenuCommandBridge(ref)
  useNativeMenuStateSync(menuState)
}

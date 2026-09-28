import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Event as TauriEvent, UnlistenFn } from '@tauri-apps/api/event'
import type { DragDropEvent as TauriDragDropPayload } from '@tauri-apps/api/window'
import { isWindows } from './os'
import { isTauri } from './tauri'
import { cleanupTauriEventListeners } from './tauri-event-cleanup'

export type TauriDragDropEvent = TauriEvent<TauriDragDropPayload>
type TauriDragDropHandler = (event: TauriDragDropEvent) => void
/** A point in the page, in the CSS pixels of a mouse event's `clientX` and `clientY`. */
export type ClientPoint = { x: number; y: number }

/**
 * Where in the page a native drag is. Tauri types the position as physical,
 * but on macOS wry reads `NSDraggingInfo.draggingLocation`, which is in points
 * from the webview's top-left: already CSS pixels, so dividing by a Retina
 * screen's devicePixelRatio would halve it. Only Windows reports true pixels.
 */
export function dragDropClientPoint(position: { x: number; y: number }): ClientPoint {
  const scale = isWindows() ? window.devicePixelRatio || 1 : 1
  return { x: position.x / scale, y: position.y / scale }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function hasDropPosition(value: unknown): boolean {
  if (!isRecord(value)) return false
  return typeof Reflect.get(value, 'x') === 'number'
    && typeof Reflect.get(value, 'y') === 'number'
}

function isNativeDropPayload(payload: unknown): payload is TauriDragDropPayload {
  if (!isRecord(payload)) return false
  const type = Reflect.get(payload, 'type')
  if (typeof type !== 'string') return false
  // Consumers read the position of all three, and the paths of the two that name them.
  if (type === 'over') return hasDropPosition(Reflect.get(payload, 'position'))
  if (type !== 'enter' && type !== 'drop') return true
  return isStringArray(Reflect.get(payload, 'paths'))
    && hasDropPosition(Reflect.get(payload, 'position'))
}

async function registerNativeDropListener(handler: TauriDragDropHandler): Promise<UnlistenFn> {
  const { getCurrentWindow } = await import('@tauri-apps/api/window')
  return getCurrentWindow().onDragDropEvent((event) => {
    if (isNativeDropPayload(event.payload)) handler(event as TauriDragDropEvent)
  })
}

export function useTauriDragDropEvent(handler: TauriDragDropHandler) {
  const handlerRef = useRef(handler)

  useLayoutEffect(() => {
    handlerRef.current = handler
  }, [handler])

  useEffect(() => {
    if (!isTauri()) return

    let mounted = true
    let unlisteners: UnlistenFn[] = []

    void registerNativeDropListener((event) => handlerRef.current(event))
      .then((unlisten) => {
        if (mounted) unlisteners = [unlisten]
        else cleanupTauriEventListeners([unlisten])
      })
      .catch(() => {})

    return () => {
      mounted = false
      cleanupTauriEventListeners(unlisteners)
      unlisteners = []
    }
  }, [])
}

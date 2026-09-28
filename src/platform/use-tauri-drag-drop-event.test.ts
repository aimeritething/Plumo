import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { dragDropClientPoint, useTauriDragDropEvent } from './use-tauri-drag-drop-event'

let tauriMode = true

type NativeDragDropPayload = {
  type: string
  paths: string[]
  position: { x: number; y: number }
}
type CapturedDragDropHandler = (event: { payload: unknown }) => void

let capturedDragDropHandler: CapturedDragDropHandler | undefined
const unlisten = vi.fn()
const onDragDropEvent = vi.fn((handler: CapturedDragDropHandler) => {
  capturedDragDropHandler = handler
  return Promise.resolve(unlisten)
})

let windowsMode = false

vi.mock('./tauri', () => ({
  isTauri: () => tauriMode,
}))

vi.mock('./os', () => ({
  isWindows: () => windowsMode,
}))

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onDragDropEvent,
  }),
}))

function emitNativeDragDropPayload(payload: unknown): void {
  if (!capturedDragDropHandler) throw new Error('No native drag-drop handler registered')
  capturedDragDropHandler({ payload })
}

async function waitForNativeDragDropListener(): Promise<void> {
  await waitFor(() => {
    expect(capturedDragDropHandler).toBeDefined()
  })
}

describe('useTauriDragDropEvent', () => {
  beforeEach(() => {
    tauriMode = true
    capturedDragDropHandler = undefined
    onDragDropEvent.mockClear()
    unlisten.mockClear()
  })

  afterEach(() => {
    tauriMode = false
    capturedDragDropHandler = undefined
  })

  it('does not forward null native drag-drop payloads to consumers', async () => {
    const handler = vi.fn()
    renderHook(() => useTauriDragDropEvent(handler))

    await waitForNativeDragDropListener()

    expect(() => {
      emitNativeDragDropPayload(null)
    }).not.toThrow()
    expect(handler).not.toHaveBeenCalled()
  })

  it('forwards valid native drag-drop payloads to consumers', async () => {
    const handler = vi.fn()
    renderHook(() => useTauriDragDropEvent(handler))

    await waitForNativeDragDropListener()

    const payload = {
      type: 'drop',
      paths: ['/tmp/photo.png'],
      position: { x: 10, y: 20 },
    } satisfies NativeDragDropPayload
    emitNativeDragDropPayload(payload)

    expect(handler).toHaveBeenCalledWith({ payload })
  })

  it('does not forward an enter or over that says nowhere where the pointer is', async () => {
    const handler = vi.fn()
    renderHook(() => useTauriDragDropEvent(handler))

    await waitForNativeDragDropListener()

    emitNativeDragDropPayload({ type: 'enter', paths: ['/tmp/photo.png'] })
    emitNativeDragDropPayload({ type: 'over' })
    emitNativeDragDropPayload({ type: 'leave' })

    expect(handler).toHaveBeenCalledOnce()
    expect(handler).toHaveBeenCalledWith({ payload: { type: 'leave' } })
  })
})

describe('dragDropClientPoint', () => {
  const devicePixelRatio = window.devicePixelRatio

  afterEach(() => {
    windowsMode = false
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: devicePixelRatio })
  })

  it('reads a macOS position as CSS pixels already, on a Retina screen too', () => {
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })

    expect(dragDropClientPoint({ x: 240, y: 320 })).toEqual({ x: 240, y: 320 })
  })

  it('scales a Windows position, which is in physical pixels, down to CSS pixels', () => {
    windowsMode = true
    Object.defineProperty(window, 'devicePixelRatio', { configurable: true, value: 2 })

    expect(dragDropClientPoint({ x: 480, y: 640 })).toEqual({ x: 240, y: 320 })
  })
})

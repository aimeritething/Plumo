import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { uploadImageFile, useImageDrop } from './use-image-drop'
import { createRef } from 'react'

let tauriMode = false

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: vi.fn((path: string) => `asset://localhost/${path}`),
}))

vi.mock('@/platform/tauri', () => ({
  isTauri: () => tauriMode,
}))

type NativeDropPayload = { type: string; paths: string[]; position: { x: number; y: number } }
type DragDropEvent = { payload: unknown }
type DragDropCallback = (event: DragDropEvent) => void
let capturedDragDropHandler: DragDropCallback | undefined
let nativeDropUnlisten = () => {
  capturedDragDropHandler = undefined
}

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    onDragDropEvent: vi.fn((cb: DragDropCallback) => {
      capturedDragDropHandler = cb
      return Promise.resolve(nativeDropUnlisten)
    }),
  }),
}))

// JSDOM lacks DragEvent and File.arrayBuffer — polyfill for tests
beforeAll(() => {
  if (typeof globalThis.DragEvent === 'undefined') {
    class TestDragEvent extends MouseEvent {
      dataTransfer: DataTransfer | null
      constructor(type: string, init?: DragEventInit) {
        super(type, init)
        this.dataTransfer = init?.dataTransfer ?? null
      }
    }
    Object.defineProperty(globalThis, 'DragEvent', { value: TestDragEvent })
  }

  // File.prototype.arrayBuffer may be missing in older JSDOM
  if (!File.prototype.arrayBuffer) {
    File.prototype.arrayBuffer = function () {
      return new Promise((resolve) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result as ArrayBuffer)
        reader.readAsArrayBuffer(this)
      })
    }
  }
})

// Mock DataTransfer (JSDOM doesn't implement it)
function createMockDataTransfer(files: File[]) {
  const items = files.map(f => ({ kind: 'file' as const, type: f.type, getAsFile: () => f }))
  return {
    items: { ...items, length: items.length },
    files: Object.assign(files, { item: (i: number) => files[i] }),
    dropEffect: 'none',
  } as unknown as DataTransfer
}

function createDragEvent(
  type: string,
  files: File[],
  opts?: { clientX?: number; clientY?: number; relatedTarget?: EventTarget | null },
) {
  const dt = createMockDataTransfer(files)
  return new DragEvent(type, {
    dataTransfer: dt,
    bubbles: true,
    cancelable: true,
    clientX: opts?.clientX ?? 240,
    clientY: opts?.clientY ?? 320,
    relatedTarget: opts?.relatedTarget ?? null,
  })
}

describe('uploadImageFile', () => {
  it('returns a data URL in browser mode', async () => {
    const blob = new Blob(['fake-image-data'], { type: 'image/png' })
    const file = new File([blob], 'test.png', { type: 'image/png' })

    const url = await uploadImageFile(file)
    expect(url).toMatch(/^data:image\/png;base64,/)
  })

  it('passes file to Tauri save_image in Tauri mode', async () => {
    tauriMode = true

    const { invoke, convertFileSrc } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockResolvedValue('/vault/attachments/123-test.png')
    vi.mocked(convertFileSrc).mockReturnValue('asset://localhost/vault/attachments/123-test.png')

    const blob = new Blob([new Uint8Array([0x89, 0x50])], { type: 'image/png' })
    const file = new File([blob], 'test.png', { type: 'image/png' })

    const url = await uploadImageFile(file, '/vault')
    expect(invoke).toHaveBeenCalledWith('save_image', {
      vaultPath: '/vault',
      filename: 'test.png',
      data: expect.any(String),
    })
    expect(url).toBe('asset://localhost/vault/attachments/123-test.png')

    tauriMode = false
  })

  it('resolves native asset bridge failures to an empty upload state', async () => {
    tauriMode = true

    const nativeBridgeError = new Error('null pointer passed to rust')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { invoke, convertFileSrc } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockClear()
    vi.mocked(invoke).mockResolvedValue('/vault/attachments/123-test.png')
    vi.mocked(convertFileSrc).mockImplementation(() => {
      throw nativeBridgeError
    })

    try {
      const file = new File(['data'], 'test.png', { type: 'image/png' })

      await expect(uploadImageFile(file, '/vault')).resolves.toEqual({
        props: { name: 'test.png', url: '' },
      })
      expect(warn).toHaveBeenCalledWith(
        '[image-upload] Failed to prepare uploaded image asset URL:',
        nativeBridgeError,
      )
    } finally {
      vi.mocked(convertFileSrc).mockImplementation((path: string) => `asset://localhost/${path}`)
      warn.mockRestore()
      tauriMode = false
    }
  })

  it('rejects HEIC uploads before writing unsupported attachments', async () => {
    tauriMode = true

    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockClear()
    const file = new File(['heic-data'], 'iphone.HEIC', { type: 'image/heic' })

    await expect(uploadImageFile(file, '/vault')).rejects.toMatchObject({
      name: 'UnsupportedImageFormatError',
      fileName: 'iphone.HEIC',
      format: 'HEIC',
    })
    expect(invoke).not.toHaveBeenCalled()

    tauriMode = false
  })

  it('resolves unreadable local files to an empty upload state', async () => {
    tauriMode = true
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockClear()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const readError = new DOMException(
      'The requested file could not be read, typically due to permission problems.',
      'NotReadableError',
    )
    const arrayBuffer = vi.spyOn(File.prototype, 'arrayBuffer').mockRejectedValue(readError)

    try {
      const file = new File(['data'], 'protected.png', { type: 'image/png' })

      await expect(uploadImageFile(file, '/vault')).resolves.toEqual({
        props: { name: 'protected.png', url: '' },
      })
      expect(invoke).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalledWith(
        '[image-upload] Skipped unreadable file upload:',
        readError,
      )
    } finally {
      arrayBuffer.mockRestore()
      warn.mockRestore()
      tauriMode = false
    }
  })
})

type DropPoint = { x: number; y: number }
type DropOptions = {
  dropTargetAt?: (point: DropPoint) => unknown
  onImageImportError?: (error: { fileName: string; kind: string }) => void
  onImagesDropped?: (urls: string[], target: unknown) => void
  vaultPath?: string
}

/** The editor sits at x 0–800, y 100–700; everything above and beside it is the tab bar and the sidebar. */
function placeEditor(container: HTMLElement) {
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue({
    top: 100, bottom: 700, left: 0, right: 800, height: 600, width: 800, x: 0, y: 100, toJSON: () => ({}),
  })
}

function renderImageDropOver(container: HTMLDivElement, opts: DropOptions = {}) {
  const ref = createRef<HTMLDivElement>()
  Object.defineProperty(ref, 'current', { value: container, writable: true })
  return renderHook(() => useImageDrop<unknown>({
    containerRef: ref,
    dropTargetAt: (point) => ({ at: point }),
    ...opts,
  }))
}

describe('useImageDrop', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    placeEditor(container)
  })

  afterEach(() => {
    container.remove()
  })

  function renderImageDrop(opts?: DropOptions) {
    return renderImageDropOver(container, opts)
  }

  it('sets isDragOver to true on dragover with image files', () => {
    const { result } = renderImageDrop()
    const file = new File(['data'], 'photo.png', { type: 'image/png' })

    act(() => { container.dispatchEvent(createDragEvent('dragover', [file])) })
    expect(result.current.isDragOver).toBe(true)
  })

  it('ignores dragover with non-image files', () => {
    const { result } = renderImageDrop()
    const file = new File(['data'], 'doc.pdf', { type: 'application/pdf' })

    act(() => { container.dispatchEvent(createDragEvent('dragover', [file])) })
    expect(result.current.isDragOver).toBe(false)
  })

  it('resets isDragOver on dragleave when leaving container', () => {
    const { result } = renderImageDrop()
    const file = new File(['data'], 'photo.png', { type: 'image/png' })

    act(() => { container.dispatchEvent(createDragEvent('dragover', [file])) })
    expect(result.current.isDragOver).toBe(true)

    act(() => { container.dispatchEvent(createDragEvent('dragleave', [], { relatedTarget: document.body })) })
    expect(result.current.isDragOver).toBe(false)
  })

  it('resets isDragOver on drop', () => {
    const { result } = renderImageDrop()
    const file = new File(['data'], 'photo.png', { type: 'image/png' })

    act(() => { container.dispatchEvent(createDragEvent('dragover', [file])) })
    expect(result.current.isDragOver).toBe(true)

    act(() => { container.dispatchEvent(createDragEvent('drop', [file])) })
    expect(result.current.isDragOver).toBe(false)
  })

  it('accepts jpeg, gif, and webp types', () => {
    const { result } = renderImageDrop()

    for (const type of ['image/jpeg', 'image/gif', 'image/webp']) {
      const file = new File(['data'], `img.${type.split('/')[1]}`, { type })
      act(() => { container.dispatchEvent(createDragEvent('dragover', [file])) })
      expect(result.current.isDragOver).toBe(true)

      act(() => { container.dispatchEvent(createDragEvent('dragleave', [], { relatedTarget: document.body })) })
    }
  })

  it('passes its handlers and vaultPath without error', () => {
    const { result } = renderImageDrop({ onImagesDropped: vi.fn(), vaultPath: '/vault' })
    // Should render without error; Tauri event listener is skipped in browser mode
    expect(result.current.isDragOver).toBe(false)
  })

  it('leaves internal drops without image files to the editor', () => {
    const editorSurface = document.createElement('div')
    const blockNoteDrop = vi.fn()
    renderImageDrop({ onImagesDropped: vi.fn(), vaultPath: '/vault' })
    editorSurface.addEventListener('drop', blockNoteDrop, true)
    container.appendChild(editorSurface)

    const drop = createDragEvent('drop', [])
    act(() => { editorSurface.dispatchEvent(drop) })

    expect(drop.defaultPrevented).toBe(false)
    expect(blockNoteDrop).toHaveBeenCalledOnce()
  })

  it('asks where the images go at the point they were released, and inserts them there in order', async () => {
    const dropTargetAt = vi.fn((point: DropPoint) => ({ at: point }))
    const onImagesDropped = vi.fn()
    renderImageDrop({ dropTargetAt, onImagesDropped })
    const files = ['one.png', 'two.png', 'three.png'].map((name) => new File([name], name, { type: 'image/png' }))

    act(() => { container.dispatchEvent(createDragEvent('drop', files, { clientX: 240, clientY: 320 })) })

    expect(dropTargetAt).toHaveBeenCalledWith({ x: 240, y: 320 })
    await waitFor(() => { expect(onImagesDropped).toHaveBeenCalledOnce() })
    const [urls, target] = onImagesDropped.mock.calls[0]
    expect((urls as string[]).map((url) => atob(url.split(',')[1]))).toEqual(['one.png', 'two.png', 'three.png'])
    expect(target).toEqual({ at: { x: 240, y: 320 } })
  })

  it('takes an image drop that finds no place without letting the editor insert it its own way', () => {
    const onImagesDropped = vi.fn()
    const editorDrop = vi.fn()
    const editorSurface = document.createElement('div')
    renderImageDrop({ dropTargetAt: () => null, onImagesDropped })
    editorSurface.addEventListener('drop', editorDrop, true)
    container.appendChild(editorSurface)

    const drop = createDragEvent('drop', [new File(['png'], 'photo.png', { type: 'image/png' })])
    act(() => { editorSurface.dispatchEvent(drop) })

    expect(drop.defaultPrevented).toBe(true)
    expect(editorDrop).not.toHaveBeenCalled()
    expect(onImagesDropped).not.toHaveBeenCalled()
  })
})

describe('useImageDrop — Tauri native drag-drop', () => {
  let container: HTMLDivElement

  beforeEach(() => {
    tauriMode = true
    nativeDropUnlisten = () => {
      capturedDragDropHandler = undefined
    }
    capturedDragDropHandler = undefined
    container = document.createElement('div')
    document.body.appendChild(container)
    placeEditor(container)
  })

  afterEach(() => {
    tauriMode = false
    capturedDragDropHandler = undefined
    container.remove()
    Reflect.deleteProperty(document, 'elementFromPoint')
  })

  function renderImageDropTauri(opts?: DropOptions) {
    return renderImageDropOver(container, opts)
  }

  function emitNativeDropEvent(payload: unknown) {
    if (!capturedDragDropHandler) throw new Error('No native drop handler registered')
    capturedDragDropHandler({ payload })
  }

  async function waitForNativeDropListeners() {
    await waitFor(() => {
      expect(capturedDragDropHandler).toBeDefined()
    })
  }

  it('registers the native window drag/drop listener', async () => {
    const { result } = renderImageDropTauri()

    await waitForNativeDropListeners()

    expect(result.current.isDragOver).toBe(false)
  })

  it('resets isDragOver on Tauri drop event', async () => {
    const onImagesDropped = vi.fn()
    const { result } = renderImageDropTauri({ onImagesDropped, vaultPath: '/vault' })

    await waitForNativeDropListeners()

    act(() => {
      emitNativeDropEvent({ type: 'enter', paths: ['/tmp/photo.png'], position: { x: 100, y: 200 } })
    })
    expect(result.current.isDragOver).toBe(true)

    act(() => {
      emitNativeDropEvent({ type: 'drop', paths: ['/tmp/photo.png'], position: { x: 100, y: 200 } })
    })

    expect(result.current.isDragOver).toBe(false)
  })

  it('ignores malformed native drag-drop payloads without throwing', async () => {
    const onImagesDropped = vi.fn()
    const { result } = renderImageDropTauri({ onImagesDropped, vaultPath: '/vault' })

    await waitForNativeDropListeners()

    expect(() => {
      act(() => {
        emitNativeDropEvent(null)
      })
    }).not.toThrow()

    expect(result.current.isDragOver).toBe(false)
    expect(onImagesDropped).not.toHaveBeenCalled()
  })

  it('copies native image drops into the vault and inserts them where they were released', async () => {
    const dropTargetAt = vi.fn((point: DropPoint) => ({ at: point }))
    const onImagesDropped = vi.fn()
    const { invoke, convertFileSrc } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockClear()
    vi.mocked(convertFileSrc).mockClear()
    vi.mocked(invoke).mockResolvedValue('/vault/attachments/123-photo.png')
    vi.mocked(convertFileSrc).mockReturnValue('asset://localhost/vault/attachments/123-photo.png')
    renderImageDropTauri({ dropTargetAt, onImagesDropped, vaultPath: '/vault' })

    await waitForNativeDropListeners()

    act(() => {
      emitNativeDropEvent({
        type: 'drop',
        paths: ['/tmp/photo.png', '/tmp/readme.txt'],
        position: { x: 240, y: 320 },
      } satisfies NativeDropPayload)
    })

    expect(dropTargetAt).toHaveBeenCalledWith({ x: 240, y: 320 })
    await waitFor(() => {
      expect(onImagesDropped).toHaveBeenCalledWith(
        ['asset://localhost/vault/attachments/123-photo.png'],
        { at: { x: 240, y: 320 } },
      )
    })
    expect(invoke).toHaveBeenCalledWith('copy_image_to_vault', {
      vaultPath: '/vault',
      sourcePath: '/tmp/photo.png',
    })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('inserts several dropped images in the order they were dropped, whatever order their copies finish in', async () => {
    const onImagesDropped = vi.fn()
    const { invoke, convertFileSrc } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockReset()
    vi.mocked(convertFileSrc).mockImplementation((path: string) => `asset://localhost${path}`)
    const finishCopy: Record<string, () => void> = {}
    vi.mocked(invoke).mockImplementation((_command, args) => {
      const { sourcePath } = args as { sourcePath: string }
      const name = sourcePath.split('/').pop()!
      return new Promise((resolve) => { finishCopy[name] = () => resolve(`/vault/attachments/${name}`) })
    })
    renderImageDropTauri({ onImagesDropped, vaultPath: '/vault' })

    await waitForNativeDropListeners()

    act(() => {
      emitNativeDropEvent({
        type: 'drop',
        paths: ['/tmp/one.png', '/tmp/two.png', '/tmp/three.png'],
        position: { x: 240, y: 320 },
      } satisfies NativeDropPayload)
    })
    await waitFor(() => { expect(Object.keys(finishCopy)).toHaveLength(3) })

    finishCopy['three.png']()
    finishCopy['one.png']()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onImagesDropped).not.toHaveBeenCalled()
    finishCopy['two.png']()

    await waitFor(() => { expect(onImagesDropped).toHaveBeenCalledOnce() })
    expect(onImagesDropped.mock.calls[0][0]).toEqual([
      'asset://localhost/vault/attachments/one.png',
      'asset://localhost/vault/attachments/two.png',
      'asset://localhost/vault/attachments/three.png',
    ])
  })

  it('inserts the images that landed, still in order, and says which one did not', async () => {
    const onImageImportError = vi.fn()
    const onImagesDropped = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { invoke, convertFileSrc } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockReset()
    vi.mocked(convertFileSrc).mockImplementation((path: string) => `asset://localhost${path}`)
    vi.mocked(invoke).mockImplementation((_command, args) => {
      const { sourcePath } = args as { sourcePath: string }
      const name = sourcePath.split('/').pop()!
      return name === 'two.png' ? Promise.reject('Read-only file system') : Promise.resolve(`/vault/attachments/${name}`)
    })
    try {
      renderImageDropTauri({ onImageImportError, onImagesDropped, vaultPath: '/vault' })
      await waitForNativeDropListeners()

      act(() => {
        emitNativeDropEvent({
          type: 'drop',
          paths: ['/tmp/one.png', '/tmp/two.png', '/tmp/three.png'],
          position: { x: 240, y: 320 },
        } satisfies NativeDropPayload)
      })

      await waitFor(() => { expect(onImagesDropped).toHaveBeenCalledOnce() })
      expect(onImagesDropped.mock.calls[0][0]).toEqual([
        'asset://localhost/vault/attachments/one.png',
        'asset://localhost/vault/attachments/three.png',
      ])
      expect(onImageImportError).toHaveBeenCalledWith({ kind: 'copy-failed', fileName: 'two.png' })
    } finally {
      warn.mockRestore()
    }
  })

  it('takes nothing from a release outside the editor, over the sidebar or the tab bar', async () => {
    const dropTargetAt = vi.fn((point: DropPoint) => ({ at: point }))
    const onImageImportError = vi.fn()
    const onImagesDropped = vi.fn()
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockReset()
    renderImageDropTauri({ dropTargetAt, onImageImportError, onImagesDropped, vaultPath: '/vault' })

    await waitForNativeDropListeners()

    act(() => {
      emitNativeDropEvent({ type: 'drop', paths: ['/tmp/photo.png'], position: { x: 900, y: 320 } } satisfies NativeDropPayload)
      emitNativeDropEvent({ type: 'drop', paths: ['/tmp/photo.png'], position: { x: 240, y: 40 } } satisfies NativeDropPayload)
      emitNativeDropEvent({ type: 'drop', paths: ['/tmp/iphone.HEIC'], position: { x: 900, y: 320 } } satisfies NativeDropPayload)
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(dropTargetAt).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
    expect(onImagesDropped).not.toHaveBeenCalled()
    expect(onImageImportError).not.toHaveBeenCalled()
  })

  it('takes nothing from a release over something laid on top of the editor', async () => {
    const onImagesDropped = vi.fn()
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockReset()
    const dialog = document.createElement('div')
    document.body.appendChild(dialog)
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => dialog })
    renderImageDropTauri({ onImagesDropped, vaultPath: '/vault' })

    await waitForNativeDropListeners()

    act(() => {
      emitNativeDropEvent({ type: 'drop', paths: ['/tmp/photo.png'], position: { x: 240, y: 320 } } satisfies NativeDropPayload)
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(invoke).not.toHaveBeenCalled()
    dialog.remove()
  })

  it('takes every Image file extension the glossary names, not just the common ones', async () => {
    const onImagesDropped = vi.fn()
    const { invoke, convertFileSrc } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockResolvedValue('/vault/attachments/123-scan.tif')
    vi.mocked(convertFileSrc).mockReturnValue('asset://localhost/vault/attachments/123-scan.tif')
    renderImageDropTauri({ onImagesDropped, vaultPath: '/vault' })

    await waitForNativeDropListeners()

    act(() => {
      emitNativeDropEvent({
        type: 'drop',
        paths: ['/tmp/scan.tif', '/tmp/icon.ico', '/tmp/frame.avif', '/tmp/loop.apng'],
        position: { x: 240, y: 320 },
      } satisfies NativeDropPayload)
    })

    await waitFor(() => {
      expect(invoke).toHaveBeenCalledTimes(4)
    })
  })

  it('reports unsupported HEIC native drops without copying them into the vault', async () => {
    const onImageImportError = vi.fn()
    const onImagesDropped = vi.fn()
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockReset()
    renderImageDropTauri({ onImageImportError, onImagesDropped, vaultPath: '/vault' })

    await waitForNativeDropListeners()

    act(() => {
      emitNativeDropEvent({
        type: 'drop',
        paths: ['/tmp/iphone.HEIC'],
        position: { x: 240, y: 320 },
      } satisfies NativeDropPayload)
    })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(onImageImportError).toHaveBeenCalledWith({
      kind: 'unsupported-heic',
      fileName: 'iphone.HEIC',
      format: 'HEIC',
    })
    expect(invoke).not.toHaveBeenCalled()
    expect(onImagesDropped).not.toHaveBeenCalled()
  })

  it('says a native drop could not be copied into attachments/', async () => {
    const onImageImportError = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockRejectedValue('Read-only file system')
    try {
      renderImageDropTauri({ onImageImportError, onImagesDropped: vi.fn(), vaultPath: '/vault' })
      await waitForNativeDropListeners()

      act(() => {
        emitNativeDropEvent({ type: 'drop', paths: ['/tmp/photo.png'], position: { x: 240, y: 320 } } satisfies NativeDropPayload)
      })

      await waitFor(() => {
        expect(onImageImportError).toHaveBeenCalledWith({ kind: 'copy-failed', fileName: 'photo.png' })
      })
    } finally {
      warn.mockRestore()
    }
  })

  it('says an HTML5 drop could not be copied into attachments/', async () => {
    const onImageImportError = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockRejectedValue('Read-only file system')
    try {
      renderImageDropTauri({ onImageImportError, onImagesDropped: vi.fn(), vaultPath: '/vault' })

      act(() => { container.dispatchEvent(createDragEvent('drop', [new File(['png-data'], 'photo.png', { type: 'image/png' })])) })

      await waitFor(() => {
        expect(onImageImportError).toHaveBeenCalledWith({ kind: 'copy-failed', fileName: 'photo.png' })
      })
    } finally {
      warn.mockRestore()
    }
  })

  it('imports an HTML5 filesystem image once without delegating it to BlockNote', async () => {
    const onImagesDropped = vi.fn()
    const blockNoteDrop = vi.fn()
    const editorSurface = document.createElement('div')
    const { invoke, convertFileSrc } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockReset()
    vi.mocked(convertFileSrc).mockClear()
    vi.mocked(invoke).mockResolvedValue('/vault/attachments/123-photo.png')
    vi.mocked(convertFileSrc).mockReturnValue('asset://localhost/vault/attachments/123-photo.png')
    renderImageDropTauri({ onImagesDropped, vaultPath: '/vault' })
    editorSurface.addEventListener('drop', blockNoteDrop, true)
    container.appendChild(editorSurface)

    const file = new File(['png-data'], 'photo.png', { type: '' })
    const drop = createDragEvent('drop', [file])
    act(() => { editorSurface.dispatchEvent(drop) })

    expect(drop.defaultPrevented).toBe(true)
    expect(blockNoteDrop).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(onImagesDropped).toHaveBeenCalledWith(['asset://localhost/vault/attachments/123-photo.png'], expect.anything())
    })
    expect(invoke).toHaveBeenCalledWith('save_image', {
      vaultPath: '/vault',
      filename: 'photo.png',
      data: expect.any(String),
    })
    expect(invoke).toHaveBeenCalledTimes(1)
  })

  it('handles active-vault boundary failures from native image drops', async () => {
    const onImagesDropped = vi.fn()
    const onUnhandledRejection = vi.fn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockRejectedValue('Path must stay inside the active vault')
    process.on('unhandledRejection', onUnhandledRejection)
    try {
      renderImageDropTauri({ onImagesDropped, vaultPath: '/vault' })

      await waitForNativeDropListeners()

      act(() => {
        emitNativeDropEvent({
          type: 'drop',
          paths: ['/tmp/photo.png'],
          position: { x: 240, y: 320 },
        } satisfies NativeDropPayload)
      })

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('copy_image_to_vault', {
          vaultPath: '/vault',
          sourcePath: '/tmp/photo.png',
        })
      })
      await new Promise((resolve) => setTimeout(resolve, 0))

      expect(warn).toHaveBeenCalledWith(
        '[image-drop] Failed to copy dropped image into vault:',
        'Path must stay inside the active vault',
      )
      expect(onUnhandledRejection).not.toHaveBeenCalled()
      expect(onImagesDropped).not.toHaveBeenCalled()
    } finally {
      process.removeListener('unhandledRejection', onUnhandledRejection)
      warn.mockRestore()
    }
  })

  it('shows the drop affordance while an image is dragged over the editor', async () => {
    const { result } = renderImageDropTauri({ onImagesDropped: vi.fn(), vaultPath: '/vault' })

    await waitForNativeDropListeners()

    act(() => {
      emitNativeDropEvent({
        type: 'enter',
        paths: ['/tmp/photo.png'],
        position: { x: 240, y: 320 },
      } satisfies NativeDropPayload)
    })

    expect(result.current.isDragOver).toBe(true)
  })

  it('shows the drop affordance only while the pointer is over the editor', async () => {
    const { result } = renderImageDropTauri({ onImagesDropped: vi.fn(), vaultPath: '/vault' })

    await waitForNativeDropListeners()

    act(() => {
      emitNativeDropEvent({
        type: 'enter',
        paths: ['/tmp/photo.png'],
        position: { x: 900, y: 320 },
      } satisfies NativeDropPayload)
    })
    expect(result.current.isDragOver).toBe(false)

    act(() => {
      emitNativeDropEvent({ type: 'over', position: { x: 240, y: 320 } })
    })
    expect(result.current.isDragOver).toBe(true)

    act(() => {
      emitNativeDropEvent({ type: 'over', position: { x: 260, y: 340 } })
    })
    expect(result.current.isDragOver).toBe(true)

    act(() => {
      emitNativeDropEvent({ type: 'over', position: { x: 240, y: 40 } })
    })
    expect(result.current.isDragOver).toBe(false)
  })

  it('leaves the drop affordance hidden for a drag that carries no image', async () => {
    const { result } = renderImageDropTauri({ onImagesDropped: vi.fn(), vaultPath: '/vault' })

    await waitForNativeDropListeners()

    act(() => {
      emitNativeDropEvent({
        type: 'enter',
        paths: ['/tmp/plan.md'],
        position: { x: 240, y: 320 },
      } satisfies NativeDropPayload)
    })
    act(() => {
      emitNativeDropEvent({ type: 'over', position: { x: 260, y: 340 } })
    })

    expect(result.current.isDragOver).toBe(false)
  })

  it('resets isDragOver on Tauri leave event', async () => {
    const { result } = renderImageDropTauri()

    await waitForNativeDropListeners()

    act(() => {
      emitNativeDropEvent({ type: 'enter', paths: ['/tmp/photo.png'], position: { x: 240, y: 320 } })
    })
    expect(result.current.isDragOver).toBe(true)

    act(() => {
      emitNativeDropEvent({ type: 'leave' })
    })

    expect(result.current.isDragOver).toBe(false)
  })

  it('swallows duplicate native unlisten failures from dev-mode remounts', async () => {
    nativeDropUnlisten = () => {
      throw new TypeError("undefined is not an object (evaluating 'listeners[eventId].handlerId')")
    }
    const { unmount } = renderImageDropTauri()

    await waitForNativeDropListeners()

    expect(() => unmount()).not.toThrow()
  })
})

describe('useImageDrop — the margins beside the text column', () => {
  let area: HTMLDivElement
  let editor: HTMLDivElement
  let findBar: HTMLDivElement

  function box(element: HTMLElement, left: number, top: number, right: number, bottom: number) {
    vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
      top, bottom, left, right, height: bottom - top, width: right - left, x: left, y: top, toJSON: () => ({}),
    })
  }

  /**
   * The editor pane's document area, as a wide window lays it out: the scroll
   * area at x 200–1600, y 100–700, the find bar across its top (y 100–140) and
   * the text column at x 500–1300 holding the editor. Left of x 200 is the
   * sidebar and above y 100 the tab bar; neither is inside the scroll area.
   */
  beforeEach(() => {
    tauriMode = true
    nativeDropUnlisten = () => {
      capturedDragDropHandler = undefined
    }
    capturedDragDropHandler = undefined
    area = document.createElement('div')
    area.className = 'editor-scroll-area'
    findBar = document.createElement('div')
    const column = document.createElement('div')
    editor = document.createElement('div')
    column.appendChild(editor)
    area.append(findBar, column)
    document.body.appendChild(area)
    box(area, 200, 100, 1600, 700)
    box(findBar, 200, 100, 1600, 140)
    box(column, 500, 140, 1300, 700)
    box(editor, 500, 140, 1300, 700)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: (x: number, y: number) => {
        if (x < 200 || y < 100) return document.body
        if (y < 140) return findBar
        return x >= 500 && x <= 1300 ? editor : area
      },
    })
  })

  afterEach(() => {
    tauriMode = false
    capturedDragDropHandler = undefined
    area.remove()
    Reflect.deleteProperty(document, 'elementFromPoint')
  })

  async function renderOverEditor(opts: DropOptions = {}) {
    const rendered = renderImageDropOver(editor, opts)
    await waitFor(() => { expect(capturedDragDropHandler).toBeDefined() })
    return rendered
  }

  function emit(payload: unknown) {
    act(() => { capturedDragDropHandler!({ payload }) })
  }

  it('takes a release in the empty margin left or right of the text column, and asks for the place at that point', async () => {
    const dropTargetAt = vi.fn((point: DropPoint) => ({ at: point }))
    const onImagesDropped = vi.fn()
    const { invoke, convertFileSrc } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockResolvedValue('/vault/attachments/photo.png')
    vi.mocked(convertFileSrc).mockReturnValue('asset://localhost/vault/attachments/photo.png')
    await renderOverEditor({ dropTargetAt, onImagesDropped, vaultPath: '/vault' })

    emit({ type: 'drop', paths: ['/tmp/photo.png'], position: { x: 260, y: 320 } } satisfies NativeDropPayload)
    emit({ type: 'drop', paths: ['/tmp/photo.png'], position: { x: 1540, y: 480 } } satisfies NativeDropPayload)

    expect(dropTargetAt.mock.calls).toEqual([[{ x: 260, y: 320 }], [{ x: 1540, y: 480 }]])
    await waitFor(() => { expect(onImagesDropped).toHaveBeenCalledTimes(2) })
    expect(onImagesDropped.mock.calls.map(([, target]) => target)).toEqual([
      { at: { x: 260, y: 320 } },
      { at: { x: 1540, y: 480 } },
    ])
  })

  it('shows the drop affordance while the pointer is in either margin, and hides it over the find bar, the sidebar and the tab bar', async () => {
    const { result } = await renderOverEditor({ onImagesDropped: vi.fn(), vaultPath: '/vault' })

    emit({ type: 'enter', paths: ['/tmp/photo.png'], position: { x: 260, y: 320 } } satisfies NativeDropPayload)
    expect(result.current.isDragOver).toBe(true)

    emit({ type: 'over', position: { x: 1540, y: 320 } })
    expect(result.current.isDragOver).toBe(true)

    emit({ type: 'over', position: { x: 260, y: 120 } })
    expect(result.current.isDragOver).toBe(false)

    emit({ type: 'over', position: { x: 800, y: 320 } })
    expect(result.current.isDragOver).toBe(true)

    emit({ type: 'over', position: { x: 120, y: 320 } })
    expect(result.current.isDragOver).toBe(false)

    emit({ type: 'over', position: { x: 800, y: 60 } })
    expect(result.current.isDragOver).toBe(false)
  })

  it('still takes nothing from a release over the sidebar, the tab bar, the find bar or a dialog laid over a margin', async () => {
    const dropTargetAt = vi.fn((point: DropPoint) => ({ at: point }))
    const onImagesDropped = vi.fn()
    const { invoke } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockReset()
    await renderOverEditor({ dropTargetAt, onImagesDropped, vaultPath: '/vault' })

    emit({ type: 'drop', paths: ['/tmp/photo.png'], position: { x: 120, y: 320 } } satisfies NativeDropPayload)
    emit({ type: 'drop', paths: ['/tmp/photo.png'], position: { x: 800, y: 60 } } satisfies NativeDropPayload)
    emit({ type: 'drop', paths: ['/tmp/photo.png'], position: { x: 1540, y: 120 } } satisfies NativeDropPayload)
    const dialog = document.createElement('div')
    document.body.appendChild(dialog)
    Object.defineProperty(document, 'elementFromPoint', { configurable: true, value: () => dialog })
    emit({ type: 'drop', paths: ['/tmp/photo.png'], position: { x: 1540, y: 320 } } satisfies NativeDropPayload)
    await new Promise((resolve) => setTimeout(resolve, 0))
    dialog.remove()

    expect(dropTargetAt).not.toHaveBeenCalled()
    expect(invoke).not.toHaveBeenCalled()
    expect(onImagesDropped).not.toHaveBeenCalled()
  })

  it('takes an HTML5 image drop in a margin, and refuses one over the find bar', async () => {
    const dropTargetAt = vi.fn((point: DropPoint) => ({ at: point }))
    const onImagesDropped = vi.fn()
    const { invoke, convertFileSrc } = await import('@tauri-apps/api/core')
    vi.mocked(invoke).mockReset()
    vi.mocked(invoke).mockResolvedValue('/vault/attachments/photo.png')
    vi.mocked(convertFileSrc).mockReturnValue('asset://localhost/vault/attachments/photo.png')
    const { result } = await renderOverEditor({ dropTargetAt, onImagesDropped, vaultPath: '/vault' })
    const photo = () => new File(['png'], 'photo.png', { type: 'image/png' })

    const overFindBar = createDragEvent('dragover', [photo()], { clientX: 260, clientY: 120 })
    act(() => { findBar.dispatchEvent(overFindBar) })
    expect(overFindBar.defaultPrevented).toBe(false)
    expect(result.current.isDragOver).toBe(false)

    const overMargin = createDragEvent('dragover', [photo()], { clientX: 260, clientY: 320 })
    act(() => { area.dispatchEvent(overMargin) })
    expect(overMargin.defaultPrevented).toBe(true)
    expect(result.current.isDragOver).toBe(true)

    act(() => { area.dispatchEvent(createDragEvent('drop', [photo()], { clientX: 260, clientY: 320 })) })

    expect(dropTargetAt).toHaveBeenCalledWith({ x: 260, y: 320 })
    await waitFor(() => { expect(onImagesDropped).toHaveBeenCalledOnce() })
  })

  it('stops the synthetic copy BlockNote re-dispatches into the editor, so a drag near it is read once, where it really is', async () => {
    const dropTargetAt = vi.fn((point: DropPoint) => ({ at: point }))
    const editorDrop = vi.fn()
    const editorDragOver = vi.fn()
    const { result } = await renderOverEditor({ dropTargetAt, onImagesDropped: vi.fn(), vaultPath: '/vault' })
    editor.addEventListener('drop', editorDrop)
    editor.addEventListener('dragover', editorDragOver)
    const synthetic = (type: string) => Object.assign(
      createDragEvent(type, [new File(['png'], 'photo.png', { type: 'image/png' })], { clientX: 600, clientY: 150 }),
      { synthetic: true },
    )

    act(() => { editor.dispatchEvent(synthetic('dragover')) })
    act(() => { editor.dispatchEvent(synthetic('drop')) })

    expect(result.current.isDragOver).toBe(false)
    expect(editorDragOver).not.toHaveBeenCalled()
    expect(editorDrop).not.toHaveBeenCalled()
    expect(dropTargetAt).not.toHaveBeenCalled()
  })
})

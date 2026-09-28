import { act, render, screen } from '@testing-library/react'
import type { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorHistory } from './editor-history'
import type { ImageImportError } from './use-image-drop'

const { imageDrop } = vi.hoisted(() => ({
  imageDrop: { args: null as null | Record<string, unknown> },
}))

// The real hook, with what the view hands it kept to call as a drop would.
vi.mock('./use-image-drop', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./use-image-drop')>()
  return {
    ...actual,
    useImageDrop: (args: Parameters<typeof actual.useImageDrop>[0]) => {
      imageDrop.args = args
      return actual.useImageDrop(args)
    },
  }
})

import { RawEditorView } from './raw-editor-view'

type CodeMirrorHost = HTMLElement & { __cmView?: EditorView }
type ImagesDropped = (urls: string[], target: { line: number; placement: 'before' | 'after' }) => void

const ATTACHMENT = (name: string) => `asset://localhost/${encodeURIComponent(`/vault/attachments/${name}`)}`

function renderRaw(overrides: Partial<Parameters<typeof RawEditorView>[0]> = {}) {
  const props = {
    content: '# Plan\n\nFirst.\n\nSecond.',
    path: '/vault/plan.md',
    onContentChange: vi.fn(),
    onSave: vi.fn(),
    vaultPath: '/vault',
    attachmentVaultPath: '/vault',
    onImageImportError: vi.fn(),
    ...overrides,
  }
  render(<RawEditorView {...props} />)
  const view = (screen.getByTestId('raw-editor-codemirror') as CodeMirrorHost).__cmView!
  return { props, view }
}

function dropImages(urls: string[], target: { line: number; placement: 'before' | 'after' }) {
  act(() => { (imageDrop.args!.onImagesDropped as ImagesDropped)(urls, target) })
}

describe('RawEditorView image drop', () => {
  beforeEach(() => {
    imageDrop.args = null
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('takes a drop only over the CodeMirror editor, and copies it into attachments/ beside the Document as Rich mode does', () => {
    renderRaw({ attachmentVaultPath: '/vault/notes', path: '/vault/notes/plan.md' })

    const containerRef = imageDrop.args!.containerRef as { current: HTMLElement | null }
    expect(containerRef.current).toBe(screen.getByTestId('raw-editor-codemirror'))
    expect(imageDrop.args).toMatchObject({ vaultPath: '/vault/notes' })
  })

  it('inserts each dropped image on its own line at the drop point, in order, written as Rich mode writes it', () => {
    const { view } = renderRaw()

    dropImages([ATTACHMENT('one.png'), ATTACHMENT('two.png')], { line: 3, placement: 'after' })

    expect(view.state.doc.toString()).toBe(
      '# Plan\n\nFirst.\n\n![](attachments/one.png)\n\n![](attachments/two.png)\n\nSecond.',
    )
  })

  it('hands the inserted lines to Autosave and takes them back with one Undo', () => {
    vi.useFakeTimers()
    const historyRef = { current: null as EditorHistory | null }
    const { props, view } = renderRaw({ historyRef })

    dropImages([ATTACHMENT('one.png')], { line: 1, placement: 'after' })
    act(() => { vi.advanceTimersByTime(500) })

    expect(props.onContentChange).toHaveBeenCalledWith(
      '/vault/plan.md',
      '# Plan\n\n![](attachments/one.png)\n\nFirst.\n\nSecond.',
    )

    act(() => { historyRef.current!.undo() })
    expect(view.state.doc.toString()).toBe('# Plan\n\nFirst.\n\nSecond.')
  })

  it('says why a dropped image did not become an Attachment', () => {
    const { props, view } = renderRaw()
    const host = screen.getByTestId('raw-editor-codemirror')
    // Layout is not there to hit-test, so the drop point is read as the start of line 1.
    vi.spyOn(view, 'posAtCoords').mockReturnValue(0)
    const heic = new File(['heic'], 'IMG_0001.HEIC', { type: 'image/heic' })
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    Object.assign(drop, { clientX: 10, clientY: 10, dataTransfer: { files: [heic], items: [] } })

    act(() => { host.dispatchEvent(drop) })

    expect(props.onImageImportError).toHaveBeenCalledWith({
      kind: 'unsupported-heic',
      fileName: 'IMG_0001.HEIC',
      format: 'HEIC',
    } satisfies ImageImportError)
    expect(view.state.doc.toString()).toBe('# Plan\n\nFirst.\n\nSecond.')
  })
})

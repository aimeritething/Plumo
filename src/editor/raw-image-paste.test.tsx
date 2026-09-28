import { act, render, screen, waitFor } from '@testing-library/react'
import type { EditorView } from '@codemirror/view'
import { invoke } from '@tauri-apps/api/core'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EditorHistory } from './editor-history'
import { RawEditorView } from './raw-editor-view'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}))

vi.mock('@/platform/tauri', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/platform/tauri')>(),
  isTauri: () => true,
}))

type CodeMirrorHost = HTMLElement & { __cmView?: EditorView }

const CONTENT = '# Plan\n\nFirst.\n\nSecond.'
const AFTER_FIRST = CONTENT.indexOf('First.') + 'First.'.length

function png(name: string): File {
  return new File([name], name, { type: 'image/png' })
}

function clipboard({ files = [], text }: { files?: File[]; text?: string }): DataTransfer {
  const types = [...(text === undefined ? [] : ['text/plain']), ...(files.length > 0 ? ['Files'] : [])]
  return {
    files,
    items: files.map((file) => ({ kind: 'file', type: file.type, getAsFile: () => file })),
    getData: (type: string) => (type === 'text/plain' ? text ?? '' : ''),
    types,
  } as unknown as DataTransfer
}

function renderRaw(overrides: Partial<Parameters<typeof RawEditorView>[0]> = {}) {
  const props = {
    content: CONTENT,
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

/** Paste into CodeMirror's content with the caret, or a selection, where given. */
function paste(view: EditorView, data: DataTransfer, selection: { anchor: number; head?: number } = { anchor: AFTER_FIRST }) {
  act(() => { view.dispatch({ selection }) })
  const event = new Event('paste', { bubbles: true, cancelable: true })
  Object.assign(event, { clipboardData: data })
  act(() => { view.contentDOM.dispatchEvent(event) })
  return event
}

/** `save_image` answers with the path it wrote, in `attachments/` beside the Document, once `finish` is called for it. */
function saveImageOnCall() {
  const finish: Record<string, () => void> = {}
  vi.mocked(invoke).mockImplementation((_command, args) => {
    const { filename, vaultPath } = args as { filename: string; vaultPath: string }
    return new Promise((resolve) => { finish[filename] = () => resolve(`${vaultPath}/attachments/${filename}`) })
  })
  return finish
}

describe('RawEditorView image paste', () => {
  beforeAll(() => {
    // The saves are awaited, so CodeMirror's measuring frame runs; jsdom's ranges have no rects.
    Object.assign(Range.prototype, {
      getBoundingClientRect: () => new DOMRect(),
      getClientRects: () => Object.assign([], { item: () => null }),
    })
  })

  afterAll(() => {
    Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect')
    Reflect.deleteProperty(Range.prototype, 'getClientRects')
  })

  beforeEach(() => {
    vi.mocked(invoke).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('saves a pasted image as an Attachment beside the Document and puts its line at the caret, as Rich mode writes it', async () => {
    vi.mocked(invoke).mockResolvedValue('/vault/notes/attachments/shot.png')
    const { view } = renderRaw({ path: '/vault/notes/plan.md', attachmentVaultPath: '/vault/notes' })

    const event = paste(view, clipboard({ files: [png('shot.png')] }))

    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => { expect(view.state.doc.toString()).toBe('# Plan\n\nFirst.\n\n![](./attachments/shot.png)\n\nSecond.') })
    expect(invoke).toHaveBeenCalledWith('save_image', { vaultPath: '/vault/notes', filename: 'shot.png', data: expect.any(String) })
    expect(view.state.selection.main.head).toBe('# Plan\n\nFirst.\n\n![](./attachments/shot.png)'.length)
  })

  it('puts several images in clipboard order whatever order they are saved in, replacing the selection, and one Undo takes them all back', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const finish = saveImageOnCall()
    const historyRef = { current: null as EditorHistory | null }
    const { props, view } = renderRaw({ historyRef })

    paste(view, clipboard({ files: [png('one.png'), png('two.png')] }), { anchor: CONTENT.indexOf('First.'), head: AFTER_FIRST })
    await waitFor(() => { expect(Object.keys(finish)).toHaveLength(2) })
    finish['two.png']()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(view.state.doc.toString()).toBe(CONTENT)
    finish['one.png']()

    await waitFor(() => {
      expect(view.state.doc.toString()).toBe('# Plan\n\n![](attachments/one.png)\n\n![](attachments/two.png)\n\nSecond.')
    })
    act(() => { vi.advanceTimersByTime(500) })
    expect(props.onContentChange).toHaveBeenLastCalledWith('/vault/plan.md', '# Plan\n\n![](attachments/one.png)\n\n![](attachments/two.png)\n\nSecond.')

    act(() => { historyRef.current!.undo() })
    expect(view.state.doc.toString()).toBe(CONTENT)
  })

  it('says why a pasted image did not become an Attachment, and puts in the ones that did', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(invoke).mockImplementation((_command, args) => {
      const { filename } = args as { filename: string }
      return filename === 'locked.png' ? Promise.reject('Read-only file system') : Promise.resolve(`/vault/attachments/${filename}`)
    })
    const { props, view } = renderRaw()

    paste(view, clipboard({ files: [png('locked.png'), new File(['heic'], 'IMG_0001.HEIC', { type: 'image/heic' }), png('ok.png')] }))

    await waitFor(() => { expect(view.state.doc.toString()).toBe('# Plan\n\nFirst.\n\n![](attachments/ok.png)\n\nSecond.') })
    expect(props.onImageImportError).toHaveBeenCalledWith({ kind: 'copy-failed', fileName: 'locked.png' })
    expect(props.onImageImportError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'unsupported-heic', fileName: 'IMG_0001.HEIC' }))
    warn.mockRestore()
  })

  it('puts the image at the caret, taking nothing, when the Document was typed into while it was saved', async () => {
    const finish = saveImageOnCall()
    const { view } = renderRaw()

    paste(view, clipboard({ files: [png('shot.png')] }), { anchor: CONTENT.indexOf('First.'), head: AFTER_FIRST })
    await waitFor(() => { expect(finish['shot.png']).toBeDefined() })
    act(() => { view.dispatch({ changes: { from: CONTENT.length, insert: ' More' }, selection: { anchor: CONTENT.length + 5 } }) })
    finish['shot.png']()

    await waitFor(() => { expect(view.state.doc.toString()).toBe('# Plan\n\nFirst.\n\nSecond. More\n\n![](attachments/shot.png)') })
  })

  it('leaves a text paste to CodeMirror, unchanged', () => {
    const { view } = renderRaw()

    paste(view, clipboard({ text: ' pasted' }))

    expect(view.state.doc.toString()).toBe('# Plan\n\nFirst. pasted\n\nSecond.')
    expect(invoke).not.toHaveBeenCalled()
  })

  it('pastes the text, not the image, from a clipboard that carries both, as Rich mode does', async () => {
    const { view } = renderRaw()

    paste(view, clipboard({ files: [png('shot.png')], text: ' shot.png' }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(view.state.doc.toString()).toBe('# Plan\n\nFirst. shot.png\n\nSecond.')
    expect(invoke).not.toHaveBeenCalled()
  })
})

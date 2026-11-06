import { en } from '@blocknote/core/locales'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/ui/tooltip'
import { subscribeImageOpenRequests } from './image-block-requests'
import { endOpenBlockEdits } from './open-block-edits'
import {
  AudioBlock,
  FileBlock,
  fileBlockDisplayName,
  resizedMediaWidth,
  VideoBlock,
} from './media-blocks'

const filePanel = vi.hoisted(() => ({ showMenu: vi.fn() }))
const uploading = vi.hoisted(() => ({ value: false }))

vi.mock('@blocknote/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@blocknote/react')>()),
  useDictionary: () => en,
  useEditorState: ({ editor, selector }: { editor: unknown; selector: (context: { editor: unknown }) => unknown }) => selector({ editor }),
  useExtension: () => filePanel,
  useUploadLoading: () => uploading.value,
}))

vi.mock('@/platform/media-preview-runtime', () => ({
  useExternalMediaPreview: () => false,
}))

const ATTACHMENT_URL = 'asset://localhost/%2Fvault%2Fattachments%2Freport.pdf'

type Kind = 'audio' | 'video' | 'file'
type TestProps = { url?: string; name?: string; caption?: string; previewWidth?: number; showPreview?: boolean; textAlignment?: string }

const VIEWS = { audio: AudioBlock, video: VideoBlock, file: FileBlock } as const

function createEditor(kind: Kind, blockProps: TestProps, options: { editable?: boolean; selected?: boolean }) {
  const block = {
    id: `${kind}-block`,
    type: kind,
    props: {
      backgroundColor: 'default',
      textAlignment: 'left',
      name: 'report.pdf',
      url: ATTACHMENT_URL,
      caption: '',
      ...(kind === 'file' ? {} : { showPreview: true, previewWidth: undefined as number | undefined }),
      ...blockProps,
    },
    content: undefined,
    children: [],
  }
  const domElement = document.createElement('div')
  const column = document.createElement('div')
  Object.defineProperty(column, 'clientWidth', { value: 700 })
  domElement.appendChild(column)
  const editor = {
    isEditable: options.editable ?? true,
    domElement,
    prosemirrorState: {
      selection: options.selected
        ? { node: { attrs: {} }, $from: { parent: { attrs: { id: block.id } } } }
        : { from: 1, to: 1 },
    },
    focus: vi.fn(),
    getBlock: vi.fn((id: string) => (id === block.id ? block : undefined)),
    removeBlocks: vi.fn(),
    setTextCursorPosition: vi.fn(),
    transact: vi.fn((run: () => void) => run()),
    updateBlock: vi.fn(),
  }
  return { block, editor }
}

function renderBlock(kind: Kind, blockProps: TestProps = {}, options: { editable?: boolean; selected?: boolean } = {}) {
  const { block, editor } = createEditor(kind, blockProps, options)
  const View = VIEWS[kind] as (props: ComponentProps<typeof FileBlock>) => ReturnType<typeof FileBlock>
  const view = render(<View {...({ block, editor } as unknown as ComponentProps<typeof FileBlock>)} />, { wrapper: TooltipProvider })
  return { ...view, block, editor }
}

const toolbar = () => screen.getByTestId('file-toolbar')
const view = (container: HTMLElement) => container.querySelector('[data-file-block-view]') as HTMLElement

function openMoreMenu() {
  fireEvent.pointerDown(screen.getByTestId('file-toolbar-more'), { button: 0, ctrlKey: false, pointerType: 'mouse' })
}

beforeEach(() => {
  filePanel.showMenu.mockReset()
  uploading.value = false
})

describe('an Audio, Video or File block with no file yet', () => {
  it.each([
    ['audio', 'Add audio'],
    ['video', 'Add video'],
    ['file', 'Add file'],
  ] as const)('a %s block offers to add one and opens the File panel on a click', (kind, label) => {
    const { editor } = renderBlock(kind, { url: '' })
    const button = screen.getByRole('button', { name: label })

    const press = fireEvent.mouseDown(button)
    fireEvent.click(button)

    expect(press).toBe(false)
    expect(editor.transact).toHaveBeenCalledTimes(1)
    expect(filePanel.showMenu).toHaveBeenCalledWith(`${kind}-block`)
    expect(screen.queryByTestId('file-toolbar')).not.toBeInTheDocument()
  })

  it('opens nothing read-only', () => {
    renderBlock('file', { url: '' }, { editable: false })
    fireEvent.click(screen.getByRole('button', { name: 'Add file' }))

    expect(filePanel.showMenu).not.toHaveBeenCalled()
  })

  it('takes the darker fill while selected', () => {
    renderBlock('video', { url: '' }, { selected: true })

    expect(screen.getByRole('button', { name: 'Add video' })).toHaveAttribute('data-selected', 'true')
  })

  it('says it is loading while a file goes in', () => {
    uploading.value = true
    renderBlock('audio', { url: '' })

    expect(screen.getByText('Loading…')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add audio' })).not.toBeInTheDocument()
  })
})

describe('what the Block shows', () => {
  it('a File block shows its icon and name on one line', () => {
    const { container } = renderBlock('file')

    expect(container.querySelector('[data-file-name]')).toHaveTextContent('report.pdf')
    expect(container.querySelector('[data-file-block-frame] svg')).toBeTruthy()
    expect(container.querySelector('audio, video')).toBeNull()
  })

  it('an Audio or Video block shows its player, or its name when the preview is off', () => {
    const { container, unmount } = renderBlock('video')
    expect(container.querySelector('video')).toHaveAttribute('src', ATTACHMENT_URL)
    unmount()

    const audio = renderBlock('audio')
    expect(audio.container.querySelector('audio')).toHaveAttribute('controls')
    audio.unmount()

    const off = renderBlock('video', { showPreview: false })
    expect(off.container.querySelector('video')).toBeNull()
    expect(off.container.querySelector('[data-file-name]')).toHaveTextContent('report.pdf')
  })

  it('tints a selected Block in place of an outline', () => {
    const { container } = renderBlock('file', {}, { selected: true })

    expect(container.querySelector('[data-file-block-selection]')).not.toHaveClass('hidden')
    expect(view(container)).toHaveClass('outline-none!')
  })
})

describe('the File toolbar', () => {
  it('shows on hover and while selected, stays in the page, and not read-only', () => {
    const { container, unmount } = renderBlock('file')
    expect(toolbar()).toHaveClass('opacity-0')
    fireEvent.mouseEnter(view(container))
    expect(toolbar()).toHaveClass('opacity-100')
    fireEvent.mouseLeave(view(container))
    expect(toolbar()).toHaveClass('opacity-0')
    unmount()

    const selected = renderBlock('file', {}, { selected: true })
    expect(toolbar()).toHaveClass('opacity-100')
    selected.unmount()

    renderBlock('file', {}, { editable: false, selected: true })
    expect(toolbar()).toHaveClass('opacity-0')
  })

  it('sits in a video\'s corner, above an audio player, and at the end of a file\'s line', () => {
    const video = renderBlock('video')
    expect(toolbar()).toHaveAttribute('data-file-toolbar', 'inside')
    video.unmount()

    const audio = renderBlock('audio')
    expect(toolbar()).toHaveAttribute('data-file-toolbar', 'above')
    audio.unmount()

    renderBlock('file')
    expect(toolbar()).toHaveAttribute('data-file-toolbar', 'end')
  })

  it('offers Replace, Rename, the preview toggle and Delete; a File block has no preview to toggle', () => {
    const video = renderBlock('video')
    openMoreMenu()
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Replace video',
      'Rename video',
      'Show as file',
      'Delete',
    ])
    video.unmount()

    renderBlock('file')
    openMoreMenu()
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Replace file',
      'Rename file',
      'Delete',
    ])
  })

  it('opens the File panel to replace the file, once the menu has let go of the focus', async () => {
    renderBlock('audio')
    openMoreMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Replace audio' }))

    await waitFor(() => expect(filePanel.showMenu).toHaveBeenCalledWith('audio-block'))
  })

  it('turns the player into the file\'s line and back', async () => {
    const { editor } = renderBlock('video')
    openMoreMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show as file' }))

    await waitFor(() => expect(editor.updateBlock).toHaveBeenCalledWith('video-block', { props: { showPreview: false } }))
  })

  it('renames the file on Enter and drops the edit on Esc', async () => {
    const { editor } = renderBlock('file')
    openMoreMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename file' }))
    const input = await screen.findByTestId('file-rename-input')
    expect(input).toHaveValue('report.pdf')
    fireEvent.change(input, { target: { value: 'Q3 report.pdf' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(editor.updateBlock).toHaveBeenCalledWith('file-block', { props: { name: 'Q3 report.pdf' } })
    expect(screen.queryByTestId('file-rename-input')).not.toBeInTheDocument()

    editor.updateBlock.mockClear()
    openMoreMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename file' }))
    fireEvent.change(await screen.findByTestId('file-rename-input'), { target: { value: 'Dropped' } })
    fireEvent.keyDown(screen.getByTestId('file-rename-input'), { key: 'Escape' })

    expect(editor.updateBlock).not.toHaveBeenCalled()
  })

  it('asks the surface to open the file, then gives the Block its selection back', () => {
    const { container, editor } = renderBlock('file')
    const listener = vi.fn()
    const unsubscribe = subscribeImageOpenRequests(container, listener)
    fireEvent.click(screen.getByTestId('file-toolbar-open'))

    expect(listener).toHaveBeenCalledWith({ url: ATTACHMENT_URL })
    expect(screen.getByTestId('file-toolbar-open')).toHaveAccessibleName('Open with default app')
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith('file-block')
    unsubscribe()
  })

  it('names the open button Open in browser for a file fetched over the web', () => {
    renderBlock('video', { url: 'https://example.com/clip.mp4' })

    expect(screen.getByTestId('file-toolbar-open')).toHaveAccessibleName('Open in browser')
  })

  it('deletes the Block alone', async () => {
    const { editor } = renderBlock('audio')
    openMoreMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    await waitFor(() => expect(editor.removeBlocks).toHaveBeenCalledWith(['audio-block']))
  })
})

describe('the caption', () => {
  it('is typed in place and written once, when Enter ends the edit', () => {
    const { editor } = renderBlock('video')
    fireEvent.click(screen.getByTestId('file-toolbar-caption'))
    const input = screen.getByTestId('image-caption-input')
    fireEvent.change(input, { target: { value: 'Launch demo' } })
    expect(editor.updateBlock).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(editor.updateBlock).toHaveBeenCalledTimes(1)
    expect(editor.updateBlock).toHaveBeenCalledWith('video-block', { props: { caption: 'Launch demo' } })
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith('video-block')
  })

  it('ends when the editor flushes its pending change (a Tab switch, ⌘S, quitting)', () => {
    const { editor } = renderBlock('file', { caption: 'Old' })
    expect(screen.getByTestId('image-caption')).toHaveTextContent('Old')
    fireEvent.click(screen.getByTestId('file-toolbar-caption'))
    fireEvent.change(screen.getByTestId('image-caption-input'), { target: { value: 'Typed before the switch' } })

    act(() => endOpenBlockEdits(editor))

    expect(editor.updateBlock).toHaveBeenCalledWith('file-block', { props: { caption: 'Typed before the switch' } })
  })
})

describe('resizing a video', () => {
  it('moves the dragged edge and stores whole pixels on release', () => {
    const { container, editor } = renderBlock('video', { previewWidth: 300 })
    const frame = container.querySelector('[data-file-block-frame]') as HTMLElement
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ width: 300 } as DOMRect)
    fireEvent.mouseEnter(view(container))
    const handle = container.querySelector('[data-media-resize-handle="right"]') as HTMLElement
    expect(handle).not.toHaveClass('invisible')

    fireEvent.mouseDown(handle, { clientX: 500 })
    fireEvent.mouseMove(window, { clientX: 520.3 })
    expect(toolbar()).toHaveClass('opacity-0')
    expect(Number.parseFloat(view(container).style.width)).toBeCloseTo(320.3)
    fireEvent.mouseUp(window)

    expect(editor.updateBlock).toHaveBeenCalledWith('video-block', { props: { previewWidth: 320 } })
  })

  it('has no handles on an audio player or a file\'s line', () => {
    const { container } = renderBlock('audio')

    expect(container.querySelector('[data-media-resize-handle]')).toBeNull()
  })
})

describe('file Block helpers', () => {
  it('names a file by its name, else by the last part of its URL', () => {
    expect(fileBlockDisplayName('Notes', ATTACHMENT_URL)).toBe('Notes')
    expect(fileBlockDisplayName('  ', ATTACHMENT_URL)).toBe('report.pdf')
    expect(fileBlockDisplayName('', 'https://example.com/a/b%20c.mp3?x=1')).toBe('b c.mp3')
  })

  it('resizes a centred video from both edges, any other from one, between 64px and the column', () => {
    const start = { handle: 'right' as const, startWidth: 300, startX: 500 }
    expect(resizedMediaWidth(start, 520, 700, false)).toBe(320)
    expect(resizedMediaWidth(start, 520, 700, true)).toBe(340)
    expect(resizedMediaWidth({ ...start, handle: 'left' }, 520, 700, false)).toBe(280)
    expect(resizedMediaWidth(start, 0, 700, false)).toBe(64)
    expect(resizedMediaWidth(start, 2000, 700, false)).toBe(700)
  })
})

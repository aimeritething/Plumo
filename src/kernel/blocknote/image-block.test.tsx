import { en } from '@blocknote/core/locales'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchFolderFilesChanged } from '@/lib/folder-file-changes'
import { pressToOpen } from '@/ui/open-layer.test-utils'
import { TooltipProvider } from '@/ui/tooltip'
import { subscribeImageOpenRequests, subscribeImagePreviewRequests } from './image-block-requests'
import { endOpenBlockEdits } from './open-block-edits'
import {
  folderChangeTouches,
  ImageBlock,
  imageFileName,
  isBlockNodeSelected,
} from './image-block'
import { normalizeImageCaption } from './image-caption'

const filePanel = vi.hoisted(() => ({ showMenu: vi.fn() }))

vi.mock('@blocknote/react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@blocknote/react')>()),
  useDictionary: () => en,
  useEditorState: ({ editor, selector }: { editor: unknown; selector: (context: { editor: unknown }) => unknown }) => selector({ editor }),
  useExtension: () => filePanel,
  useUploadLoading: () => false,
}))

const ATTACHMENT_URL = 'asset://localhost/%2Fvault%2Fattachments%2Fchart%20one.png'

type TestProps = { url?: string; name?: string; caption?: string; previewWidth?: number }

function createEditor(blockProps: TestProps = {}, options: { editable?: boolean; selected?: boolean } = {}) {
  const block = {
    id: 'image-block',
    type: 'image',
    props: {
      backgroundColor: 'default',
      textAlignment: 'left',
      name: 'Chart',
      url: ATTACHMENT_URL,
      caption: '',
      showPreview: true,
      previewWidth: undefined as number | undefined,
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
        ? { node: { attrs: {} }, $from: { parent: { attrs: { id: 'image-block' } } } }
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

function renderImageBlock(blockProps: TestProps = {}, options: { editable?: boolean; selected?: boolean } = {}) {
  const { block, editor } = createEditor(blockProps, options)
  const props = { block, editor } as unknown as ComponentProps<typeof ImageBlock>
  const view = render(<ImageBlock {...props} />, { wrapper: TooltipProvider })
  return { ...view, block, editor }
}

const toolbar = () => screen.getByTestId('image-toolbar')
const wrapper = (container: HTMLElement) => container.querySelector('.bn-file-block-content-wrapper') as HTMLElement

function openMoreMenu() {
  pressToOpen(screen.getByTestId('image-toolbar-more'))
}

beforeEach(() => {
  filePanel.showMenu.mockReset()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('an Image block with no picture yet', () => {
  it('offers to add one and opens the File panel on a click, keeping the editor focused', () => {
    const { editor } = renderImageBlock({ url: '' })
    const button = screen.getByRole('button', { name: 'Add image' })

    expect(fireEvent.mouseDown(button)).toBe(false)
    fireEvent.click(button)

    expect(editor.transact).toHaveBeenCalledTimes(1)
    expect(filePanel.showMenu).toHaveBeenCalledWith('image-block')
    expect(screen.queryByTestId('image-toolbar')).not.toBeInTheDocument()
  })
})

describe('the Image toolbar', () => {
  it('shows on hover and hides at rest, staying in the page either way', () => {
    const { container } = renderImageBlock()

    expect(toolbar()).toHaveClass('opacity-0')
    fireEvent.mouseEnter(wrapper(container))
    expect(toolbar()).toHaveClass('opacity-100')
    fireEvent.mouseLeave(wrapper(container))
    expect(toolbar()).toHaveClass('opacity-0')
  })

  it('stays while the block is selected', () => {
    renderImageBlock({}, { selected: true })

    expect(toolbar()).toHaveClass('opacity-100')
  })

  it('is not shown read-only', () => {
    const { container } = renderImageBlock({}, { editable: false, selected: true })
    fireEvent.mouseEnter(wrapper(container))

    expect(toolbar()).toHaveClass('opacity-0')
  })

  it('sits inside the corner, and just above it on a picture narrower than 160px', () => {
    let report: ((width: number) => void) | null = null
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: (entries: { contentRect: { width: number } }[]) => void) {
        report = (width) => callback([{ contentRect: { width } }])
      }
      observe() {}
      disconnect() {}
    })
    renderImageBlock()

    act(() => report?.(400))
    expect(toolbar()).toHaveAttribute('data-image-toolbar', 'inside')
    act(() => report?.(120))
    expect(toolbar()).toHaveAttribute('data-image-toolbar', 'above')
  })

  it('asks the surface for the Image preview of the picture', () => {
    const { container } = renderImageBlock()
    const listener = vi.fn()
    const unsubscribe = subscribeImagePreviewRequests(container, listener)

    fireEvent.click(screen.getByTestId('image-toolbar-preview'))

    expect(listener).toHaveBeenCalledWith({ src: ATTACHMENT_URL, alt: 'Chart' })
    unsubscribe()
  })

  it('offers Replace image, Alt text, Open with default app and Delete', () => {
    renderImageBlock()
    openMoreMenu()

    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Replace image',
      'Alt text',
      'Open with default app',
      'Delete',
    ])
  })

  it('names the open item Open in browser for a picture fetched over the web', () => {
    renderImageBlock({ url: 'https://example.com/chart.png' })
    openMoreMenu()

    expect(screen.getByRole('menuitem', { name: 'Open in browser' })).toBeInTheDocument()
  })

  it('opens the Upload / Embed panel to replace the picture, once the menu has let go of the focus', async () => {
    renderImageBlock()
    openMoreMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Replace image' }))

    await waitFor(() => expect(filePanel.showMenu).toHaveBeenCalledWith('image-block'))
  })

  it('asks the surface to open the file, then gives the picture its selection back', async () => {
    const { container, editor } = renderImageBlock()
    const listener = vi.fn()
    const unsubscribe = subscribeImageOpenRequests(container, listener)
    openMoreMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Open with default app' }))

    await waitFor(() => expect(listener).toHaveBeenCalledWith({ url: ATTACHMENT_URL }))
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith('image-block')
    unsubscribe()
  })

  it('deletes the Block alone', async () => {
    const { editor } = renderImageBlock()
    openMoreMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }))

    await waitFor(() => expect(editor.removeBlocks).toHaveBeenCalledWith(['image-block']))
  })

  it('saves the alt text on Enter and drops it on Esc', async () => {
    const { editor } = renderImageBlock()
    openMoreMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Alt text' }))
    const input = await screen.findByTestId('image-alt-text-input')
    expect(input).toHaveValue('Chart')
    fireEvent.change(input, { target: { value: 'Revenue by month' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(editor.updateBlock).toHaveBeenCalledWith('image-block', { props: { name: 'Revenue by month' } })
    expect(screen.queryByTestId('image-alt-text-input')).not.toBeInTheDocument()

    editor.updateBlock.mockClear()
    openMoreMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: 'Alt text' }))
    fireEvent.change(await screen.findByTestId('image-alt-text-input'), { target: { value: 'Dropped' } })
    fireEvent.keyDown(screen.getByTestId('image-alt-text-input'), { key: 'Escape' })

    expect(editor.updateBlock).not.toHaveBeenCalled()
  })
})

describe('the caption', () => {
  function startCaption() {
    fireEvent.click(screen.getByTestId('image-toolbar-caption'))
    return screen.getByTestId('image-caption-input') as HTMLInputElement
  }

  it('is typed in place and written once, when Enter ends the edit', () => {
    const { editor } = renderImageBlock()
    const input = startCaption()
    expect(input).not.toHaveClass('hidden')
    expect(input).toHaveAttribute('placeholder', 'Add a caption…')

    fireEvent.change(input, { target: { value: 'Q' } })
    fireEvent.change(input, { target: { value: 'Q3 revenue' } })
    expect(editor.updateBlock).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'Enter' })
    fireEvent.blur(input)

    expect(editor.updateBlock).toHaveBeenCalledTimes(1)
    expect(editor.updateBlock).toHaveBeenCalledWith('image-block', { props: { caption: 'Q3 revenue' } })
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith('image-block')
  })

  it('keeps what was typed on Esc, and on a click away', () => {
    const { editor } = renderImageBlock()
    let input = startCaption()
    fireEvent.change(input, { target: { value: 'Kept on Esc' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(editor.updateBlock).toHaveBeenLastCalledWith('image-block', { props: { caption: 'Kept on Esc' } })

    input = startCaption()
    fireEvent.change(input, { target: { value: 'Kept on blur' } })
    fireEvent.blur(input)
    expect(editor.updateBlock).toHaveBeenLastCalledWith('image-block', { props: { caption: 'Kept on blur' } })
  })

  it('puts the caret at the end of a caption the block already has', () => {
    renderImageBlock({ caption: 'Existing caption' })
    const input = startCaption()

    expect(input).toHaveValue('Existing caption')
    expect(input.selectionStart).toBe('Existing caption'.length)
  })

  it('removes the line when it is emptied', () => {
    const { editor } = renderImageBlock({ caption: 'Old caption' })
    expect(screen.getByTestId('image-caption')).toHaveTextContent('Old caption')
    const input = startCaption()
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(editor.updateBlock).toHaveBeenCalledWith('image-block', { props: { caption: '' } })
  })

  it('ends when the editor flushes its pending change (a Tab switch, ⌘S, quitting)', () => {
    const { editor } = renderImageBlock()
    const input = startCaption()
    fireEvent.change(input, { target: { value: 'Typed before the switch' } })

    act(() => endOpenBlockEdits(editor))

    expect(editor.updateBlock).toHaveBeenCalledWith('image-block', { props: { caption: 'Typed before the switch' } })
    expect(input).toHaveClass('hidden')
  })

  it('takes a pasted line break as a space', () => {
    const { editor } = renderImageBlock()
    const input = startCaption()
    fireEvent.paste(input, { clipboardData: { getData: () => 'first\nsecond' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(editor.updateBlock).toHaveBeenCalledWith('image-block', { props: { caption: 'first second' } })
  })

  it('is one trimmed line', () => {
    expect(normalizeImageCaption('  one\r\n  two \n')).toBe('one two')
  })
})

describe('a picture that fails to load', () => {
  it('shows a placeholder with the file name, no resize handles, and Preview image disabled', () => {
    const { container } = renderImageBlock({ previewWidth: 320 })
    fireEvent.error(container.querySelector('img') as HTMLImageElement)
    fireEvent.mouseEnter(wrapper(container))

    expect(screen.getByTestId('image-placeholder')).toHaveTextContent('chart one.png')
    expect(container.querySelector('img')).toBeNull()
    for (const handle of container.querySelectorAll('[data-image-resize-handle]')) {
      expect(handle).toHaveClass('invisible')
    }
    expect(screen.getByTestId('image-toolbar-preview')).toBeDisabled()
    expect(screen.getByTestId('image-toolbar-caption')).toBeEnabled()
    expect(wrapper(container).style.width).toBe('320px')
  })

  it('loads again when the Folder watcher reports its file back', () => {
    const { container } = renderImageBlock()
    fireEvent.error(container.querySelector('img') as HTMLImageElement)

    act(() => dispatchFolderFilesChanged(['/vault/notes/other.md']))
    expect(screen.getByTestId('image-placeholder')).toBeInTheDocument()

    act(() => dispatchFolderFilesChanged(['/vault/attachments/chart one.png']))
    const image = container.querySelector('img') as HTMLImageElement
    expect(image).not.toBeNull()
    expect(image.getAttribute('src')).toBe(`${ATTACHMENT_URL}?plumo-reload=1`)
  })
})

describe('resizing', () => {
  it('moves both edges and stores whole pixels on release', () => {
    const { container, editor } = renderImageBlock({ previewWidth: 300 })
    const frame = container.querySelector('.bn-visual-media-wrapper') as HTMLElement
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ width: 300 } as DOMRect)
    fireEvent.mouseEnter(wrapper(container))
    const handle = container.querySelector('[data-image-resize-handle="right"]') as HTMLElement
    expect(handle).not.toHaveClass('invisible')

    fireEvent.mouseDown(handle, { clientX: 500 })
    fireEvent.mouseMove(window, { clientX: 520.3 })
    expect(toolbar()).toHaveClass('opacity-0')
    expect(Number.parseFloat(wrapper(container).style.width)).toBeCloseTo(340.6)
    fireEvent.mouseUp(window)

    expect(editor.updateBlock).toHaveBeenCalledWith('image-block', { props: { previewWidth: 341 } })
  })
})

describe('Image block helpers', () => {
  it('knows a node selection of the block, by its container or its content', () => {
    expect(isBlockNodeSelected({ node: { attrs: { id: 'a' } } }, 'a')).toBe(true)
    expect(isBlockNodeSelected({ node: { attrs: {} }, $from: { parent: { attrs: { id: 'a' } } } }, 'a')).toBe(true)
    expect(isBlockNodeSelected({ node: { attrs: { id: 'b' } } }, 'a')).toBe(false)
    expect(isBlockNodeSelected({ from: 1, to: 4 }, 'a')).toBe(false)
  })

  it('names a picture by the last part of its URL', () => {
    expect(imageFileName(ATTACHMENT_URL, 'Chart')).toBe('chart one.png')
    expect(imageFileName('https://example.com/a/b.png?x=1', 'B')).toBe('b.png')
    expect(imageFileName('', 'Fallback')).toBe('Fallback')
  })

  it('looks again for a change to the file, a folder above it, or an unknown change', () => {
    expect(folderChangeTouches('/vault/attachments/a.png', ['/vault/attachments/a.png'])).toBe(true)
    expect(folderChangeTouches('/vault/attachments/a.png', ['/vault/attachments'])).toBe(true)
    expect(folderChangeTouches('/vault/attachments/a.png', [])).toBe(true)
    expect(folderChangeTouches('/vault/attachments/a.png', ['/vault/attach'])).toBe(false)
  })
})

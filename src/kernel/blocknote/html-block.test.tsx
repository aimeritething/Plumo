import { fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/ui/tooltip'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_COMMAND_EVENT_NAME, APP_COMMAND_IDS } from '@/shell/app-command-dispatcher'
import { HTML_BLOCK_DEFAULT_HEIGHT, HTML_BLOCK_TYPE, type HtmlBlockScripts } from '@/kernel/markdown/html-block-markdown'
import { HtmlBlock, type HtmlBlockEditor, type HtmlBlockProps } from './html-block'

vi.mock('@/platform/clipboard-text', () => ({
  writeClipboardText: vi.fn().mockResolvedValue(undefined),
}))

type HtmlBlockTestProps = Omit<HtmlBlockProps, 'scripts'> & { scripts?: HtmlBlockScripts }

function renderHtmlBlock(initialProps: HtmlBlockTestProps) {
  const liveBlock = {
    id: 'html-block',
    props: { scripts: 'blocked' as const, ...initialProps },
    type: HTML_BLOCK_TYPE,
  }
  const editor: HtmlBlockEditor = {
    domElement: document.createElement('div'),
    focus: vi.fn(),
    getBlock: () => liveBlock,
    updateBlock: vi.fn((blockId, update) => {
      liveBlock.id = blockId
      liveBlock.props = { ...update.props }
      liveBlock.type = update.type
    }),
  }

  const view = render(<HtmlBlock block={liveBlock} editor={editor} />, { wrapper: TooltipProvider })
  return { editor, liveBlock, unmount: view.unmount }
}

function pointer(type: string, init: PointerEventInit & { pointerId?: number }) {
  return new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 1, ...init })
}

function renderResizableHtmlBlock() {
  const rendered = renderHtmlBlock({ height: HTML_BLOCK_DEFAULT_HEIGHT, html: '<p>Resize me</p>' })
  const handle = screen.getByRole('button', { name: 'Resize height' })
  const region = screen.getByRole('region', { name: 'Sandboxed HTML block preview' })
  const frame = screen.getByTitle('Sandboxed HTML block preview')
  return { ...rendered, frame, handle, region }
}

function startResizeAt(handle: HTMLElement, clientY: number) {
  fireEvent(handle, pointer('pointerdown', { button: 0, buttons: 1, clientY }))
}

function moveResizeTo(clientY: number, target: EventTarget = window) {
  fireEvent(target, pointer('pointermove', { buttons: 1, clientY }))
}

describe('HtmlBlock', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not expose inline source editing for empty slash-inserted blocks', () => {
    renderHtmlBlock({ height: HTML_BLOCK_DEFAULT_HEIGHT, html: '' })

    expect(screen.queryByLabelText('HTML source')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Edit source' })).not.toBeInTheDocument()
  })

  it('renders sanitized HTML in an iframe without script or same-origin sandbox permissions', () => {
    renderHtmlBlock({
      height: HTML_BLOCK_DEFAULT_HEIGHT,
      html: '<script>window.parent.evil = true</script><button onclick="evil()">Click</button>',
    })

    const frame = screen.getByTitle('Sandboxed HTML block preview') as HTMLIFrameElement

    expect(frame.getAttribute('sandbox')).toBe('allow-popups allow-popups-to-escape-sandbox')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-scripts')
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin')
    expect(frame.getAttribute('src')).toBeNull()
    expect(frame.srcdoc).not.toContain('<script')
    expect(frame.srcdoc).not.toContain('onclick')
    expect(frame.srcdoc).toContain('<button>Click</button>')
  })

  it('keeps the iframe preview out of keyboard focus ownership', () => {
    const { editor } = renderHtmlBlock({
      height: HTML_BLOCK_DEFAULT_HEIGHT,
      html: '<button>Focusable preview content</button>',
    })

    const frame = screen.getByTitle('Sandboxed HTML block preview') as HTMLIFrameElement

    expect(frame.tabIndex).toBe(-1)

    frame.focus()
    fireEvent.focus(frame)

    expect(editor.focus).toHaveBeenCalled()
    expect(document.activeElement).not.toBe(frame)
  })

  it('exposes the preview container and controls with non-static roles', () => {
    renderHtmlBlock({
      height: HTML_BLOCK_DEFAULT_HEIGHT,
      html: '<p>Preview me</p>',
    })

    expect(screen.getByRole('region', { name: 'Sandboxed HTML block preview' })).toBeTruthy()
    expect(screen.getByRole('toolbar', { name: 'HTML block actions' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Edit source' })).not.toBeInTheDocument()
  })

  it('routes blocked markup fixes to the raw editor instead of inline editing', () => {
    const commands: unknown[] = []
    const recordCommand = (event: Event) => {
      commands.push((event as CustomEvent<unknown>).detail)
    }
    window.addEventListener(APP_COMMAND_EVENT_NAME, recordCommand)

    try {
      renderHtmlBlock({
        height: HTML_BLOCK_DEFAULT_HEIGHT,
        html: '<script>blocked()</script>',
      })

      expect(screen.getByRole('alert')).toHaveTextContent('This HTML was blocked by the sandbox rules.')
      const rawEditorButtons = screen.getAllByRole('button', { name: 'Open raw editor' })
      fireEvent.click(rawEditorButtons.at(-1)!)

      expect(commands).toEqual([APP_COMMAND_IDS.editToggleRawEditor])
      expect(screen.queryByLabelText('HTML source')).not.toBeInTheDocument()
    } finally {
      window.removeEventListener(APP_COMMAND_EVENT_NAME, recordCommand)
    }
  })

  it('persists keyboard height changes through the editor block update path', () => {
    const { editor, liveBlock } = renderHtmlBlock({
      height: HTML_BLOCK_DEFAULT_HEIGHT,
      html: '<p>Resize me</p>',
    })

    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize height' }), { key: 'ArrowDown' })

    expect(editor.updateBlock).toHaveBeenCalledWith('html-block', {
      props: { height: '344', html: '<p>Resize me</p>', scripts: 'blocked' },
      type: HTML_BLOCK_TYPE,
    })
    expect(liveBlock.props.height).toBe('344')
  })

  it('captures the pointer on the handle and lets it pass over the iframe while resizing', () => {
    const setPointerCapture = vi.fn()
    const { frame, handle, region } = renderResizableHtmlBlock()
    handle.setPointerCapture = setPointerCapture

    startResizeAt(handle, 400)
    moveResizeTo(300)

    expect(setPointerCapture).toHaveBeenCalledWith(1)
    expect(frame).toHaveClass('pointer-events-none')
    expect(region).toHaveStyle({ height: '220px' })
  })

  it('ends the resize on a pointer release and stops following the pointer', () => {
    const { editor, frame, handle, region } = renderResizableHtmlBlock()

    startResizeAt(handle, 400)
    moveResizeTo(300)
    fireEvent(handle, pointer('pointerup', { clientY: 290 }))
    moveResizeTo(100)

    expect(editor.updateBlock).toHaveBeenCalledTimes(1)
    expect(editor.updateBlock).toHaveBeenCalledWith('html-block', expect.objectContaining({
      props: expect.objectContaining({ height: '210' }),
    }))
    expect(region).toHaveStyle({ height: '210px' })
    expect(frame).not.toHaveClass('pointer-events-none')
  })

  it('ends the resize when the handle loses pointer capture without a release', () => {
    const { editor, frame, handle, region } = renderResizableHtmlBlock()

    startResizeAt(handle, 400)
    moveResizeTo(300)
    fireEvent(handle, pointer('lostpointercapture', {}))
    moveResizeTo(100)

    expect(editor.updateBlock).toHaveBeenCalledTimes(1)
    expect(region).toHaveStyle({ height: '220px' })
    expect(frame).not.toHaveClass('pointer-events-none')
  })

  it('restores the height a cancelled pointer started from and saves nothing', () => {
    const { editor, frame, handle, region } = renderResizableHtmlBlock()

    startResizeAt(handle, 400)
    moveResizeTo(300)
    fireEvent(window, pointer('pointercancel', {}))
    moveResizeTo(100)

    expect(editor.updateBlock).not.toHaveBeenCalled()
    expect(region).toHaveStyle({ height: `${HTML_BLOCK_DEFAULT_HEIGHT}px` })
    expect(frame).not.toHaveClass('pointer-events-none')
  })

  it('ends the resize when the pointer comes back with no button pressed', () => {
    const { editor, handle, region } = renderResizableHtmlBlock()

    startResizeAt(handle, 400)
    moveResizeTo(300)
    fireEvent(window, pointer('pointermove', { buttons: 0, clientY: 100 }))
    moveResizeTo(50)

    expect(editor.updateBlock).toHaveBeenCalledTimes(1)
    expect(editor.updateBlock).toHaveBeenCalledWith('html-block', expect.objectContaining({
      props: expect.objectContaining({ height: '220' }),
    }))
    expect(region).toHaveStyle({ height: '220px' })
  })

  it('ignores another pointer while one resize is under way', () => {
    const { editor, handle, region } = renderResizableHtmlBlock()

    startResizeAt(handle, 400)
    fireEvent(window, pointer('pointermove', { buttons: 1, clientY: 100, pointerId: 2 }))
    fireEvent(window, pointer('pointerup', { clientY: 100, pointerId: 2 }))
    moveResizeTo(300)

    expect(editor.updateBlock).not.toHaveBeenCalled()
    expect(region).toHaveStyle({ height: '220px' })
  })

  it('removes its pointer listeners when the block unmounts mid-resize', () => {
    const removeListener = vi.spyOn(window, 'removeEventListener')
    const { editor, handle, unmount } = renderResizableHtmlBlock()

    startResizeAt(handle, 400)
    unmount()
    moveResizeTo(300)
    fireEvent(window, pointer('pointerup', { clientY: 300 }))

    const removed = removeListener.mock.calls.map(([type]) => type)
    expect(removed).toEqual(expect.arrayContaining(['pointermove', 'pointerup', 'pointercancel']))
    expect(editor.updateBlock).not.toHaveBeenCalled()
  })
})

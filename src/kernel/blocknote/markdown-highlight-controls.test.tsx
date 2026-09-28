import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/ui/tooltip'
import { BlockNoteEditor } from '@blocknote/core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { schema } from './editor-schema'
import { subscribeRichEditorExternalChange } from './editor-external-change-events'
import {
  injectMarkdownHighlightsInBlocks,
  serializeMarkdownHighlightAwareBlocks,
} from '@/kernel/markdown/markdown-highlight-markdown'
import {
  applyMarkdownHighlightColor,
  mountMarkdownHighlightControls,
  readMarkdownHighlightRange,
  toggleDefaultMarkdownHighlight,
} from './markdown-highlight-controls'
import { HighlightBoundaryColorControl } from './markdown-highlight-boundary-control'
import { ToolbarHighlightColorControl } from './markdown-highlight-toolbar-control'

const { trackEventMock } = vi.hoisted(() => ({
  trackEventMock: vi.fn(),
}))

vi.mock('@/lib/telemetry', () => ({
  trackEvent: trackEventMock,
}))

async function editorFromMarkdown(markdown: string) {
  const editor = BlockNoteEditor.create({ schema })
  const blocks = injectMarkdownHighlightsInBlocks(
    await editor.tryParseMarkdownToBlocks(markdown),
  ) as Parameters<typeof editor.replaceBlocks>[1]
  editor.replaceBlocks(editor.document, blocks)
  return editor
}

function selectText(editor: Awaited<ReturnType<typeof editorFromMarkdown>>, from: number, to = from) {
  editor._tiptapEditor.commands.setTextSelection({ from, to })
}

function textRange(editor: Awaited<ReturnType<typeof editorFromMarkdown>>, text: string) {
  let range: { from: number; to: number } | null = null
  editor.prosemirrorState.doc.descendants((node, position) => {
    if (range || !node.isText) return
    const index = node.text?.indexOf(text) ?? -1
    if (index !== -1) {
      range = { from: position + index, to: position + index + text.length }
    }
  })
  if (!range) throw new Error(`Text not found in editor: ${text}`)
  return range as { from: number; to: number }
}

afterEach(() => {
  document.body.innerHTML = ''
  trackEventMock.mockClear()
  vi.restoreAllMocks()
})

const SCROLL_AREA_BOUNDS = new DOMRect(0, 100, 800, 400)
const mountedEditors: Array<Awaited<ReturnType<typeof editorFromMarkdown>>> = []

// An editor mounted in a scroll area spanning y 100–500, the caret inside the
// highlight, and the highlight's end drawn at `anchorTop`.
async function editorWithCaretInHighlight() {
  const editor = await editorFromMarkdown('Start ==🔴marked== end')
  const scrollArea = document.createElement('div')
  scrollArea.className = 'editor-scroll-area'
  scrollArea.getBoundingClientRect = () => SCROLL_AREA_BOUNDS
  const host = document.createElement('div')
  scrollArea.appendChild(host)
  document.body.appendChild(scrollArea)
  editor.mount(host)
  mountedEditors.push(editor)
  // TipTap finishes initialising on a timer; until then the editor has no domElement.
  await vi.waitFor(() => expect(editor.headless).toBe(false))
  const coordsAtPos = vi.spyOn(editor.prosemirrorView!, 'coordsAtPos')
  const drawAnchorAt = (top: number, right = 60) => {
    coordsAtPos.mockReturnValue({ bottom: top + 16, left: right - 20, right, top })
  }
  drawAnchorAt(200)

  const marked = textRange(editor, 'marked')
  selectText(editor, marked.from + 1)
  editor.prosemirrorView!.focus()
  return { coordsAtPos, drawAnchorAt, editor, scrollArea }
}

// A bar stuck to the top of the scroll area, as the find bar is: y 100–140.
function stickFindBarTo(scrollArea: HTMLElement) {
  const findBar = document.createElement('div')
  findBar.style.position = 'sticky'
  findBar.getBoundingClientRect = () => new DOMRect(0, 100, 800, 40)
  scrollArea.prepend(findBar)
}

function boundaryButton() {
  return screen.queryByRole('button', { name: 'Change highlight color' })
}

// The fixed box the button sits in; the button is 24px square.
function boundaryControlBox() {
  const box = document.querySelector<HTMLElement>('[data-test="highlightBoundaryControl"]')
  if (!box) throw new Error('The boundary control is not shown')
  return { left: parseFloat(box.style.left), top: parseFloat(box.style.top) }
}

describe('Markdown highlight color controls', () => {
  it('finds the complete colored highlight boundary around a collapsed cursor', async () => {
    const editor = await editorFromMarkdown('==🔴red words==')
    const expectedRange = textRange(editor, 'red words')
    selectText(editor, expectedRange.from + 1)

    expect(readMarkdownHighlightRange(editor)).toEqual({
      color: 'red',
      ...expectedRange,
    })
  })

  it('recolors an existing boundary and persists the matching circle prefix', async () => {
    const editor = await editorFromMarkdown('==🔴red words==')
    const expectedRange = textRange(editor, 'red words')
    selectText(editor, expectedRange.from + 1)
    const range = readMarkdownHighlightRange(editor)
    expect(range).not.toBeNull()
    if (!range) throw new Error('Expected a highlight range at the cursor')

    applyMarkdownHighlightColor(editor, 'blue', range, 'cursor')

    expect(serializeMarkdownHighlightAwareBlocks(editor, editor.document)).toBe('==🔵red words==')
    expect(trackEventMock).toHaveBeenCalledWith('markdown_highlight_color_selected', {
      color: 'blue',
      source: 'cursor',
    })
  })

  it('notifies the durable editor pipeline after recoloring a boundary', async () => {
    const editor = await editorFromMarkdown('==🔴red words==')
    const expectedRange = textRange(editor, 'red words')
    selectText(editor, expectedRange.from + 1)
    const onExternalChange = vi.fn()
    const unsubscribe = subscribeRichEditorExternalChange(editor, onExternalChange)

    applyMarkdownHighlightColor(
      editor,
      'blue',
      readMarkdownHighlightRange(editor),
      'cursor',
    )

    expect(onExternalChange).toHaveBeenCalledOnce()
    unsubscribe()
  })

  it('uses yellow for the direct action and removes both marks when toggled off', async () => {
    const editor = await editorFromMarkdown('plain')
    const expectedRange = textRange(editor, 'plain')
    selectText(editor, expectedRange.from, expectedRange.to)

    toggleDefaultMarkdownHighlight(editor)
    expect(serializeMarkdownHighlightAwareBlocks(editor, editor.document)).toBe('==plain==')

    selectText(editor, expectedRange.from, expectedRange.to)
    toggleDefaultMarkdownHighlight(editor)
    expect(serializeMarkdownHighlightAwareBlocks(editor, editor.document)).toBe('plain')
  })

  it('extends a highlight over a selection that only overlaps it, as the bold toggle does', async () => {
    const editor = await editorFromMarkdown('Start ==marked== end')
    const start = textRange(editor, 'art ')
    const marked = textRange(editor, 'marked')
    selectText(editor, start.from, marked.from + 3)

    toggleDefaultMarkdownHighlight(editor)
    expect(serializeMarkdownHighlightAwareBlocks(editor, editor.document)).toBe('St==art marked== end')
  })

  it('removes a highlight from a selection that lies entirely inside one', async () => {
    const editor = await editorFromMarkdown('Start ==marked== end')
    const marked = textRange(editor, 'marked')
    selectText(editor, marked.from + 1, marked.to - 1)

    toggleDefaultMarkdownHighlight(editor)
    expect(serializeMarkdownHighlightAwareBlocks(editor, editor.document)).toBe('Start ==m==arke==d== end')
  })

  it('removes the whole highlight from a collapsed cursor at its start without recolouring it', async () => {
    const editor = await editorFromMarkdown('Start ==🟢marked== end')
    const marked = textRange(editor, 'marked')
    selectText(editor, marked.from)

    toggleDefaultMarkdownHighlight(editor)
    expect(serializeMarkdownHighlightAwareBlocks(editor, editor.document)).toBe('Start marked end')
  })

  it('renders the toolbar colour caret and applies the chosen colour to the selection', async () => {
    const editor = await editorFromMarkdown('Start marked end')
    const marked = textRange(editor, 'marked')
    selectText(editor, marked.from, marked.to)

    render(<ToolbarHighlightColorControl editor={editor} locale="en" />, { wrapper: TooltipProvider })

    const caret = screen.getByRole('button', { name: 'Choose highlight color' })
    fireEvent.pointerDown(caret)
    fireEvent.click(caret)
    fireEvent.click(screen.getByRole('menuitem', { name: 'Red' }))

    expect(serializeMarkdownHighlightAwareBlocks(editor, editor.document)).toBe('Start ==🔴marked== end')
    expect(trackEventMock).toHaveBeenCalledWith('markdown_highlight_color_selected', {
      color: 'red',
      source: 'toolbar',
    })
  })

  it('mounts the boundary control in its own root and removes it when the editor unmounts', async () => {
    const editor = await editorFromMarkdown('plain')
    const editorDom = document.createElement('div')
    document.body.appendChild(editorDom)
    const controller = new AbortController()

    await act(async () => {
      mountMarkdownHighlightControls({ dom: editorDom, editor, signal: controller.signal })
    })
    expect(document.querySelector('[data-test="highlightBoundaryControlHost"]')).not.toBeNull()

    await act(async () => controller.abort())
    expect(document.querySelector('[data-test="highlightBoundaryControlHost"]')).toBeNull()
  })
})

describe('the highlight boundary colour button', () => {
  // Unmount before the body is cleared: the colour menu is portaled into it.
  afterEach(() => {
    cleanup()
    for (const editor of mountedEditors.splice(0)) editor._tiptapEditor.destroy()
  })

  it('shows by a highlight the focused caret sits in', async () => {
    const { editor } = await editorWithCaretInHighlight()

    render(<HighlightBoundaryColorControl editor={editor} />, { wrapper: TooltipProvider })

    expect(boundaryButton()).not.toBeNull()
  })

  it('sits just above the highlight\'s end, centred on it, clear of its line', async () => {
    const { editor } = await editorWithCaretInHighlight()

    render(<HighlightBoundaryColorControl editor={editor} />, { wrapper: TooltipProvider })

    // The end's line box is y 200–216 and its end x 60: the button's 24px end 4px above.
    expect(boundaryControlBox()).toEqual({ left: 48, top: 172 })
  })

  it('goes just below the line when there is no room above it in the scroll area', async () => {
    const { drawAnchorAt, editor, scrollArea } = await editorWithCaretInHighlight()
    render(<HighlightBoundaryColorControl editor={editor} />, { wrapper: TooltipProvider })

    drawAnchorAt(110)
    fireEvent.scroll(scrollArea)

    expect(boundaryControlBox()).toEqual({ left: 48, top: 130 })
  })

  it('goes below the line rather than over a find bar stuck to the scroll area\'s top', async () => {
    const { drawAnchorAt, editor, scrollArea } = await editorWithCaretInHighlight()
    stickFindBarTo(scrollArea)
    render(<HighlightBoundaryColorControl editor={editor} />, { wrapper: TooltipProvider })

    drawAnchorAt(150)
    fireEvent.scroll(scrollArea)

    expect(boundaryControlBox()).toEqual({ left: 48, top: 170 })
  })

  it('stays within the scroll area\'s left and right edges', async () => {
    const { drawAnchorAt, editor, scrollArea } = await editorWithCaretInHighlight()
    render(<HighlightBoundaryColorControl editor={editor} />, { wrapper: TooltipProvider })

    drawAnchorAt(200, 795)
    fireEvent.scroll(scrollArea)
    expect(boundaryControlBox()).toEqual({ left: 776, top: 172 })

    drawAnchorAt(200, 4)
    fireEvent.scroll(scrollArea)
    expect(boundaryControlBox()).toEqual({ left: 0, top: 172 })
  })

  it('keeps to the line of the highlight\'s last character when the line wraps at its end', async () => {
    const { coordsAtPos, editor } = await editorWithCaretInHighlight()
    // After the end (side 1) is the next line's start; before it (side -1), the last character.
    coordsAtPos.mockImplementation((_position, side) => (
      side === -1
        ? { bottom: 216, left: 300, right: 300, top: 200 }
        : { bottom: 236, left: 0, right: 0, top: 220 }
    ))

    render(<HighlightBoundaryColorControl editor={editor} />, { wrapper: TooltipProvider })

    expect(boundaryControlBox()).toEqual({ left: 288, top: 172 })
  })

  it('hides while the highlight is scrolled outside the editor, and comes back with it', async () => {
    const { drawAnchorAt, editor, scrollArea } = await editorWithCaretInHighlight()
    render(<HighlightBoundaryColorControl editor={editor} />, { wrapper: TooltipProvider })

    drawAnchorAt(60)
    fireEvent.scroll(scrollArea)
    expect(boundaryButton()).toBeNull()

    drawAnchorAt(495)
    fireEvent.scroll(scrollArea)
    expect(boundaryButton()).toBeNull()

    drawAnchorAt(300)
    fireEvent.scroll(scrollArea)
    expect(boundaryButton()).not.toBeNull()
  })

  it('hides while the highlight\'s end is under a find bar stuck to the scroll area\'s top', async () => {
    const { drawAnchorAt, editor, scrollArea } = await editorWithCaretInHighlight()
    stickFindBarTo(scrollArea)
    render(<HighlightBoundaryColorControl editor={editor} />, { wrapper: TooltipProvider })

    drawAnchorAt(120)
    fireEvent.scroll(scrollArea)

    expect(boundaryButton()).toBeNull()
  })

  it('hides when the editor loses the focus', async () => {
    const { editor } = await editorWithCaretInHighlight()
    const elsewhere = document.createElement('button')
    document.body.appendChild(elsewhere)
    render(<HighlightBoundaryColorControl editor={editor} />, { wrapper: TooltipProvider })

    act(() => elsewhere.focus())

    expect(boundaryButton()).toBeNull()
  })

  it('stays while the focus moves into the button and its colour menu', async () => {
    const { editor } = await editorWithCaretInHighlight()
    render(<HighlightBoundaryColorControl editor={editor} />, { wrapper: TooltipProvider })

    const button = boundaryButton()!
    act(() => button.focus())
    expect(boundaryButton()).not.toBeNull()

    fireEvent.pointerDown(button)
    fireEvent.click(button)
    const red = screen.getByRole('menuitem', { name: 'Red' })
    act(() => red.focus())

    expect(boundaryButton()).not.toBeNull()
  })
})

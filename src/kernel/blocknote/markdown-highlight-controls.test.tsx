import { act, fireEvent, render, screen } from '@testing-library/react'
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
})

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

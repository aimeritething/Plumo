import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  buildCodeMirrorRestoreState,
  captureRawEditorPositionSnapshot,
  captureRichEditorPositionSnapshot,
  focusPropertyAtLine,
  restoreBlockNoteView,
  restoreCodeMirrorView,
  type BlockNotePositionEditor,
  type CodeMirrorViewLike,
} from './editor-mode-position'

interface MockBlock {
  id: string
  markdown: string
  content?: unknown
}

const content = '---\ntitle: Demo\n---\n# Title\n\nParagraph one\n\n## Tail'
const blocks: MockBlock[] = [
  { id: 'title', markdown: '# Title', content: [] },
  { id: 'details', markdown: 'Paragraph one', content: [] },
  { id: 'tail', markdown: '## Tail', content: [] },
]

function makeEditor(blocks: MockBlock[]): BlockNotePositionEditor {
  let selectedBlocks: MockBlock[] | undefined
  const cursorBlock = blocks[0]

  return {
    document: blocks,
    getSelection: () => selectedBlocks ? { blocks: selectedBlocks } : undefined,
    getTextCursorPosition: () => ({ block: cursorBlock }),
    blocksToMarkdownLossy: (items: unknown[]) => (items as MockBlock[]).map(item => item.markdown).join('\n\n'),
    setSelection: vi.fn(),
    setTextCursorPosition: vi.fn(),
    focus: vi.fn(),
  }
}

function installRawView(view: CodeMirrorViewLike) {
  const host = document.createElement('div')
  host.setAttribute('data-testid', 'raw-editor-codemirror')
  Object.assign(host, { __cmView: view })
  document.body.appendChild(host)
  return host
}

function captureAndRestoreRawSelection(
  selection: { anchor: number; head: number },
) {
  const editor = makeEditor(blocks)
  const view: CodeMirrorViewLike = {
    state: {
      doc: { toString: () => content },
      selection: { main: selection },
    },
    scrollDOM: { scrollTop: 48 },
    dispatch: vi.fn(),
    focus: vi.fn(),
  }

  installRawView(view)
  const snapshot = captureRawEditorPositionSnapshot(document)

  return {
    editor,
    restored: restoreBlockNoteView(editor, snapshot!, document),
  }
}

describe('editorModePosition', () => {
  beforeEach(() => {
    const scrollHost = document.createElement('div')
    scrollHost.className = 'editor-scroll-area'
    scrollHost.scrollTop = 128
    document.body.appendChild(scrollHost)
    const detailBlock = document.createElement('div')
    detailBlock.setAttribute('data-id', 'details')
    detailBlock.scrollIntoView = vi.fn()
    document.body.appendChild(detailBlock)
    const tailBlock = document.createElement('div')
    tailBlock.setAttribute('data-id', 'tail')
    tailBlock.scrollIntoView = vi.fn()
    document.body.appendChild(tailBlock)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('maps the current BlockNote block to a raw-editor cursor at the end of its line', () => {
    const editor = makeEditor(blocks)
    editor.getTextCursorPosition = () => ({ block: blocks[1] })

    const snapshot = captureRichEditorPositionSnapshot(editor)
    expect(snapshot).toEqual({
      anchorBlockIndex: 1,
      headBlockIndex: 1,
      cursorBlockId: 'details',
      tableRowIndex: null,
    })

    const restoreState = buildCodeMirrorRestoreState(editor, content, snapshot!)
    const lineEnd = content.indexOf('Paragraph one') + 'Paragraph one'.length
    // A cursor, not the block selected: typing after the switch replaces nothing.
    expect(restoreState).toEqual({ anchor: lineEnd, head: lineEnd })
  })

  it('ignores stale BlockNote cursor positions that no longer have a block', () => {
    const editor = makeEditor(blocks)
    editor.getTextCursorPosition = () => (
      { block: undefined } as unknown as ReturnType<NonNullable<BlockNotePositionEditor['getTextCursorPosition']>>
    )

    expect(captureRichEditorPositionSnapshot(editor)).toBeNull()
  })

  it('restores a raw-editor selection and the scroll position read off the same Raw view', () => {
    const dispatch = vi.fn()
    const focus = vi.fn()
    const view: CodeMirrorViewLike = {
      state: {
        doc: { toString: () => content },
        selection: { main: { anchor: 0, head: 0 } },
      },
      scrollDOM: { scrollTop: 0 },
      dispatch,
      focus,
    }
    installRawView(view)

    const restored = restoreCodeMirrorView(document, {
      anchor: 10,
      head: 21,
      scrollTop: 96,
    })

    expect(restored).toBe(true)
    expect(dispatch).toHaveBeenCalledWith({ selection: { anchor: 10, head: 21 } })
    expect(view.scrollDOM.scrollTop).toBe(96)
    expect(focus).toHaveBeenCalled()
  })

  it('brings a raw-editor cursor that is out of sight to the middle of the view', () => {
    const dispatch = vi.fn()
    const view: CodeMirrorViewLike = {
      state: { doc: { toString: () => content }, selection: { main: { anchor: 0, head: 0 } } },
      scrollDOM: { scrollTop: 0, getBoundingClientRect: () => ({ top: 0, bottom: 400 }) },
      // CodeMirror has not drawn a position this far down.
      coordsAtPos: () => null,
      dispatch,
      focus: vi.fn(),
    }
    installRawView(view)

    expect(restoreCodeMirrorView(document, { anchor: 30, head: 30 })).toBe(true)

    expect(dispatch).toHaveBeenCalledWith({ selection: { anchor: 30, head: 30 }, effects: expect.anything() })
    expect(view.scrollDOM.scrollTop).toBe(0)
  })

  it('leaves the Raw view where it is when the cursor is already in sight', () => {
    const dispatch = vi.fn()
    const view: CodeMirrorViewLike = {
      state: { doc: { toString: () => content }, selection: { main: { anchor: 0, head: 0 } } },
      scrollDOM: { scrollTop: 0, getBoundingClientRect: () => ({ top: 0, bottom: 400 }) },
      coordsAtPos: () => ({ top: 120, bottom: 140 }),
      dispatch,
      focus: vi.fn(),
    }
    installRawView(view)

    expect(restoreCodeMirrorView(document, { anchor: 30, head: 30 })).toBe(true)

    expect(dispatch).toHaveBeenCalledWith({ selection: { anchor: 30, head: 30 } })
  })

  it('clamps stale raw-editor restore selections to the current document', () => {
    const shortContent = '# Short'
    const dispatch = vi.fn((spec: { selection: { anchor: number; head: number } }) => {
      if (spec.selection.anchor > shortContent.length || spec.selection.head > shortContent.length) {
        throw new RangeError('Selection points outside of document')
      }
    })
    const view: CodeMirrorViewLike = {
      state: {
        doc: { toString: () => shortContent },
        selection: { main: { anchor: 0, head: 0 } },
      },
      scrollDOM: { scrollTop: 0 },
      dispatch,
      focus: vi.fn(),
    }
    installRawView(view)

    const restored = restoreCodeMirrorView(document, {
      anchor: 500,
      head: 800,
      scrollTop: 12,
    })

    expect(restored).toBe(true)
    expect(dispatch).toHaveBeenCalledWith({
      selection: {
        anchor: shortContent.length,
        head: shortContent.length,
      },
    })
    expect(view.scrollDOM.scrollTop).toBe(12)
  })

  it('maps a raw-editor cursor back to the nearest BlockNote block', () => {
    const paragraphOffset = content.indexOf('Paragraph one') + 5
    const { editor, restored } = captureAndRestoreRawSelection({
      anchor: paragraphOffset,
      head: paragraphOffset,
    })

    expect(restored).toBe(true)
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith('details', 'end')
    expect(editor.focus).toHaveBeenCalled()
  })

  it.each([
    ['above the view', { top: -300, bottom: -280 }, 1],
    ['below the view', { top: 900, bottom: 920 }, 1],
    ['in sight', { top: 100, bottom: 120 }, 0],
  ])('scrolls the Rich view only when the cursor\'s block is out of sight: %s', (_, box, scrolls) => {
    const scroller = document.querySelector('.editor-scroll-area')!
    scroller.getBoundingClientRect = () => ({ top: 0, bottom: 600, height: 600 }) as DOMRect
    const block = document.querySelector<HTMLElement>('[data-id="details"]')!
    block.getBoundingClientRect = () => ({ ...box, height: box.bottom - box.top }) as DOMRect

    const paragraphOffset = content.indexOf('Paragraph one') + 5
    captureAndRestoreRawSelection({ anchor: paragraphOffset, head: paragraphOffset })

    expect(block.scrollIntoView).toHaveBeenCalledTimes(scrolls)
    if (scrolls) expect(block.scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
  })

  it('restores a multi-block raw selection back into a BlockNote block range', () => {
    const startOffset = content.indexOf('# Title')
    const endOffset = content.indexOf('## Tail') + '## Tail'.length
    const { editor, restored } = captureAndRestoreRawSelection({
      anchor: startOffset,
      head: endOffset,
    })

    expect(restored).toBe(true)
    expect(editor.setSelection).toHaveBeenCalledWith('title', 'tail')
    expect(editor.focus).toHaveBeenCalled()
  })

  it('falls back to the nearest content block when raw restore lands on media', () => {
    const contentWithMedia = '---\ntitle: Demo\n---\n# Title\n\n![media](media.png)\n\nParagraph tail'
    const mediaBlocks: MockBlock[] = [
      { id: 'title', markdown: '# Title', content: [] },
      { id: 'image', markdown: '![media](media.png)' },
      { id: 'tail', markdown: 'Paragraph tail', content: [] },
    ]
    const editor = makeEditor(mediaBlocks)
    const view: CodeMirrorViewLike = {
      state: {
        doc: { toString: () => contentWithMedia },
        selection: {
          main: {
            anchor: contentWithMedia.indexOf('![media]') + 3,
            head: contentWithMedia.indexOf('![media]') + 3,
          },
        },
      },
      scrollDOM: { scrollTop: 48 },
      dispatch: vi.fn(),
      focus: vi.fn(),
    }

    installRawView(view)
    const snapshot = captureRawEditorPositionSnapshot(document)
    const restored = restoreBlockNoteView(editor, snapshot!, document)

    expect(restored).toBe(true)
    expect(editor.setTextCursorPosition).toHaveBeenCalledWith('tail', 'end')
    expect(editor.focus).toHaveBeenCalled()
  })
})

describe('focusPropertyAtLine', () => {
  // A block of: --- (0) / title (1) / # note (2) / summary: | (3) / two lines (4, 5) / blank (6) / tags (7) / --- (8).
  function mountProperties() {
    const root = document.createElement('div')
    root.innerHTML = [
      '<div data-property-key="title" data-property-line="1" data-property-end-line="1"><input data-property-value="" aria-label="title"></div>',
      '<div data-property-key="summary" data-property-line="3" data-property-end-line="5"><textarea data-property-value="" aria-label="summary"></textarea></div>',
      '<div data-property-key="tags" data-property-line="7" data-property-end-line="7"><input data-property-value="" aria-label="tags"></div>',
    ].join('')
    document.body.appendChild(root)
    return () => root.remove()
  }

  it('focuses the value of the Property whose lines hold the caret', () => {
    const unmount = mountProperties()
    try {
      expect(focusPropertyAtLine(document, 1)).toBe(true)
      expect(document.activeElement?.getAttribute('aria-label')).toBe('title')
      expect(focusPropertyAtLine(document, 5)).toBe(true)
      expect(document.activeElement?.getAttribute('aria-label')).toBe('summary')
    } finally {
      unmount()
    }
  })

  it('focuses no Property for a caret on a --- line, or on a comment or blank line between Properties', () => {
    const unmount = mountProperties()
    try {
      for (const line of [0, 2, 6, 8]) {
        ;(document.activeElement as HTMLElement | null)?.blur()
        expect(focusPropertyAtLine(document, line), `line ${line}`).toBe(false)
        expect(document.activeElement).toBe(document.body)
      }
    } finally {
      unmount()
    }
  })
})

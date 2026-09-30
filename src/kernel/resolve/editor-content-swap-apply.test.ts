import { BlockNoteEditor } from '@blocknote/core'
import { undoDepth } from '@tiptap/pm/history'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { trackEvent } from '@/lib/telemetry'
import { schema } from '@/kernel/blocknote/editor-schema'
import {
  applyBlocksToEditor,
  applyBlocksToEditorProgressively,
  PROGRESSIVE_BLOCK_APPLY_CHUNK_SIZE,
  PROGRESSIVE_BLOCK_APPLY_THRESHOLD,
  PROGRESSIVE_INITIAL_BLOCK_APPLY_CHUNK_SIZE,
} from './editor-content-swap-apply'
import { readEditorSelection } from './editor-tiptap-selection'

vi.mock('@/lib/telemetry', () => ({
  trackEvent: vi.fn(),
}))

function makeFrameRef<T>(current: T) {
  return { current }
}

interface MockEditorOptions {
  replaceError?: Error
  replaceResult?: (next: unknown[]) => unknown[]
}

function makeEditor(options: MockEditorOptions = {}) {
  const {
    replaceError,
    replaceResult = next => next,
  } = options
  let documentBlocks: unknown[] = [{ id: 'current-block', type: 'paragraph', content: [], children: [] }]
  const transaction = {
    setMeta: vi.fn().mockReturnThis(),
  }
  const contentChain = {
    run: vi.fn(() => true),
    setContent: vi.fn().mockReturnThis(),
    setMeta: vi.fn().mockReturnThis(),
  }
  return {
    isEditable: true,
    get document() {
      return documentBlocks
    },
    replaceBlocks: vi.fn((_current: unknown[], next: unknown[]) => {
      if (replaceError) throw replaceError
      documentBlocks = replaceResult(next)
    }),
    insertBlocks: vi.fn((next: unknown[]) => {
      documentBlocks = [...documentBlocks, ...next]
      return next
    }),
    blocksToHTMLLossy: vi.fn(() => '<p>Recovered content</p>'),
    transact: vi.fn((callback: (nextTransaction: typeof transaction) => unknown) => callback(transaction)),
    _tiptapEditor: {
      state: { doc: { content: { size: 4 } } },
      chain: vi.fn(() => contentChain),
      commands: {
        setTextSelection: vi.fn(),
      },
    },
  }
}

function makeBlocks(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `block-${index}`,
    type: 'paragraph',
    content: [{ type: 'text', text: `Block ${index}`, styles: {} }],
    children: [],
  }))
}

function makeNumberedListBlocks(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `list-item-${index}`,
    type: 'numberedListItem',
    content: [{ type: 'text', text: `Item ${index + 1}`, styles: {} }],
    children: [],
  }))
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

describe('applyBlocksToEditor', () => {
  it('keeps repeated programmatic note replacements out of the user undo history', () => {
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const editor = BlockNoteEditor.create({
      initialContent: [{ id: 'previous', type: 'paragraph', content: 'Previous note' }],
      schema,
    })
    editor.mount(mount)

    try {
      for (let index = 0; index < 120; index += 1) {
        expect(applyBlocksToEditor({
          blocks: [{ id: `next-${index}`, type: 'paragraph', content: `Next note ${index}` }],
          editor,
          editorContentPathRef: makeFrameRef<string | null>(null),
          scrollTop: 0,
          suppressChangeRef: makeFrameRef(false),
          targetPath: `next-${index}.md`,
        })).toBe(true)
      }

      expect(editor.document[0]?.content).toEqual([
        expect.objectContaining({ text: 'Next note 119' }),
      ])
      expect(undoDepth(editor._tiptapEditor.state)).toBe(0)
      expect(editor.undo()).toBe(false)

      const activeBlock = editor.document[0]
      if (!activeBlock) throw new Error('Expected the replacement note block')
      editor.updateBlock(activeBlock, { content: 'User edit' })
      expect(undoDepth(editor._tiptapEditor.state)).toBe(1)
      expect(editor.undo()).toBe(true)
      expect(editor.document[0]?.content).toEqual([
        expect.objectContaining({ text: 'Next note 119' }),
      ])
    } finally {
      editor.unmount()
      mount.remove()
    }
  })

  it('recovers stale BlockNote block references without reporting a note-open swap error', () => {
    const staleBlockError = new Error('Block with ID 49c0b2e9-3c7e-47a6-954a-da98714f7ed0 not found')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const editor = makeEditor({ replaceError: staleBlockError })
    const nextBlocks = [{ id: 'next-block', type: 'paragraph', content: [], children: [] }]

    const applied = applyBlocksToEditor({
      blocks: nextBlocks,
      editor: editor as never,
      editorContentPathRef: makeFrameRef<string | null>(null),
      scrollTop: 0,
      suppressChangeRef: makeFrameRef(false),
      targetPath: 'next.md',
    })

    expect(applied).toBe(true)
    expect(consoleError).not.toHaveBeenCalled()
    expect(consoleWarn).toHaveBeenCalledWith(
      '[editor] Recovered rich-editor content swap:',
      staleBlockError,
    )
    expect(trackEvent).toHaveBeenCalledWith('rich_editor_transform_error_recovered', {
      reason: 'stale_block_reference',
    })
    expect(editor.blocksToHTMLLossy).toHaveBeenCalledWith(nextBlocks)
    expect(editor._tiptapEditor.chain).toHaveBeenCalledOnce()
    expect(editor._tiptapEditor.chain().setContent).toHaveBeenCalledOnce()
    expect(editor._tiptapEditor.chain().setMeta).toHaveBeenCalledWith('addToHistory', false)
    expect(editor._tiptapEditor.chain().run).toHaveBeenCalledOnce()
  })

  it('mounts large documents progressively while keeping the editor locked until commit', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    vi.spyOn(document, 'querySelector').mockReturnValue({ scrollTop: 0 } as unknown as Element)
    const editor = makeEditor()
    const blocks = makeBlocks(PROGRESSIVE_BLOCK_APPLY_THRESHOLD + PROGRESSIVE_BLOCK_APPLY_CHUNK_SIZE)
    const suppressChangeRef = makeFrameRef(false)
    const editorContentPathRef = makeFrameRef<string | null>(null)

    const applied = await applyBlocksToEditorProgressively({
      blocks,
      editor: editor as never,
      editorContentPathRef,
      scrollTop: 42,
      suppressChangeRef,
      targetPath: 'large.md',
    })

    expect(applied).toBe(true)
    expect(editor.replaceBlocks).toHaveBeenCalledTimes(1)
    expect(editor.replaceBlocks).toHaveBeenCalledWith(
      expect.any(Array),
      blocks.slice(0, PROGRESSIVE_INITIAL_BLOCK_APPLY_CHUNK_SIZE),
    )
    expect(editor.insertBlocks).toHaveBeenCalledTimes(
      Math.ceil(
        (blocks.length - PROGRESSIVE_INITIAL_BLOCK_APPLY_CHUNK_SIZE)
          / PROGRESSIVE_BLOCK_APPLY_CHUNK_SIZE,
      ),
    )
    expect(editor.document).toHaveLength(blocks.length)
    expect(editor.isEditable).toBe(true)
    expect(suppressChangeRef.current).toBe(false)
    expect(editorContentPathRef.current).toBe('large.md')
  })

  it('keeps one long ordered list in a single editor mutation so numbering stays continuous', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    const editor = makeEditor()
    const blocks = makeNumberedListBlocks(PROGRESSIVE_BLOCK_APPLY_THRESHOLD + 80)

    const applied = await applyBlocksToEditorProgressively({
      blocks,
      editor: editor as never,
      editorContentPathRef: makeFrameRef<string | null>(null),
      scrollTop: 0,
      suppressChangeRef: makeFrameRef(false),
      targetPath: 'long-ordered-list.md',
    })

    expect(applied).toBe(true)
    expect(editor.replaceBlocks).toHaveBeenCalledWith(expect.any(Array), blocks)
    expect(editor.insertBlocks).not.toHaveBeenCalled()
    expect(editor.document).toEqual(blocks)
  })

  it('falls back to whole-document HTML if progressive append loses its insertion reference', async () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0)
      return 1
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const editor = makeEditor({ replaceResult: () => [] })
    const blocks = makeBlocks(PROGRESSIVE_BLOCK_APPLY_THRESHOLD + PROGRESSIVE_BLOCK_APPLY_CHUNK_SIZE)
    const suppressChangeRef = makeFrameRef(false)
    const editorContentPathRef = makeFrameRef<string | null>(null)

    const applied = await applyBlocksToEditorProgressively({
      blocks,
      editor: editor as never,
      editorContentPathRef,
      scrollTop: 0,
      suppressChangeRef,
      targetPath: 'large.md',
    })

    expect(applied).toBe(true)
    expect(editor.insertBlocks).not.toHaveBeenCalled()
    expect(editor.blocksToHTMLLossy).toHaveBeenCalledWith(blocks)
    expect(editor._tiptapEditor.chain().setContent).toHaveBeenCalledOnce()
    expect(editor._tiptapEditor.chain().setMeta).toHaveBeenCalledWith('addToHistory', false)
    expect(editor.isEditable).toBe(true)
    expect(suppressChangeRef.current).toBe(false)
    expect(editorContentPathRef.current).toBe('large.md')
  })

  it('aborts progressive application between chunks without committing the partial document', async () => {
    let frameCount = 0
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameCount += 1
      callback(frameCount)
      return frameCount
    })
    const editor = makeEditor()
    const blocks = makeBlocks(PROGRESSIVE_BLOCK_APPLY_THRESHOLD + PROGRESSIVE_BLOCK_APPLY_CHUNK_SIZE)
    const suppressChangeRef = makeFrameRef(false)
    const editorContentPathRef = makeFrameRef<string | null>(null)

    const applied = await applyBlocksToEditorProgressively({
      blocks,
      editor: editor as never,
      editorContentPathRef,
      scrollTop: 0,
      suppressChangeRef,
      targetPath: 'aborted.md',
      shouldAbort: () => true,
    })

    expect(applied).toBe(false)
    expect(editor.replaceBlocks).toHaveBeenCalledTimes(1)
    expect(editor.insertBlocks).not.toHaveBeenCalled()
    expect(editor.document).toHaveLength(PROGRESSIVE_INITIAL_BLOCK_APPLY_CHUNK_SIZE)
    expect(editor.isEditable).toBe(true)
    expect(editorContentPathRef.current).toBeNull()
  })
})

// A Tab's caret goes with its scroll position: the caret it was left with
// comes back when the Tab is shown again, and a Document shown for the first
// time starts with the caret at its start, where its scroll position starts.
describe('the caret after a content swap', () => {
  const mounted: Array<{ editor: ReturnType<typeof createRealEditor>; mount: HTMLElement }> = []

  function createRealEditor() {
    return BlockNoteEditor.create({
      initialContent: [{ id: 'previous', type: 'paragraph', content: 'Previous note' }],
      schema,
    })
  }

  function openRealEditor() {
    const mount = document.createElement('div')
    document.body.appendChild(mount)
    const editor = createRealEditor()
    editor.mount(mount)
    mounted.push({ editor, mount })
    return editor
  }

  function caretBlockText(editor: ReturnType<typeof createRealEditor>) {
    return editor._tiptapEditor.state.selection.$head.parent.textContent
  }

  function applyOptions(editor: ReturnType<typeof createRealEditor>, blocks: unknown[]) {
    return {
      blocks,
      editor,
      editorContentPathRef: makeFrameRef<string | null>(null),
      scrollTop: 0,
      suppressChangeRef: makeFrameRef(false),
      targetPath: 'note.md',
    }
  }

  afterEach(() => {
    for (const { editor, mount } of mounted.splice(0)) {
      editor.unmount()
      mount.remove()
    }
  })

  it('puts the caret at the start of a Document shown for the first time, not at its end', () => {
    const editor = openRealEditor()

    applyBlocksToEditor(applyOptions(editor, makeBlocks(5)))

    expect(caretBlockText(editor)).toBe('Block 0')
    expect(editor._tiptapEditor.state.selection.$head.parentOffset).toBe(0)
  })

  it('brings back the caret the Tab was left with', () => {
    const editor = openRealEditor()
    applyBlocksToEditor(applyOptions(editor, makeBlocks(5)))
    const blockThree = editor.document[3]
    if (!blockThree) throw new Error('Expected a fourth block')
    editor.setTextCursorPosition(blockThree, 'end')
    const selection = readEditorSelection(editor)
    applyBlocksToEditor(applyOptions(editor, [{ id: 'other', type: 'paragraph', content: 'Another note' }]))

    applyBlocksToEditor({ ...applyOptions(editor, makeBlocks(5)), selection })

    expect(caretBlockText(editor)).toBe('Block 3')
    expect(editor._tiptapEditor.state.selection.$head.parentOffset).toBe('Block 3'.length)
  })

  it('puts the caret at the start when the Block the Tab was left with is gone', () => {
    const editor = openRealEditor()
    const gone = { blockId: 'gone-block', offset: 3 }

    applyBlocksToEditor({ ...applyOptions(editor, makeBlocks(2)), selection: { anchor: gone, head: gone } })

    expect(caretBlockText(editor)).toBe('Block 0')
  })

  it('brings back the caret after a large Document is mounted in chunks', async () => {
    const editor = openRealEditor()
    const blocks = makeBlocks(PROGRESSIVE_BLOCK_APPLY_THRESHOLD + 10)
    await applyBlocksToEditorProgressively(applyOptions(editor, blocks))
    const lateBlock = editor.document.find(block => block.id === `block-${PROGRESSIVE_BLOCK_APPLY_THRESHOLD}`)
    if (!lateBlock) throw new Error('Expected a late block')
    editor.setTextCursorPosition(lateBlock, 'start')
    const selection = readEditorSelection(editor)
    applyBlocksToEditor(applyOptions(editor, [{ id: 'other', type: 'paragraph', content: 'Another note' }]))

    await applyBlocksToEditorProgressively({ ...applyOptions(editor, blocks), selection })

    expect(caretBlockText(editor)).toBe(`Block ${PROGRESSIVE_BLOCK_APPLY_THRESHOLD}`)
  })
})

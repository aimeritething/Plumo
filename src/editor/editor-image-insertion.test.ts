import type { useCreateBlockNote } from '@blocknote/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { imageDropTargetAt, insertImageBlocksAtDropTarget } from './editor-image-insertion'
import { reportRecoveredEditorTransformError } from '@/kernel/blocknote/rich-editor-transform-error-recovery-extension'

vi.mock('@/kernel/blocknote/rich-editor-transform-error-recovery-extension', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/kernel/blocknote/rich-editor-transform-error-recovery-extension')>()
  return {
    ...actual,
    reportRecoveredEditorTransformError: vi.fn(),
  }
})

type ImageInsertionEditor = Pick<
  ReturnType<typeof useCreateBlockNote>,
  'document' | 'domElement' | 'getBlock' | 'insertBlocks'
>

function createEditor(
  overrides: Partial<ImageInsertionEditor> = {},
): ReturnType<typeof useCreateBlockNote> {
  const editor = {
    document: [],
    domElement: undefined,
    getBlock: vi.fn(),
    insertBlocks: vi.fn(),
    ...overrides,
  }
  return editor as unknown as ReturnType<typeof useCreateBlockNote>
}

function rect(top: number, height: number, left = 0, width = 600): DOMRect {
  return { top, height, bottom: top + height, left, width, right: left + width, x: left, y: top, toJSON: () => ({}) }
}

/**
 * A `.bn-editor` 600px wide from y=100 to y=500 holding three top-level
 * blocks, each 40px tall: a (100–140), b (140–180), c (180–220). The editor
 * runs on below its last block, the way BlockNote's bottom padding does.
 */
function mountEditorDom() {
  const editorElement = document.createElement('div')
  editorElement.className = 'bn-editor'
  vi.spyOn(editorElement, 'getBoundingClientRect').mockReturnValue(rect(100, 400))
  const blocks = ['a', 'b', 'c'].map((id, index) => {
    const block = document.createElement('div')
    block.dataset.nodeType = 'blockContainer'
    block.dataset.id = id
    vi.spyOn(block, 'getBoundingClientRect').mockReturnValue(rect(100 + index * 40, 40))
    editorElement.appendChild(block)
    return block
  })
  document.body.appendChild(editorElement)
  // What a real layout would answer: the block under the point, then the editor.
  const elementsFromPoint = vi.fn((_x: number, y: number) => {
    const hit = blocks.find((block) => {
      const { top, bottom } = block.getBoundingClientRect()
      return y >= top && y < bottom
    })
    return hit ? [hit, editorElement] : [editorElement]
  })
  Object.defineProperty(document, 'elementsFromPoint', { configurable: true, value: elementsFromPoint })

  return createEditor({
    document: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] as never,
    domElement: editorElement,
  })
}

afterEach(() => {
  document.body.innerHTML = ''
  Reflect.deleteProperty(document, 'elementsFromPoint')
})

describe('imageDropTargetAt', () => {
  it('puts a drop in the upper half of a block before it', () => {
    const editor = mountEditorDom()

    expect(imageDropTargetAt(editor, { x: 200, y: 150 })).toEqual({ blockId: 'b', placement: 'before' })
  })

  it('puts a drop in the lower half of a block after it', () => {
    const editor = mountEditorDom()

    expect(imageDropTargetAt(editor, { x: 200, y: 170 })).toEqual({ blockId: 'b', placement: 'after' })
  })

  it('reads the block from the row the pointer is on even when it is out in the margin', () => {
    const editor = mountEditorDom()

    expect(imageDropTargetAt(editor, { x: 900, y: 105 })).toEqual({ blockId: 'a', placement: 'before' })
  })

  it('puts a drop below the last block after it', () => {
    const editor = mountEditorDom()

    expect(imageDropTargetAt(editor, { x: 200, y: 400 })).toEqual({ blockId: 'c', placement: 'after' })
  })

  it('takes nothing while the editor has no DOM to hit', () => {
    expect(imageDropTargetAt(createEditor(), { x: 200, y: 150 })).toBeNull()
  })
})

describe('insertImageBlocksAtDropTarget', () => {
  it('inserts every image, in order, as consecutive blocks beside the target block', () => {
    const liveBlock = { id: 'b' }
    const editor = createEditor({ getBlock: vi.fn(() => liveBlock) as never })

    expect(insertImageBlocksAtDropTarget(
      editor,
      ['asset://localhost/one.png', 'asset://localhost/two.png', 'asset://localhost/three.png'],
      { blockId: 'b', placement: 'before' },
    )).toBe(true)

    expect(editor.getBlock).toHaveBeenCalledWith('b')
    expect(editor.insertBlocks).toHaveBeenCalledOnce()
    expect(editor.insertBlocks).toHaveBeenCalledWith(
      [
        { type: 'image', props: { url: 'asset://localhost/one.png' } },
        { type: 'image', props: { url: 'asset://localhost/two.png' } },
        { type: 'image', props: { url: 'asset://localhost/three.png' } },
      ],
      liveBlock,
      'before',
    )
  })

  it('inserts nothing once the target block has gone, rather than at the caret of whatever is showing now', () => {
    const editor = createEditor({ getBlock: vi.fn(() => undefined) })

    expect(insertImageBlocksAtDropTarget(editor, ['asset://localhost/photo.png'], { blockId: 'gone', placement: 'before' })).toBe(false)

    expect(editor.insertBlocks).not.toHaveBeenCalled()
  })

  it('recovers stale BlockNote insertion races without surfacing them to Sentry', () => {
    const missingBlockError = new Error('Block with ID b not found')
    const editor = createEditor({
      getBlock: vi.fn(() => ({ id: 'b' })) as never,
      insertBlocks: vi.fn(() => {
        throw missingBlockError
      }),
    })

    expect(insertImageBlocksAtDropTarget(editor, ['asset://localhost/photo.png'], { blockId: 'b', placement: 'after' })).toBe(false)

    expect(reportRecoveredEditorTransformError).toHaveBeenCalledWith(
      'stale_block_reference',
      missingBlockError,
    )
  })

  it('rethrows non-stale insertion errors', () => {
    const insertionError = new Error('Unexpected editor failure')
    const editor = createEditor({
      getBlock: vi.fn(() => ({ id: 'b' })) as never,
      insertBlocks: vi.fn(() => {
        throw insertionError
      }),
    })

    expect(() => {
      insertImageBlocksAtDropTarget(editor, ['asset://localhost/photo.png'], { blockId: 'b', placement: 'after' })
    }).toThrow(insertionError)
  })
})

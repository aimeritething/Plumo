import { BlockNoteEditor } from '@blocknote/core'
import { TextSelection } from '@tiptap/pm/state'
import { afterEach, describe, expect, it } from 'vitest'
import { schema } from './editor-schema'
import { placeCaretForClosedTableHandle } from './table-handle-caret'

// Where the caret is when a Table handle's menu closes: the editor takes focus
// then, and a key pressed next goes to the caret.

const mounted: BlockNoteEditor<typeof schema.blockSchema, typeof schema.inlineContentSchema, typeof schema.styleSchema>[] = []

function openTableDocument() {
  const editor = BlockNoteEditor.create({ schema })
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor.mount(host)
  mounted.push(editor)
  editor.replaceBlocks(editor.document, [
    { type: 'paragraph', content: 'Before' },
    {
      id: 'table',
      type: 'table',
      content: {
        type: 'tableContent',
        rows: [
          { cells: ['Day', 'Plan'] },
          { cells: ['Morning', 'Writing'] },
        ],
      },
    },
    { type: 'paragraph', content: 'The last paragraph.' },
  ] as never)
  return editor
}

function caretText(editor: ReturnType<typeof openTableDocument>) {
  const { $from } = editor.prosemirrorView!.state.selection
  return $from.parent.textContent
}

function putCaretIn(editor: ReturnType<typeof openTableDocument>, text: string) {
  const view = editor.prosemirrorView!
  let target = -1
  view.state.doc.descendants((node, pos) => {
    if (target === -1 && node.isText && node.text === text) target = pos
    return target === -1
  })
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target + 1)))
}

describe('placeCaretForClosedTableHandle', () => {
  afterEach(() => {
    for (const editor of mounted.splice(0)) editor._tiptapEditor.destroy()
  })

  it("moves a caret left outside the table into the first cell of the handle's column", () => {
    const editor = openTableDocument()
    putCaretIn(editor, 'The last paragraph.')

    placeCaretForClosedTableHandle(editor.prosemirrorView!, { blockId: 'table', orientation: 'column', index: 1 })

    expect(caretText(editor)).toBe('Plan')
  })

  it("moves a caret left outside the table into the first cell of the handle's row", () => {
    const editor = openTableDocument()
    putCaretIn(editor, 'The last paragraph.')

    placeCaretForClosedTableHandle(editor.prosemirrorView!, { blockId: 'table', orientation: 'row', index: 1 })

    expect(caretText(editor)).toBe('Morning')
  })

  it('keeps a caret that is already in the table', () => {
    const editor = openTableDocument()
    putCaretIn(editor, 'Writing')
    const before = editor.prosemirrorView!.state.selection.from

    placeCaretForClosedTableHandle(editor.prosemirrorView!, { blockId: 'table', orientation: 'column', index: 0 })

    expect(editor.prosemirrorView!.state.selection.from).toBe(before)
  })
})

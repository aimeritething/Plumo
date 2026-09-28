import { BlockNoteEditor, type PartialBlock } from '@blocknote/core'
import { TextSelection } from '@tiptap/pm/state'
import { afterEach, describe, expect, it } from 'vitest'
import { createArrowLigatureInputTransform } from './arrow-ligatures-extension'
import { caretIsInCode, rangeIsInCode } from './code-context'
import { schema } from './editor-schema'
import { createMarkdownHighlightInputTransform } from './markdown-highlight-input-extension'
import { createMathInputTransform } from './math-input-extension'
import type { RichEditorInputTransform } from './rich-editor-input-transform'

type TestEditor = ReturnType<typeof createMountedEditor>
type TestBlock = PartialBlock<typeof schema.blockSchema, typeof schema.inlineContentSchema, typeof schema.styleSchema>

const mounted: TestEditor[] = []

function createMountedEditor() {
  const editor = BlockNoteEditor.create({ schema })
  const host = document.createElement('div')
  document.body.appendChild(host)
  editor.mount(host)
  mounted.push(editor)
  return editor
}

/** An editor holding `block`, with the caret at the end of its text. */
function createEditorWithCaretAtEnd(block: TestBlock) {
  const editor = createMountedEditor()
  editor.replaceBlocks(editor.document, [block])

  let end = -1
  editor._tiptapEditor.state.doc.descendants((node, pos) => {
    if (end === -1 && node.isTextblock) end = pos + 1 + node.content.size
  })
  if (end === -1) throw new Error('the block did not load')

  const view = editor._tiptapEditor.view
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)))
  return { editor, end, view }
}

function typeInto(transform: RichEditorInputTransform, editor: TestEditor, data: string) {
  const event = { data, inputType: 'insertText', preventDefault: () => {} } as unknown as InputEvent
  return transform.handleBeforeInput(event, { view: editor._tiptapEditor.view })
}

const codeBlock = (text: string): TestBlock => ({ type: 'codeBlock', content: text })
const inlineCode = (text: string): TestBlock => ({
  type: 'paragraph',
  content: [{ type: 'text', text, styles: { code: true } }],
})

afterEach(() => {
  for (const editor of mounted.splice(0)) editor._tiptapEditor.destroy()
})

describe('caretIsInCode', () => {
  it('is false in a plain paragraph', () => {
    const { view } = createEditorWithCaretAtEnd({ type: 'paragraph', content: 'plain' })

    expect(caretIsInCode(view.state)).toBe(false)
  })

  it('is true in a code block', () => {
    const { view } = createEditorWithCaretAtEnd(codeBlock('let a'))

    expect(caretIsInCode(view.state)).toBe(true)
  })

  it('is true at the end of inline code', () => {
    const { view } = createEditorWithCaretAtEnd(inlineCode('let a'))

    expect(caretIsInCode(view.state)).toBe(true)
  })

  it('is true when the next character will be typed as inline code', () => {
    const { view } = createEditorWithCaretAtEnd({ type: 'paragraph', content: 'plain' })
    view.dispatch(view.state.tr.addStoredMark(view.state.schema.marks.code.create()))

    expect(caretIsInCode(view.state)).toBe(true)
  })
})

describe('rangeIsInCode', () => {
  it('is true when any part of the range is inline code, whatever follows it', () => {
    const { view } = createEditorWithCaretAtEnd({
      type: 'paragraph',
      content: [
        { type: 'text', text: 'a', styles: { code: true } },
        { type: 'text', text: ' b', styles: {} },
      ],
    })

    expect(rangeIsInCode(view.state, 1, 4)).toBe(true)
  })

  it('is false over plain text', () => {
    const { view } = createEditorWithCaretAtEnd({ type: 'paragraph', content: 'plain' })

    expect(rangeIsInCode(view.state, 1, 4)).toBe(false)
  })
})

describe('input rules in code', () => {
  it('turns $x^2$ into inline math in a plain paragraph', () => {
    const { editor } = createEditorWithCaretAtEnd({ type: 'paragraph', content: '$x^2$' })

    expect(typeInto(createMathInputTransform(), editor, ' ')).not.toBeNull()
  })

  it.each([
    ['a code block', codeBlock('$x^2$')],
    ['inline code', inlineCode('$x^2$')],
  ])('leaves $x^2$ literal in %s', (_context, block) => {
    const { editor } = createEditorWithCaretAtEnd(block)

    expect(typeInto(createMathInputTransform(), editor, ' ')).toBeNull()
  })

  it('turns -> into an arrow in a plain paragraph', () => {
    const { editor } = createEditorWithCaretAtEnd({ type: 'paragraph', content: 'a -' })

    expect(typeInto(createArrowLigatureInputTransform(), editor, '>')).not.toBeNull()
  })

  it.each([
    ['a code block', codeBlock('a -')],
    ['inline code', inlineCode('a -')],
  ])('leaves -> literal in %s', (_context, block) => {
    const { editor } = createEditorWithCaretAtEnd(block)

    expect(typeInto(createArrowLigatureInputTransform(), editor, '>')).toBeNull()
  })

  it('turns ==x== into a highlight in a plain paragraph', () => {
    const { editor } = createEditorWithCaretAtEnd({ type: 'paragraph', content: '==x=' })

    expect(typeInto(createMarkdownHighlightInputTransform(), editor, '=')).not.toBeNull()
  })

  it.each([
    ['a code block', codeBlock('==x=')],
    ['inline code', inlineCode('==x=')],
  ])('leaves ==x== literal in %s', (_context, block) => {
    const { editor } = createEditorWithCaretAtEnd(block)

    expect(typeInto(createMarkdownHighlightInputTransform(), editor, '=')).toBeNull()
  })

  it('leaves ==x== literal when the text between the markers is inline code followed by plain text', () => {
    const { editor } = createEditorWithCaretAtEnd({
      type: 'paragraph',
      content: [
        { type: 'text', text: '==', styles: {} },
        { type: 'text', text: 'code', styles: { code: true } },
        { type: 'text', text: ' plain=', styles: {} },
      ],
    })

    expect(typeInto(createMarkdownHighlightInputTransform(), editor, '=')).toBeNull()
  })
})

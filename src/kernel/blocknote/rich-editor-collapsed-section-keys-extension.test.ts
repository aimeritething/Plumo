import { BlockNoteEditor, type PartialBlock } from '@blocknote/core'
import { TextSelection } from '@tiptap/pm/state'
import { describe, expect, it, onTestFinished } from 'vitest'
import { schema } from './editor-schema'
import { collapsedSectionHiddenBlockIds, toggleCollapsedHeading } from './collapsed-sections'
import { createRichEditorBlockSelectionExtension } from './rich-editor-block-selection-extension'
import { createRichEditorCollapsedSectionKeysExtension } from './rich-editor-collapsed-section-keys-extension'

type FixtureBlock = PartialBlock<typeof schema.blockSchema, typeof schema.inlineContentSchema, typeof schema.styleSchema>
type TestEditor = ReturnType<typeof mountEditor>

function mountEditor(initialContent: FixtureBlock[]) {
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const editor = BlockNoteEditor.create({
    extensions: [createRichEditorCollapsedSectionKeysExtension(), createRichEditorBlockSelectionExtension()],
    initialContent,
    schema,
  })
  editor.mount(mount)
  onTestFinished(() => {
    editor.unmount()
    mount.remove()
  })
  return editor
}

function sectionFixture() {
  const editor = mountEditor([
    { id: 'intro', type: 'paragraph', content: 'Intro' },
    { id: 'heading', type: 'heading', props: { level: 2 }, content: 'Heading' },
    { id: 'hidden', type: 'paragraph', content: 'Hidden body' },
    { id: 'hidden-more', type: 'paragraph', content: 'Hidden more' },
    { id: 'next', type: 'heading', props: { level: 2 }, content: 'Next' },
  ])
  toggleCollapsedHeading(editor, 'heading')
  return editor
}

/** Puts the cursor `offset` characters into the block's text. */
function placeCursor(editor: TestEditor, blockId: string, offset: number) {
  editor.setTextCursorPosition(blockId, 'start')
  const view = editor._tiptapEditor.view
  const { from } = view.state.selection
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from + offset)))
}

function press(editor: TestEditor, key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  editor._tiptapEditor.view.dom.dispatchEvent(event)
  return event
}

function cursorBlock(editor: TestEditor) {
  return editor.getTextCursorPosition().block
}

function blockTexts(editor: TestEditor) {
  return editor.document.map((block) => (
    Array.isArray(block.content)
      ? block.content.map((inline) => ('text' in inline ? inline.text : '')).join('')
      : ''
  ))
}

function isHidden(editor: TestEditor, blockId: string) {
  return collapsedSectionHiddenBlockIds(editor).has(blockId)
}

describe('Enter in a collapsed heading', () => {
  it('at the end puts the new block after the whole section, in view, with the cursor in it', () => {
    const editor = sectionFixture()
    placeCursor(editor, 'heading', 'Heading'.length)

    const event = press(editor, 'Enter')

    expect(event.defaultPrevented).toBe(true)
    const newBlock = cursorBlock(editor)
    expect(newBlock.type).toBe('paragraph')
    expect(editor.document.map((block) => block.id).slice(0, 5)).toEqual(['intro', 'heading', 'hidden', 'hidden-more', newBlock.id])
    expect(isHidden(editor, newBlock.id)).toBe(false)
    expect(isHidden(editor, 'hidden')).toBe(true)
    expect(isHidden(editor, 'hidden-more')).toBe(true)
  })

  it('keeps what is typed in the new block in view', () => {
    const editor = sectionFixture()
    placeCursor(editor, 'heading', 'Heading'.length)
    press(editor, 'Enter')

    editor.insertInlineContent('Typed')

    const typedBlock = cursorBlock(editor)
    expect(blockTexts(editor)).toContain('Typed')
    expect(isHidden(editor, typedBlock.id)).toBe(false)
  })

  it('in the middle moves the rest of the heading text past the section, heading still collapsed', () => {
    const editor = sectionFixture()
    placeCursor(editor, 'heading', 'Head'.length)

    press(editor, 'Enter')

    expect(blockTexts(editor).slice(0, 5)).toEqual(['Intro', 'Head', 'Hidden body', 'Hidden more', 'ing'])
    expect(cursorBlock(editor).type).toBe('paragraph')
    expect(isHidden(editor, cursorBlock(editor).id)).toBe(false)
    expect(isHidden(editor, 'hidden')).toBe(true)
  })

  it('at the start adds an empty heading above and keeps the section with the heading', () => {
    const editor = sectionFixture()
    placeCursor(editor, 'heading', 0)

    press(editor, 'Enter')

    expect(blockTexts(editor).slice(0, 3)).toEqual(['Intro', '', 'Heading'])
    expect(editor.document[1].type).toBe('heading')
    expect(cursorBlock(editor).id).toBe('heading')
    expect(isHidden(editor, 'hidden')).toBe(true)
    expect(isHidden(editor, editor.document[1].id)).toBe(false)
  })

  it('undoes in one step', () => {
    const editor = sectionFixture()
    placeCursor(editor, 'heading', 'Head'.length)
    press(editor, 'Enter')

    editor.undo()

    expect(blockTexts(editor).slice(0, 5)).toEqual(['Intro', 'Heading', 'Hidden body', 'Hidden more', 'Next'])
  })

  it('leaves an expanded heading to BlockNote', () => {
    const editor = sectionFixture()
    toggleCollapsedHeading(editor, 'heading')
    placeCursor(editor, 'heading', 'Heading'.length)

    const event = press(editor, 'Enter')

    expect(event.defaultPrevented).toBe(true)
    expect(editor.document[2].id).toBe(cursorBlock(editor).id)
    expect(blockTexts(editor).slice(0, 4)).toEqual(['Intro', 'Heading', '', 'Hidden body'])
  })
})

describe('Backspace at the start of the block after a collapsed section', () => {
  function withBlockAfterSection(text: string) {
    const editor = sectionFixture()
    placeCursor(editor, 'heading', 'Heading'.length)
    press(editor, 'Enter')
    if (text) editor.insertInlineContent(text)
    const after = cursorBlock(editor)
    placeCursor(editor, after.id, 0)
    return { after, editor }
  }

  it('removes an empty block and puts the cursor at the end of the collapsed heading', () => {
    const { after, editor } = withBlockAfterSection('')

    const event = press(editor, 'Backspace')

    expect(event.defaultPrevented).toBe(true)
    expect(editor.getBlock(after.id)).toBeUndefined()
    expect(cursorBlock(editor).id).toBe('heading')
    expect(isHidden(editor, 'hidden')).toBe(true)
  })

  it('keeps the cursor out of a collapsed list item\'s children', () => {
    const editor = mountEditor([
      {
        id: 'parent',
        type: 'bulletListItem',
        content: 'Parent',
        children: [{ id: 'child', type: 'bulletListItem', content: 'Child' }],
      },
      { id: 'after', type: 'paragraph', content: '' },
    ])
    toggleCollapsedHeading(editor, 'parent')
    placeCursor(editor, 'after', 0)

    press(editor, 'Backspace')

    expect(editor.getBlock('after')).toBeUndefined()
    expect(cursorBlock(editor).id).toBe('parent')
    expect(isHidden(editor, 'child')).toBe(true)
  })

  it('opens the section before merging a block with text into its last block', () => {
    const { editor } = withBlockAfterSection('Tail')

    press(editor, 'Backspace')

    expect(isHidden(editor, 'hidden-more')).toBe(false)
    expect(blockTexts(editor)).toContain('Hidden moreTail')
    expect(cursorBlock(editor).id).toBe('hidden-more')
  })
})

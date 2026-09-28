import { BlockNoteEditor, type PartialBlock } from '@blocknote/core'
import { describe, expect, it, onTestFinished } from 'vitest'
import { schema } from './editor-schema'
import { collapsedSectionHiddenBlockIds, toggleCollapsedHeading } from './collapsed-sections'
import { documentBlockIds } from './rich-editor-block-selection-document'
import { canDropSideMenuSection, moveSideMenuSection, removeSideMenuSection } from './side-menu-blocks'

type FixtureBlock = PartialBlock<typeof schema.blockSchema, typeof schema.inlineContentSchema, typeof schema.styleSchema>

function mountEditor(initialContent: FixtureBlock[]) {
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const editor = BlockNoteEditor.create({ initialContent, schema })
  editor.mount(mount)
  onTestFinished(() => {
    editor.unmount()
    mount.remove()
  })
  return editor
}

function sectionsFixture() {
  return mountEditor([
    { id: 'first', type: 'heading', props: { level: 2 }, content: 'First' },
    { id: 'first-body', type: 'paragraph', content: 'First body' },
    {
      id: 'first-list',
      type: 'bulletListItem',
      content: 'First list',
      children: [{ id: 'first-list-child', type: 'bulletListItem', content: 'Child' }],
    },
    { id: 'second', type: 'heading', props: { level: 2 }, content: 'Second' },
    { id: 'second-body', type: 'paragraph', content: 'Second body' },
    { id: 'second-more', type: 'paragraph', content: 'Second more' },
  ])
}

// The block ids in document order, leaving out BlockNote's trailing empty paragraph.
function blockOrder(editor: ReturnType<typeof mountEditor>) {
  return documentBlockIds(editor.document).filter((id) => {
    const content = editor.getBlock(id)?.content
    return !Array.isArray(content) || content.length > 0
  })
}

function hiddenIds(editor: ReturnType<typeof mountEditor>) {
  return [...collapsedSectionHiddenBlockIds(editor)].sort()
}

describe('dragging a collapsed heading by its side-menu handle', () => {
  it('moves the whole section, the unit block selection moves', () => {
    const editor = sectionsFixture()
    toggleCollapsedHeading(editor, 'first')

    expect(moveSideMenuSection(editor, 'first', 'second-more', 'before')).toBe(true)

    expect(blockOrder(editor)).toEqual([
      'second', 'second-body', 'first', 'first-body', 'first-list', 'first-list-child', 'second-more',
    ])
  })

  it('keeps the heading collapsed at its new place, hiding exactly its own section', () => {
    const editor = sectionsFixture()
    toggleCollapsedHeading(editor, 'first')

    moveSideMenuSection(editor, 'first', 'second-more', 'before')

    expect(hiddenIds(editor)).toEqual(['first-body', 'first-list', 'first-list-child'])
  })

  it('refuses a drop inside the dragged section, and on a nested block within it', () => {
    const editor = sectionsFixture()
    toggleCollapsedHeading(editor, 'first')
    const before = blockOrder(editor)

    expect(canDropSideMenuSection(editor, 'first', 'first-body')).toBe(false)
    expect(canDropSideMenuSection(editor, 'first', 'first-list-child')).toBe(false)
    expect(moveSideMenuSection(editor, 'first', 'first-body', 'after')).toBe(false)
    expect(blockOrder(editor)).toEqual(before)
    expect(canDropSideMenuSection(editor, 'first', 'second')).toBe(true)
  })

  it('moves an expanded heading alone, as before', () => {
    const editor = sectionsFixture()

    moveSideMenuSection(editor, 'first', 'second-more', 'after')

    expect(blockOrder(editor)).toEqual([
      'first-body', 'first-list', 'first-list-child', 'second', 'second-body', 'second-more', 'first',
    ])
  })
})

describe('dropping a block after a collapsed heading', () => {
  it('lands after the whole section and stays in view, the section still collapsed', () => {
    const editor = mountEditor([
      { id: 'loose', type: 'paragraph', content: 'Loose' },
      { id: 'heading', type: 'heading', props: { level: 2 }, content: 'Heading' },
      { id: 'hidden', type: 'paragraph', content: 'Hidden' },
      { id: 'next', type: 'heading', props: { level: 2 }, content: 'Next' },
    ])
    toggleCollapsedHeading(editor, 'heading')

    moveSideMenuSection(editor, 'loose', 'heading', 'after')

    expect(blockOrder(editor)).toEqual(['heading', 'hidden', 'loose', 'next'])
    expect(hiddenIds(editor)).toEqual(['hidden'])
  })
})

describe('deleting a collapsed heading from its side menu', () => {
  it('deletes the whole section in one undoable step, and undo brings it back collapsed', () => {
    const editor = sectionsFixture()
    toggleCollapsedHeading(editor, 'first')

    removeSideMenuSection(editor, { id: 'first' })

    expect(blockOrder(editor)).toEqual(['second', 'second-body', 'second-more'])

    editor.undo()

    expect(blockOrder(editor)).toEqual([
      'first', 'first-body', 'first-list', 'first-list-child', 'second', 'second-body', 'second-more',
    ])
    expect(hiddenIds(editor)).toEqual(['first-body', 'first-list', 'first-list-child'])
  })

  it('deletes an expanded heading alone, as before', () => {
    const editor = sectionsFixture()

    removeSideMenuSection(editor, { id: 'first' })

    expect(blockOrder(editor).slice(0, 2)).toEqual(['first-body', 'first-list'])
  })
})

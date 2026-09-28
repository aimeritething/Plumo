import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  collapsedSectionHiddenBlockIds,
  endCollapsedSectionAfter,
  expandSectionsHidingBlock,
  keepBlockOutOfCollapsedSections,
  toggleCollapsedHeading,
} from './collapsed-sections'

function mountEditor() {
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const editor = BlockNoteEditor.create({
    initialContent: [
      { id: 'h2', type: 'heading', props: { level: 2 }, content: 'Section' },
      { id: 'intro', type: 'paragraph', content: 'Intro' },
      { id: 'h3', type: 'heading', props: { level: 3 }, content: 'Subsection' },
      { id: 'deep', type: 'paragraph', content: 'Deep' },
      { id: 'next', type: 'heading', props: { level: 2 }, content: 'Next section' },
      { id: 'after', type: 'paragraph', content: 'After' },
      {
        id: 'list',
        type: 'bulletListItem',
        content: 'Parent',
        children: [{ id: 'child', type: 'bulletListItem', content: 'Child' }],
      },
    ],
  })
  editor.mount(mount)
  onTestFinished(() => {
    editor.unmount()
    mount.remove()
  })
  return editor
}

describe('expandSectionsHidingBlock', () => {
  it('opens the collapsed heading a block sits under, and leaves other sections shut', () => {
    const editor = mountEditor()
    toggleCollapsedHeading(editor, 'h2')
    toggleCollapsedHeading(editor, 'next')
    expect(collapsedSectionHiddenBlockIds(editor).has('intro')).toBe(true)

    expandSectionsHidingBlock(editor, 'intro')

    expect(collapsedSectionHiddenBlockIds(editor).has('intro')).toBe(false)
    expect(collapsedSectionHiddenBlockIds(editor).has('after')).toBe(true)
  })

  it('opens every level: a collapsed subsection inside a collapsed section', () => {
    const editor = mountEditor()
    toggleCollapsedHeading(editor, 'h3')
    toggleCollapsedHeading(editor, 'h2')

    expandSectionsHidingBlock(editor, 'deep')

    expect(collapsedSectionHiddenBlockIds(editor).has('deep')).toBe(false)
  })

  it('opens a collapsed list item over a nested one', () => {
    const editor = mountEditor()
    toggleCollapsedHeading(editor, 'list')
    expect(collapsedSectionHiddenBlockIds(editor).has('child')).toBe(true)

    expandSectionsHidingBlock(editor, 'child')

    expect(collapsedSectionHiddenBlockIds(editor).has('child')).toBe(false)
  })

  it('leaves a block that is in view alone', () => {
    const editor = mountEditor()
    toggleCollapsedHeading(editor, 'next')

    expandSectionsHidingBlock(editor, 'intro')

    expect(collapsedSectionHiddenBlockIds(editor).has('after')).toBe(true)
  })
})

describe('a collapsed section that ends early', () => {
  it('hides up to its end block and leaves what follows in view', () => {
    const editor = mountEditor()
    toggleCollapsedHeading(editor, 'h2')

    endCollapsedSectionAfter(editor, 'h2', 'intro')

    expect([...collapsedSectionHiddenBlockIds(editor)]).toEqual(['intro'])
  })

  it('runs to the next heading of its level again once expanded and collapsed', () => {
    const editor = mountEditor()
    toggleCollapsedHeading(editor, 'h2')
    endCollapsedSectionAfter(editor, 'h2', 'intro')

    toggleCollapsedHeading(editor, 'h2')
    toggleCollapsedHeading(editor, 'h2')

    expect([...collapsedSectionHiddenBlockIds(editor)]).toEqual(['intro', 'h3', 'deep'])
  })

  it('ends before a block that has to stay in view', () => {
    const editor = mountEditor()
    toggleCollapsedHeading(editor, 'h2')

    keepBlockOutOfCollapsedSections(editor, 'deep')

    expect(collapsedSectionHiddenBlockIds(editor).has('deep')).toBe(false)
    expect([...collapsedSectionHiddenBlockIds(editor)]).toEqual(['intro', 'h3'])
  })

  it('opens a collapsed list item whose child has to stay in view', () => {
    const editor = mountEditor()
    toggleCollapsedHeading(editor, 'list')

    keepBlockOutOfCollapsedSections(editor, 'child')

    expect(collapsedSectionHiddenBlockIds(editor).has('child')).toBe(false)
  })
})

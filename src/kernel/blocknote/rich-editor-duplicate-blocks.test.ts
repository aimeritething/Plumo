import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, it, onTestFinished } from 'vitest'
import type { RichEditor } from './block-note-dom'
import {
  collapsedSectionHiddenBlockIds,
  isCollapsedBlock,
  toggleCollapsedHeading,
} from './collapsed-sections'
import {
  createRichEditorBlockSelectionExtension,
  readRichEditorBlockSelection,
  selectRichEditorBlocks,
} from './rich-editor-block-selection-extension'
import { duplicateBlocks, duplicateSelectedBlocks } from './rich-editor-duplicate-blocks'
import { createDuplicateSlashMenuItem } from './slash-menu-items'

function mountEditor() {
  const mount = document.createElement('div')
  document.body.appendChild(mount)
  const editor = BlockNoteEditor.create({
    extensions: [createRichEditorBlockSelectionExtension()],
    initialContent: [
      { id: 'h2', type: 'heading', props: { level: 2 }, content: 'Section' },
      { id: 'intro', type: 'paragraph', content: 'Intro' },
      { id: 'next', type: 'heading', props: { level: 2 }, content: 'Next section' },
      { id: 'after', type: 'paragraph', content: 'After' },
      {
        id: 'list',
        type: 'bulletListItem',
        content: 'Parent',
        children: [{ id: 'child', type: 'bulletListItem', content: 'Child' }],
      },
      { id: 'image', type: 'image', props: { url: 'attachments/cat.png' } },
      { id: 'tail', type: 'paragraph', content: 'Tail' },
    ],
  }) as unknown as RichEditor
  editor.mount(mount)
  onTestFinished(() => {
    editor.unmount()
    mount.remove()
  })
  return editor
}

function topLevel(editor: RichEditor) {
  return editor.document.map((block) => ({
    type: block.type,
    text: Array.isArray(block.content) ? block.content.map((part) => ('text' in part ? part.text : '')).join('') : undefined,
  }))
}

describe('duplicateBlocks', () => {
  it('puts a copy right after the Block, with the Blocks nested under it, under new ids', () => {
    const editor = mountEditor()

    const [copyId] = duplicateBlocks(editor, ['list'])

    const ids = editor.document.map((block) => block.id)
    expect(ids.indexOf(copyId)).toBe(ids.indexOf('list') + 1)
    expect(copyId).not.toBe('list')
    const copy = editor.getBlock(copyId)
    expect(copy?.children.map((child) => child.id)).not.toEqual(['child'])
    expect(copy?.children).toHaveLength(1)
  })

  it('copies an expanded heading alone', () => {
    const editor = mountEditor()

    duplicateBlocks(editor, ['h2'])

    expect(topLevel(editor).slice(0, 3)).toEqual([
      { type: 'heading', text: 'Section' },
      { type: 'heading', text: 'Section' },
      { type: 'paragraph', text: 'Intro' },
    ])
  })

  it('copies a folded heading with its whole Section, after that Section, folded as the original is', () => {
    const editor = mountEditor()
    toggleCollapsedHeading(editor, 'h2')

    const [copyId] = duplicateBlocks(editor, ['h2'])

    expect(topLevel(editor).slice(0, 5)).toEqual([
      { type: 'heading', text: 'Section' },
      { type: 'paragraph', text: 'Intro' },
      { type: 'heading', text: 'Section' },
      { type: 'paragraph', text: 'Intro' },
      { type: 'heading', text: 'Next section' },
    ])
    expect(editor.document[2].id).toBe(copyId)
    expect(isCollapsedBlock(editor, copyId)).toBe(true)
    const hidden = collapsedSectionHiddenBlockIds(editor)
    expect(hidden.has(editor.document[3].id)).toBe(true)
    expect(hidden.has('next')).toBe(false)
  })

  it('keeps a folded list item folded in its copy', () => {
    const editor = mountEditor()
    toggleCollapsedHeading(editor, 'list')

    const [copyId] = duplicateBlocks(editor, ['list'])

    expect(isCollapsedBlock(editor, copyId)).toBe(true)
  })

  it('links the same Attachment from an image\'s copy', () => {
    const editor = mountEditor()

    const [copyId] = duplicateBlocks(editor, ['image'])

    expect(editor.getBlock(copyId)?.props).toMatchObject({ url: 'attachments/cat.png' })
  })

  it('is one Undo', () => {
    const editor = mountEditor()
    const copyIds = duplicateBlocks(editor, ['intro', 'next'])
    expect(copyIds).toHaveLength(2)

    editor.undo()
    const ids = editor.document.map((block) => block.id)
    expect(copyIds.filter((id) => ids.includes(id))).toEqual([])
    expect(ids.slice(0, 3)).toEqual(['h2', 'intro', 'next'])
  })
})

describe('duplicateSelectedBlocks', () => {
  it('copies the block selection, as one run after its last Block, and selects the copies', () => {
    const editor = mountEditor()
    selectRichEditorBlocks(editor.prosemirrorView!, ['intro', 'next'])

    expect(duplicateSelectedBlocks(editor)).toBe(true)

    expect(topLevel(editor).slice(1, 5)).toEqual([
      { type: 'paragraph', text: 'Intro' },
      { type: 'heading', text: 'Next section' },
      { type: 'paragraph', text: 'Intro' },
      { type: 'heading', text: 'Next section' },
    ])
    expect(readRichEditorBlockSelection(editor.prosemirrorView!)).toEqual([editor.document[3].id, editor.document[4].id])
  })

  it('copies the caret\'s Block with no block selection', () => {
    const editor = mountEditor()
    editor.setTextCursorPosition('after', 'end')

    duplicateSelectedBlocks(editor)

    expect(topLevel(editor).slice(3, 5)).toEqual([
      { type: 'paragraph', text: 'After' },
      { type: 'paragraph', text: 'After' },
    ])
    expect(readRichEditorBlockSelection(editor.prosemirrorView!)).toEqual([editor.document[4].id])
  })
})

describe('/duplicate', () => {
  it('copies the Block the slash menu was opened in', () => {
    const editor = mountEditor()
    editor.setTextCursorPosition('intro', 'end')

    createDuplicateSlashMenuItem(editor as never).onItemClick()

    expect(topLevel(editor).slice(1, 3)).toEqual([
      { type: 'paragraph', text: 'Intro' },
      { type: 'paragraph', text: 'Intro' },
    ])
  })
})

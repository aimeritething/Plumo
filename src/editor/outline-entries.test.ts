import { BlockNoteEditor, type PartialBlock } from '@blocknote/core'
import { describe, expect, it } from 'vitest'
import { documentOutline, railLayout } from './outline-entries'

function outlineOf(blocks: PartialBlock[]) {
  const editor = BlockNoteEditor.create({ initialContent: blocks })
  return documentOutline(editor.prosemirrorState.doc).map(({ id, depth, text }) => ({ id, depth, text }))
}

describe('documentOutline', () => {
  it('lists the headings in Document order, indented from the shallowest level present', () => {
    expect(outlineOf([
      { id: 'a', type: 'heading', props: { level: 2 }, content: 'Why git at all' },
      { type: 'paragraph', content: 'Body' },
      { id: 'b', type: 'heading', props: { level: 3 }, content: 'One' },
      { id: 'c', type: 'heading', props: { level: 2 }, content: 'Conflicts' },
    ])).toEqual([
      { id: 'a', depth: 0, text: 'Why git at all' },
      { id: 'b', depth: 1, text: 'One' },
      { id: 'c', depth: 0, text: 'Conflicts' },
    ])
  })

  it('leaves out the title, a first-level heading that is the first Block, but not a later first-level heading', () => {
    expect(outlineOf([
      { id: 'title', type: 'heading', props: { level: 1 }, content: 'Keeping a folder in sync' },
      { id: 'a', type: 'heading', props: { level: 2 }, content: 'Setup' },
      { id: 'b', type: 'heading', props: { level: 1 }, content: 'Appendix' },
    ])).toEqual([
      { id: 'a', depth: 1, text: 'Setup' },
      { id: 'b', depth: 0, text: 'Appendix' },
    ])
  })

  it('keeps a first Block that is a heading of another level', () => {
    expect(outlineOf([
      { id: 'a', type: 'heading', props: { level: 2 }, content: 'First' },
      { id: 'b', type: 'heading', props: { level: 2 }, content: 'Second' },
    ]).map((entry) => entry.id)).toEqual(['a', 'b'])
  })

  it('lists a heading nested under another Block, and skips an empty one', () => {
    expect(outlineOf([
      { type: 'paragraph', content: 'Intro' },
      {
        type: 'bulletListItem',
        content: 'Parent',
        children: [{ id: 'nested', type: 'heading', props: { level: 3 }, content: 'Nested' }],
      },
      { id: 'empty', type: 'heading', props: { level: 2 }, content: '  ' },
      { id: 'last', type: 'heading', props: { level: 3 }, content: 'Last' },
    ]).map((entry) => entry.id)).toEqual(['nested', 'last'])
  })

  it('reads a heading as plain text, whatever its inline styles', () => {
    expect(outlineOf([
      { type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: 'Bold ', styles: { bold: true } }, { type: 'text', text: 'code', styles: { code: true } }] },
      { type: 'heading', props: { level: 2 }, content: 'Plain' },
    ])[0].text).toBe('Bold code')
  })

  it('is empty with fewer than two headings', () => {
    expect(outlineOf([
      { type: 'heading', props: { level: 1 }, content: 'Title' },
      { type: 'heading', props: { level: 2 }, content: 'Only one' },
      { type: 'paragraph', content: 'Body' },
    ])).toEqual([])
  })
})

describe('railLayout', () => {
  it('spaces the dashes 10px apart when they fit', () => {
    expect(railLayout(9, 3, 400)).toEqual({ pitch: 10, start: 0, end: 9 })
  })

  it('brings them closer, down to 4px, to fit the height', () => {
    expect(railLayout(60, 0, 300)).toEqual({ pitch: 5, start: 0, end: 60 })
  })

  it('past 4px shows the run around the current Section, kept inside the list', () => {
    expect(railLayout(200, 100, 400)).toEqual({ pitch: 4, start: 50, end: 150 })
    expect(railLayout(200, 3, 400)).toEqual({ pitch: 4, start: 0, end: 100 })
    expect(railLayout(200, 199, 400)).toEqual({ pitch: 4, start: 100, end: 200 })
    expect(railLayout(200, -1, 400)).toEqual({ pitch: 4, start: 0, end: 100 })
  })
})

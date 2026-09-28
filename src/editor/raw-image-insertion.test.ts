import { EditorState, Text } from '@codemirror/state'
import { history, undo } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import {
  insertRawImages,
  rawImageDropTargetAt,
  rawImageInsertion,
  rawImageMarkdown,
  type RawImageDropTarget,
} from './raw-image-insertion'

vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}))

function inserted(content: string, target: RawImageDropTarget, images: string[]): string {
  const doc = Text.of(content.split('\n'))
  const { from, insert } = rawImageInsertion(doc, target, images)
  return content.slice(0, from) + insert + content.slice(from)
}

describe('rawImageMarkdown', () => {
  it('writes the path Rich mode writes for an Attachment of a Document at the Folder root', () => {
    expect(rawImageMarkdown('asset://localhost/%2Fvault%2Fattachments%2Fshot.png', '/vault', '/vault/plan.md'))
      .toBe('![](attachments/shot.png)')
  })

  it('writes the path Rich mode writes for an Attachment of a Document in a subfolder', () => {
    expect(rawImageMarkdown('asset://localhost/%2Fvault%2Fnotes%2Fattachments%2Fshot.png', '/vault', '/vault/notes/plan.md'))
      .toBe('![](./attachments/shot.png)')
  })
})

describe('rawImageInsertion', () => {
  const content = '# Plan\n\nFirst paragraph.\nStill first.\n\nSecond paragraph.'

  it('puts an image dropped on the upper half of a line on its own before it, set apart as a paragraph', () => {
    expect(inserted(content, { line: 3, placement: 'before' }, ['![](attachments/a.png)']))
      .toBe('# Plan\n\n![](attachments/a.png)\n\nFirst paragraph.\nStill first.\n\nSecond paragraph.')
  })

  it('puts an image dropped on the lower half of a line on its own after it', () => {
    expect(inserted(content, { line: 4, placement: 'after' }, ['![](attachments/a.png)']))
      .toBe('# Plan\n\nFirst paragraph.\nStill first.\n\n![](attachments/a.png)\n\nSecond paragraph.')
  })

  it('splits a paragraph when dropped between two of its lines', () => {
    expect(inserted(content, { line: 3, placement: 'after' }, ['![](attachments/a.png)']))
      .toBe('# Plan\n\nFirst paragraph.\n\n![](attachments/a.png)\n\nStill first.\n\nSecond paragraph.')
  })

  it('puts several images in the order given, each on a line of its own', () => {
    expect(inserted(content, { line: 1, placement: 'after' }, ['![](attachments/a.png)', '![](attachments/b.png)', '![](attachments/c.png)']))
      .toBe('# Plan\n\n![](attachments/a.png)\n\n![](attachments/b.png)\n\n![](attachments/c.png)\n\nFirst paragraph.\nStill first.\n\nSecond paragraph.')
  })

  it('puts an image dropped after the last line at the end', () => {
    expect(inserted(content, { line: 6, placement: 'after' }, ['![](attachments/a.png)']))
      .toBe('# Plan\n\nFirst paragraph.\nStill first.\n\nSecond paragraph.\n\n![](attachments/a.png)')
    expect(inserted('Text\n', { line: 2, placement: 'after' }, ['![](attachments/a.png)']))
      .toBe('Text\n\n![](attachments/a.png)\n')
  })

  it('puts an image into an empty Document as its only line', () => {
    expect(inserted('', { line: 1, placement: 'before' }, ['![](attachments/a.png)'])).toBe('![](attachments/a.png)\n')
  })

  it('never puts an image inside the Frontmatter', () => {
    expect(inserted('---\ntitle: Plan\n---\n\n# Plan', { line: 2, placement: 'before' }, ['![](attachments/a.png)']))
      .toBe('---\ntitle: Plan\n---\n\n![](attachments/a.png)\n\n# Plan')
    expect(inserted('---\ntitle: Plan\n---', { line: 1, placement: 'after' }, ['![](attachments/a.png)']))
      .toBe('---\ntitle: Plan\n---\n\n![](attachments/a.png)')
  })
})

describe('rawImageDropTargetAt', () => {
  // Three 20px lines from y=50: line 1 is 50–70, line 2 70–90, line 3 90–110.
  function stubView() {
    const doc = Text.of(['one', 'two', 'three'])
    return {
      documentTop: 50,
      state: { doc },
      posAtCoords: vi.fn(({ y }: { x: number; y: number }) => doc.line(Math.min(3, Math.max(1, Math.floor((y - 50) / 20) + 1))).from),
      lineBlockAt: vi.fn((pos: number) => {
        const line = doc.lineAt(pos)
        return { from: line.from, to: line.to, top: (line.number - 1) * 20, height: 20 }
      }),
    } as unknown as Parameters<typeof rawImageDropTargetAt>[0]
  }

  it('reads the line under the pointer and the half of it the pointer is in', () => {
    const view = stubView()

    expect(rawImageDropTargetAt(view, { x: 10, y: 75 })).toEqual({ line: 2, placement: 'before' })
    expect(rawImageDropTargetAt(view, { x: 10, y: 85 })).toEqual({ line: 2, placement: 'after' })
  })

  it('reads a point below the last line as after it', () => {
    expect(rawImageDropTargetAt(stubView(), { x: 10, y: 400 })).toEqual({ line: 3, placement: 'after' })
  })
})

describe('insertRawImages', () => {
  it('inserts as one edit that a single undo takes back', () => {
    const view = new EditorView({ state: EditorState.create({ doc: 'One\n\nTwo', extensions: [history()] }) })

    insertRawImages(view, { line: 1, placement: 'after' }, ['![](attachments/a.png)', '![](attachments/b.png)'])
    expect(view.state.doc.toString()).toBe('One\n\n![](attachments/a.png)\n\n![](attachments/b.png)\n\nTwo')

    undo(view)
    expect(view.state.doc.toString()).toBe('One\n\nTwo')
    view.destroy()
  })
})

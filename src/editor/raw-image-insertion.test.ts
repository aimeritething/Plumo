import { EditorState, Text } from '@codemirror/state'
import { history, undo } from '@codemirror/commands'
import { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import {
  insertRawImages,
  pasteRawImages,
  rawImageDropTargetAt,
  rawImageInsertion,
  rawImageMarkdown,
  rawImagePasteInsertion,
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
      lineBlockAtHeight: vi.fn((height: number) => {
        const line = doc.line(Math.min(3, Math.max(1, Math.floor(height / 20) + 1)))
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

  it('reads a point out in the gutter or beside a short line by its height alone, as one on the line there', () => {
    const view = new EditorView({ state: EditorState.create({ doc: 'one\n\nthree\nfour' }), parent: document.body })
    const lineAt = (number: number) => {
      const block = view.lineBlockAt(view.state.doc.line(number).from)
      return { top: view.documentTop + block.top, bottom: view.documentTop + block.bottom }
    }

    expect(rawImageDropTargetAt(view, { x: -400, y: lineAt(3).top + 1 })).toEqual({ line: 3, placement: 'before' })
    expect(rawImageDropTargetAt(view, { x: 5000, y: lineAt(3).bottom - 1 })).toEqual({ line: 3, placement: 'after' })
    expect(rawImageDropTargetAt(view, { x: -400, y: lineAt(4).bottom - 1 })).toEqual({ line: 4, placement: 'after' })
    expect(rawImageDropTargetAt(view, { x: 5000, y: lineAt(1).top + 1 })).toEqual({ line: 1, placement: 'before' })
    view.destroy()
  })
})

describe('rawImagePasteInsertion', () => {
  const A = '![](attachments/a.png)'
  const B = '![](attachments/b.png)'

  /** `|` marks the caret; `[` and `]` a selection. */
  function pasted(marked: string, images: string[]): { content: string; caret: number } {
    const from = marked.search(/[|[]/u)
    const plain = marked.replace(/[|[\]]/gu, '')
    const to = marked.includes('[') ? marked.indexOf(']') - 1 : from
    const change = rawImagePasteInsertion(Text.of(plain.split('\n')), { from, to }, images)
    return { content: plain.slice(0, change.from) + change.insert + plain.slice(change.to), caret: change.caret }
  }

  it('puts the image on a line of its own after text the caret ends, set apart by a blank line', () => {
    expect(pasted('# Plan\n\nFirst.|\n\nSecond.', [A]).content).toBe(`# Plan\n\nFirst.\n\n${A}\n\nSecond.`)
    expect(pasted('# Plan\nFirst.|\nSecond.', [A]).content).toBe(`# Plan\nFirst.\n\n${A}\n\nSecond.`)
  })

  it('fills a blank line the caret is on, with a blank line kept on either side', () => {
    expect(pasted('One\n|\nTwo', [A]).content).toBe(`One\n\n${A}\n\nTwo`)
    expect(pasted('One\n\n|\n\nTwo', [A]).content).toBe(`One\n\n${A}\n\nTwo`)
  })

  it('splits the line at a caret inside it', () => {
    expect(pasted('Before| after', [A]).content).toBe(`Before\n\n${A}\n\n after`)
    expect(pasted('|Start', [A]).content).toBe(`${A}\n\nStart`)
  })

  it('replaces the selection, as a text paste would', () => {
    expect(pasted('Keep [this and that] too.', [A]).content).toBe(`Keep \n\n${A}\n\n too.`)
    expect(pasted('One\n[Two\nThree]\nFour', [A]).content).toBe(`One\n\n${A}\n\nFour`)
  })

  it('puts several images in the order given, and the caret after the last', () => {
    const { content, caret } = pasted('Text|', [A, B])

    expect(content).toBe(`Text\n\n${A}\n\n${B}`)
    expect(caret).toBe(content.length)
  })

  it('keeps the newline a Document ends with, and adds none it did not have', () => {
    expect(pasted('Text\n|', [A]).content).toBe(`Text\n\n${A}\n`)
    expect(pasted('Text|', [A]).content).toBe(`Text\n\n${A}`)
    expect(pasted('|', [A]).content).toBe(A)
  })

  it('never puts an image inside the Frontmatter, nor takes a selection there', () => {
    expect(pasted('---\ntitle: |Plan\n---\n\n# Plan', [A]).content).toBe(`---\ntitle: Plan\n---\n\n${A}\n\n# Plan`)
    expect(pasted('---\n[title: Plan]\n---\n# Plan', [A]).content).toBe(`---\ntitle: Plan\n---\n\n${A}\n\n# Plan`)
    expect(pasted('---\ntitle: Plan\n---|', [A]).content).toBe(`---\ntitle: Plan\n---\n\n${A}`)
  })
})

describe('pasteRawImages', () => {
  it('inserts at the selection as one paste edit that a single undo takes back, with the caret after it', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: 'One\n\nTwo', selection: { anchor: 3 }, extensions: [history()] }),
    })

    pasteRawImages(view, ['![](attachments/a.png)', '![](attachments/b.png)'])
    expect(view.state.doc.toString()).toBe('One\n\n![](attachments/a.png)\n\n![](attachments/b.png)\n\nTwo')
    expect(view.state.selection.main.head).toBe('One\n\n![](attachments/a.png)\n\n![](attachments/b.png)'.length)

    undo(view)
    expect(view.state.doc.toString()).toBe('One\n\nTwo')
    view.destroy()
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

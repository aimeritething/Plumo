import { describe, expect, it, vi } from 'vitest'
import { MARKDOWN_HIGHLIGHT_STYLE } from '@/kernel/markdown/markdown-highlight-markdown'
import {
  createMarkdownHighlightInputExtension,
  readMarkdownHighlightInputReplacement,
} from './markdown-highlight-input-extension'

function createTransaction() {
  const transaction = {
    addMark: vi.fn(() => transaction),
    delete: vi.fn(() => transaction),
    removeStoredMark: vi.fn(() => transaction),
    scrollIntoView: vi.fn(() => transaction),
  }
  return transaction
}

function createView(beforeText: string, parentStart = 0, parentTypeName = 'paragraph', leaves: Array<{ at: number; name: string }> = []) {
  const cursor = parentStart + beforeText.length + leaves.length
  const transaction = createTransaction()
  const highlightMark = { type: { name: MARKDOWN_HIGHLIGHT_STYLE } }
  const highlightMarkType = { create: vi.fn(() => highlightMark) }
  const backgroundColorMark = { type: { name: 'backgroundColor' } }
  const backgroundColorMarkType = { create: vi.fn(() => backgroundColorMark) }
  const docNodes: Array<{
    node: {
      isText?: boolean
      marks?: Array<{ type: { name: string } }>
      nodeSize?: number
    }
    pos: number
  }> = []
  const parent = {
    isTextblock: true,
    type: { name: parentTypeName },
    textBetween: vi.fn((
      _from: number,
      _to: number,
      _blockSeparator: string,
      leafText: (leaf: { type: { name: string } }) => string,
    ) => {
      let text = ''
      let consumed = 0
      for (const leaf of leaves) {
        text += beforeText.slice(consumed, leaf.at) + leafText({ type: { name: leaf.name } })
        consumed = leaf.at
      }
      return text + beforeText.slice(consumed)
    }),
  }
  const view = {
    composing: false,
    dispatch: vi.fn(),
    state: {
      doc: {
        nodesBetween: vi.fn((
          from: number,
          to: number,
          visit: (
            node: { isText?: boolean; marks?: Array<{ type: { name: string } }>; nodeSize?: number },
            pos: number,
          ) => boolean | void,
        ) => {
          for (const item of docNodes) {
            const nodeEnd = item.pos + (item.node.nodeSize ?? 1)
            if (nodeEnd < from || item.pos > to) continue
            if (visit(item.node, item.pos) === false) return
          }
        }),
      },
      schema: {
        marks: {
          backgroundColor: backgroundColorMarkType,
          [MARKDOWN_HIGHLIGHT_STYLE]: highlightMarkType,
        },
      },
      selection: {
        from: cursor,
        to: cursor,
        $from: {
          depth: 0,
          node: vi.fn(() => parent),
          parent,
          parentOffset: beforeText.length + leaves.length,
          marks: vi.fn(() => []),
        },
      },
      storedMarks: null as Array<{ type: { name: string } }> | null,
      tr: transaction,
    },
  }

  return {
    cursor,
    backgroundColorMark,
    backgroundColorMarkType,
    docNodes,
    highlightMark,
    highlightMarkType,
    transaction,
    view,
  }
}

function createFixture(
  beforeText = 'Plain ==marked=',
  parentStart = 0,
  parentTypeName = 'paragraph',
  leaves: Array<{ at: number; name: string }> = [],
) {
  let beforeInputListener: EventListener | null = null
  const {
    backgroundColorMark,
    backgroundColorMarkType,
    docNodes,
    highlightMark,
    highlightMarkType,
    transaction,
    view,
  } = createView(
    beforeText,
    parentStart,
    parentTypeName,
    leaves,
  )
  const dom = {
    addEventListener: vi.fn((type: string, listener: EventListener) => {
      if (type === 'beforeinput') {
        beforeInputListener = listener
      }
    }),
  }
  const editor = {
    _tiptapEditor: { view },
    prosemirrorView: view,
  }
  const extension = createMarkdownHighlightInputExtension()({ editor: editor as never })

  return {
    docNodes,
    backgroundColorMark,
    backgroundColorMarkType,
    dom,
    extension,
    fireInput(event: Partial<InputEvent> = {}) {
      if (!beforeInputListener) {
        throw new Error('Markdown highlight input extension did not register beforeinput')
      }

      const inputEvent = {
        data: '=',
        inputType: 'insertText',
        isComposing: false,
        preventDefault: vi.fn(),
        ...event,
      }

      beforeInputListener(inputEvent as InputEvent)
      return inputEvent
    },
    highlightMark,
    highlightMarkType,
    mount() {
      const controller = new AbortController()
      extension.mount?.({
        dom: dom as never,
        root: document,
        signal: controller.signal,
      })
      return controller
    },
    transaction,
    view,
  }
}

function expectNoHighlightTransform(fixture: ReturnType<typeof createFixture>, event: Partial<InputEvent> = {}) {
  const inputEvent = fixture.fireInput(event)

  expect(fixture.transaction.delete).not.toHaveBeenCalled()
  expect(fixture.transaction.addMark).not.toHaveBeenCalled()
  expect(fixture.view.dispatch).not.toHaveBeenCalled()
  expect(inputEvent.preventDefault).not.toHaveBeenCalled()
}

describe('createMarkdownHighlightInputExtension', () => {
  it('reads a completed highlight pair before the final equals is inserted', () => {
    expect(readMarkdownHighlightInputReplacement({
      beforeText: 'Plain ==marked=',
      cursor: 15,
      parentStart: 0,
    })).toEqual({
      closingFrom: 14,
      closingTo: 15,
      color: 'yellow',
      contentFrom: 8,
      contentTo: 14,
      openingFrom: 6,
      openingTo: 8,
    })
  })

  it('registers a beforeinput listener when the editor mounts', () => {
    const fixture = createFixture()

    fixture.mount()

    expect(fixture.dom.addEventListener).toHaveBeenCalledWith(
      'beforeinput',
      expect.any(Function),
      expect.objectContaining({
        capture: true,
        signal: expect.any(AbortSignal),
      }),
    )
  })

  it('turns typed ==highlight== syntax into the durable highlight mark', () => {
    const fixture = createFixture('Plain ==marked=', 20)
    fixture.mount()

    const event = fixture.fireInput()

    expect(fixture.transaction.delete).toHaveBeenNthCalledWith(1, 34, 35)
    expect(fixture.transaction.delete).toHaveBeenNthCalledWith(2, 26, 28)
    expect(fixture.highlightMarkType.create).toHaveBeenCalledWith()
    expect(fixture.transaction.addMark).toHaveBeenCalledWith(26, 32, fixture.highlightMark)
    expect(fixture.transaction.removeStoredMark).toHaveBeenCalledWith(fixture.highlightMarkType)
    expect(fixture.transaction.scrollIntoView).toHaveBeenCalled()
    expect(fixture.view.dispatch).toHaveBeenCalledWith(fixture.transaction)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('removes a Bear-style circle prefix and applies its background color mark', () => {
    const fixture = createFixture('Plain ==🔴marked=', 20)
    fixture.mount()

    const event = fixture.fireInput()

    expect(fixture.transaction.delete).toHaveBeenNthCalledWith(1, 36, 37)
    expect(fixture.transaction.delete).toHaveBeenNthCalledWith(2, 26, 30)
    expect(fixture.highlightMarkType.create).toHaveBeenCalledWith()
    expect(fixture.backgroundColorMarkType.create).toHaveBeenCalledWith({ stringValue: 'red' })
    expect(fixture.transaction.addMark).toHaveBeenNthCalledWith(1, 26, 32, fixture.highlightMark)
    expect(fixture.transaction.addMark).toHaveBeenNthCalledWith(2, 26, 32, fixture.backgroundColorMark)
    expect(fixture.transaction.removeStoredMark).toHaveBeenNthCalledWith(1, fixture.highlightMarkType)
    expect(fixture.transaction.removeStoredMark).toHaveBeenNthCalledWith(2, fixture.backgroundColorMarkType)
    expect(fixture.view.dispatch).toHaveBeenCalledWith(fixture.transaction)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('keeps document offsets when an inline leaf sits before the highlight in the paragraph', () => {
    // "see " + wikilink + " ==hi=" — the wikilink is one document position with no text.
    const fixture = createFixture('see  ==hi=', 20, 'paragraph', [{ at: 4, name: 'wikilink' }])
    fixture.mount()

    const event = fixture.fireInput()

    expect(fixture.transaction.delete).toHaveBeenNthCalledWith(1, 30, 31)
    expect(fixture.transaction.delete).toHaveBeenNthCalledWith(2, 26, 28)
    expect(fixture.transaction.addMark).toHaveBeenCalledWith(26, 28, fixture.highlightMark)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
  })

  it('completes a highlight typed after a hard break', () => {
    const fixture = createFixture('line one==two=', 20, 'paragraph', [{ at: 8, name: 'hardBreak' }])
    fixture.mount()

    fixture.fireInput()

    // "line one" (8) + break (1) = 9; the opening "==" sits at 29, "two" at 31–34.
    expect(fixture.transaction.delete).toHaveBeenNthCalledWith(2, 29, 31)
    expect(fixture.transaction.addMark).toHaveBeenCalledWith(29, 32, fixture.highlightMark)
  })

  it('refuses a highlight that would span a hard break', () => {
    const fixture = createFixture('==a b=', 0, 'paragraph', [{ at: 3, name: 'hardBreak' }])
    fixture.mount()

    expectNoHighlightTransform(fixture)
  })

  it('leaves highlight-looking syntax literal inside inline code', () => {
    const fixture = createFixture()
    fixture.view.state.storedMarks = [{ type: { name: 'code' } }]
    fixture.mount()

    expectNoHighlightTransform(fixture)
  })

  it('leaves completed highlight syntax literal inside code blocks', () => {
    const fixture = createFixture('if a=="1" and b=', 0, 'codeBlock')
    fixture.mount()

    expectNoHighlightTransform(fixture)
  })

  it('leaves highlight-looking syntax literal when existing content has code marks', () => {
    const fixture = createFixture()
    fixture.docNodes.push({
      node: {
        isText: true,
        marks: [{ type: { name: 'code' } }],
        nodeSize: 6,
      },
      pos: 8,
    })
    fixture.mount()

    expectNoHighlightTransform(fixture)
  })
})

import { Schema, type Node as ProsemirrorNode } from '@tiptap/pm/model'
import { EditorState, Plugin } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { FilePanelExtension, FormattingToolbarExtension, LinkToolbarExtension, SuggestionMenu } from '@blocknote/core/extensions'
import { describe, expect, it } from 'vitest'
import {
  collectRichFindMatches,
  createRichEditorFindPlugin,
  isRichFindEscape,
  richFindDecorations,
  richFindPluginKey,
  setRichFindState,
  type RichFindOverlayOwner,
} from './rich-editor-find'
import { richEditorBlockSelectionPluginKey } from './rich-editor-block-selection-extension'

// A schema small enough to reason about: paragraphs of text with an inline
// leaf (an image), which is what a Document's inline content looks like to
// the matcher. Positions: the first paragraph opens at 0, its text starts at 1.
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    image: { group: 'inline', inline: true, attrs: { src: { default: '' } }, toDOM: () => ['img'] },
  },
  marks: { strong: { toDOM: () => ['strong', 0] } },
})

const paragraph = (...content: ProsemirrorNode[]) => schema.node('paragraph', null, content)
const text = (value: string) => schema.text(value)
const strong = (value: string) => schema.text(value, [schema.mark('strong')])

// Paragraph 1: "Welcome to Plumo. Welcome back." (31 chars, positions 1..32, node 0..33).
// Paragraph 2 opens at 33; "A picture " 34..44, the image at 44, " and welcome." from 45.
const doc = schema.node('doc', null, [
  paragraph(text('Welcome to '), strong('Plumo'), text('. Welcome back.')),
  paragraph(text('A picture '), schema.node('image'), text(' and welcome.')),
])

const CASE_INSENSITIVE = { caseSensitive: false, regex: false }

describe('collectRichFindMatches', () => {
  it('finds every occurrence across marks and blocks, as document positions', () => {
    const { matches, error } = collectRichFindMatches(doc, 'welcome', CASE_INSENSITIVE)
    expect(error).toBeNull()
    expect(matches).toEqual([{ from: 1, to: 8 }, { from: 19, to: 26 }, { from: 50, to: 57 }])
    for (const match of matches) expect(doc.textBetween(match.from, match.to).toLowerCase()).toBe('welcome')
  })

  it('matches text that spans a mark boundary', () => {
    const { matches } = collectRichFindMatches(doc, 'to Plumo.', CASE_INSENSITIVE)
    expect(matches).toEqual([{ from: 9, to: 18 }])
    expect(doc.textBetween(9, 18)).toBe('to Plumo.')
  })

  it('never matches across an inline leaf or across blocks', () => {
    expect(collectRichFindMatches(doc, 'picture  and', CASE_INSENSITIVE).matches).toEqual([])
    expect(collectRichFindMatches(doc, 'back.A picture', CASE_INSENSITIVE).matches).toEqual([])
  })

  it('honours case sensitivity and regex, and reports a bad regex', () => {
    expect(collectRichFindMatches(doc, 'welcome', { caseSensitive: true, regex: false }).matches).toEqual([{ from: 50, to: 57 }])
    expect(collectRichFindMatches(doc, 'w.lcome', { caseSensitive: false, regex: true }).matches).toHaveLength(3)
    expect(collectRichFindMatches(doc, '(', { caseSensitive: false, regex: true })).toMatchObject({ error: 'Invalid regex', matches: [] })
  })

  it('finds nothing for an empty query', () => {
    expect(collectRichFindMatches(doc, '', CASE_INSENSITIVE)).toEqual({ error: null, matches: [] })
  })
})

describe('the find plugin', () => {
  it('decorates every match, the active one distinctly, and follows edits to the document', () => {
    const plugin = createRichEditorFindPlugin()
    let state = EditorState.create({ doc, plugins: [plugin] })
    expect(richFindDecorations(state).find()).toEqual([])

    state = state.apply(setRichFindState(state.tr, { query: 'welcome', options: CASE_INSENSITIVE, activeIndex: 1 }))
    const decorations = richFindDecorations(state).find()
    expect(decorations.map((decoration) => [decoration.from, decoration.to])).toEqual([[1, 8], [19, 26], [50, 57]])
    expect(decorations.map((decoration) => decoration.spec.active)).toEqual([false, true, false])

    // Typing before the first match moves every match along.
    state = state.apply(state.tr.insertText('Hi. ', 1))
    expect(richFindDecorations(state).find().map((decoration) => [decoration.from, decoration.to])).toEqual([[5, 12], [23, 30], [54, 61]])
    expect(richFindPluginKey.getState(state)?.matches).toHaveLength(3)

    // Clearing the query clears the decorations.
    state = state.apply(setRichFindState(state.tr, { query: '', options: CASE_INSENSITIVE, activeIndex: 0 }))
    expect(richFindDecorations(state).find()).toEqual([])
  })
})

describe('isRichFindEscape', () => {
  function bodyView(plugins: Plugin[] = []) {
    const dom = document.createElement('div')
    return { dom, composing: false, state: EditorState.create({ doc, plugins }) } as unknown as EditorView
  }
  const escape = (view: EditorView, init: KeyboardEventInit = {}, target: EventTarget = view.dom) => {
    const event = new KeyboardEvent('keydown', { key: 'Escape', ...init })
    Object.defineProperty(event, 'target', { value: target })
    return event
  }

  it('takes a plain esc from the caret in the body', () => {
    const view = bodyView()
    expect(isRichFindEscape({}, view, escape(view))).toBe(true)
  })

  it('leaves esc to the input method, to a modifier, and to an input inside the Document', () => {
    const view = bodyView()
    expect(isRichFindEscape({}, view, escape(view, { keyCode: 229 }))).toBe(false)
    expect(isRichFindEscape({}, view, escape(view, { isComposing: true }))).toBe(false)
    expect(isRichFindEscape({}, view, escape(view, { shiftKey: true }))).toBe(false)
    expect(isRichFindEscape({}, view, escape(view, {}, document.createElement('input')))).toBe(false)
  })

  it('leaves esc to a block selection, which it clears', () => {
    const selected = new Plugin({ key: richEditorBlockSelectionPluginKey, state: { init: () => ({ blockIds: ['a'] }), apply: (_tr, value) => value } })
    const view = bodyView([selected])
    expect(isRichFindEscape({}, view, escape(view))).toBe(false)
  })

  it.each([
    ['the slash menu', SuggestionMenu, { shown: () => true }],
    ['the formatting toolbar', FormattingToolbarExtension, { store: { state: true } }],
    ['the file panel', FilePanelExtension, { store: { state: 'block-id' } }],
    ['the link toolbar', LinkToolbarExtension, { getLinkAtSelection: () => ({}) }],
  ])('leaves esc to %s while it is open', (_name, open, extension) => {
    const view = bodyView()
    const editor = { getExtension: ((asked: unknown) => (asked === open ? extension : undefined)) } as RichFindOverlayOwner
    expect(isRichFindEscape(editor, view, escape(view))).toBe(false)
  })
})

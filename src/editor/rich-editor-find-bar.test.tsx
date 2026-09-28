import { Schema } from '@tiptap/pm/model'
import { EditorState, type Transaction } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { act, fireEvent, render as renderBare, screen } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { SuggestionMenu } from '@blocknote/core/extensions'
import { RichEditorFindBar, type RichEditorFindBarProps, type RichFindEditor } from './rich-editor-find-bar'
import { useEditorFindSession } from './editor-find-session'
import { createRichEditorFindPlugin, richFindDecorations } from '@/kernel/blocknote/rich-editor-find'
import type { ReactElement } from 'react'
import { TooltipProvider } from '@/ui/tooltip'

// Every render sits in the one tooltip provider main.tsx gives the app.
const render = (ui: ReactElement) => renderBare(ui, { wrapper: TooltipProvider })

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'inline*', group: 'block', toDOM: () => ['p', 0] },
    text: { group: 'inline' },
  },
})

/** A stand-in for the BlockNote editor: a real ProseMirror state behind a view that only applies transactions. */
function fakeEditor(text: string) {
  let state = EditorState.create({
    doc: schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]),
    plugins: [createRichEditorFindPlugin()],
  })
  const listeners = new Set<() => void>()
  const focus = vi.fn()
  // Where the view says a position is drawn: one element, so a test can see the match being scrolled to.
  const matchElement = document.createElement('span')
  matchElement.scrollIntoView = vi.fn()
  // The editable the caret is in, for a key typed in the body.
  const dom = document.createElement('div')
  document.body.appendChild(dom)
  onTestFinished(() => dom.remove())
  const view = {
    get state() { return state },
    isDestroyed: false,
    composing: false,
    dom,
    focus,
    domAtPos: () => ({ node: matchElement, offset: 0 }),
    dispatch(tr: Transaction) {
      state = state.apply(tr)
      if (tr.docChanged) listeners.forEach((listener) => listener())
    },
  }
  const editor: RichFindEditor = {
    prosemirrorView: view as unknown as EditorView,
    onChange: (callback) => {
      listeners.add(callback)
      return () => { listeners.delete(callback) }
    },
  }
  return {
    editor,
    dom,
    focus,
    state: () => state,
    scrolledTo: vi.mocked(matchElement.scrollIntoView),
    decorations: () => richFindDecorations(state).find(),
    type: (value: string) => view.dispatch(state.tr.insertText(value, 1)),
  }
}

/** The bar under the editor pane's find session, as the shell mounts it. */
function RichFind(props: Omit<RichEditorFindBarProps, 'find'>) {
  const find = useEditorFindSession(props.path)
  return <RichEditorFindBar {...props} find={find} />
}

const PATH = '/n/a.md'
const request = (id: number, path = PATH) => ({ id, path, replace: false })
const input = () => screen.getByTestId('rich-editor-find-input')
const count = () => screen.getByTestId('rich-editor-find-count')

describe('RichEditorFindBar', () => {
  it('stays closed with no request, and ignores a request for another Document', () => {
    const { editor } = fakeEditor('one')
    const view = render(<RichFind editor={editor} path={PATH} request={null} />)
    expect(screen.queryByTestId('rich-editor-find-bar')).toBeNull()

    view.rerender(<RichFind editor={editor} path={PATH} request={request(1, '/n/b.md')} />)
    expect(screen.queryByTestId('rich-editor-find-bar')).toBeNull()
  })

  it('opens on a request, counts and highlights the matches, and walks them with ↵ and ⇧↵', () => {
    const fake = fakeEditor('Welcome to Plumo. Welcome back, and welcome again.')
    render(<RichFind editor={fake.editor} path={PATH} request={request(1)} />)
    expect(count()).toHaveTextContent('No matches')

    fireEvent.change(input(), { target: { value: 'welcome' } })
    expect(count()).toHaveTextContent('1 / 3')
    expect(fake.decorations().map((decoration) => decoration.spec.active)).toEqual([true, false, false])

    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(count()).toHaveTextContent('2 / 3')
    expect(fake.decorations().map((decoration) => decoration.spec.active)).toEqual([false, true, false])
    // The editor's selection moved onto the current match.
    const { from, to } = fake.state().selection
    expect(fake.state().doc.textBetween(from, to)).toBe('Welcome')
    expect(from).toBe(19)

    fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true })
    expect(count()).toHaveTextContent('1 / 3')
    fireEvent.keyDown(input(), { key: 'Enter', shiftKey: true })
    expect(count()).toHaveTextContent('3 / 3')
  })

  // Typing used to highlight only: with every match below the fold the bar said
  // "1 / 7" over a page that showed none, and the first ↵ went to the second.
  it('shows the first match as the query is typed: selected, and scrolled to the middle of the view', () => {
    const fake = fakeEditor('Welcome to Plumo. Welcome back.')
    render(<RichFind editor={fake.editor} path={PATH} request={request(1)} />)

    fireEvent.change(input(), { target: { value: 'welcome' } })

    const { from, to } = fake.state().selection
    expect([from, to]).toEqual([1, 8])
    expect(fake.scrolledTo).toHaveBeenLastCalledWith({ block: 'center' })

    fireEvent.change(input(), { target: { value: 'back' } })
    expect(fake.state().doc.textBetween(fake.state().selection.from, fake.state().selection.to)).toBe('back')
  })

  it('shows the first match again when an option changes what matches', () => {
    const fake = fakeEditor('welcome, Welcome.')
    render(<RichFind editor={fake.editor} path={PATH} request={request(1)} />)
    fireEvent.change(input(), { target: { value: 'Welcome' } })
    expect(fake.state().selection.from).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: /case/i }))

    expect(fake.state().selection.from).toBe(10)
  })

  it('leaves the selection alone when an edit changes the matches', () => {
    const fake = fakeEditor('Welcome.')
    render(<RichFind editor={fake.editor} path={PATH} request={request(1)} />)
    fireEvent.change(input(), { target: { value: 'welcome' } })
    fake.scrolledTo.mockClear()

    act(() => fake.type('Welcome again. '))

    expect(count()).toHaveTextContent('1 / 2')
    expect(fake.scrolledTo).not.toHaveBeenCalled()
  })

  it('follows an edit to the Document', () => {
    const fake = fakeEditor('Welcome.')
    render(<RichFind editor={fake.editor} path={PATH} request={request(1)} />)
    fireEvent.change(input(), { target: { value: 'welcome' } })
    expect(count()).toHaveTextContent('1 / 1')

    act(() => fake.type('Welcome, '))
    expect(count()).toHaveTextContent('1 / 2')
    expect(fake.decorations()).toHaveLength(2)
  })

  it('honours the case and regex toggles', () => {
    const fake = fakeEditor('Welcome and welcome.')
    render(<RichFind editor={fake.editor} path={PATH} request={request(1)} />)
    fireEvent.change(input(), { target: { value: 'welcome' } })
    expect(count()).toHaveTextContent('1 / 2')

    fireEvent.click(screen.getByRole('button', { name: 'Match case' }))
    expect(count()).toHaveTextContent('1 / 1')

    fireEvent.click(screen.getByRole('button', { name: 'Use regular expression' }))
    fireEvent.change(input(), { target: { value: 'w(' } })
    expect(count()).toHaveTextContent('Invalid regex')
  })

  it.each([
    { name: 'while composing', init: { isComposing: true } },
    { name: 'ending a composition (keyCode 229)', init: { keyCode: 229 } },
  ])('leaves ↵ and esc to the input method $name', ({ init }) => {
    const fake = fakeEditor('Welcome to Plumo. Welcome back.')
    render(<RichFind editor={fake.editor} path={PATH} request={request(1)} />)
    fireEvent.change(input(), { target: { value: 'welcome' } })

    expect(fireEvent.keyDown(input(), { key: 'Enter', ...init })).toBe(true)
    expect(count()).toHaveTextContent('1 / 2')
    expect(fireEvent.keyDown(input(), { key: 'Escape', ...init })).toBe(true)
    expect(screen.getByTestId('rich-editor-find-bar')).toBeInTheDocument()
  })

  it('esc closes the bar, clears the highlights and hands focus back to the editor; a new request reopens it', () => {
    const fake = fakeEditor('Welcome.')
    const view = render(<RichFind editor={fake.editor} path={PATH} request={request(1)} />)
    fireEvent.change(input(), { target: { value: 'welcome' } })
    expect(fake.decorations()).toHaveLength(1)

    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(screen.queryByTestId('rich-editor-find-bar')).toBeNull()
    expect(fake.decorations()).toEqual([])
    expect(fake.focus).toHaveBeenCalled()

    view.rerender(<RichFind editor={fake.editor} path={PATH} request={request(2)} />)
    expect(screen.getByTestId('rich-editor-find-bar')).toBeInTheDocument()
    expect(fake.decorations()).toHaveLength(1)
  })

  // AIM-482: after a click into the Document, esc selected the caret's block
  // and the bar stayed open with its highlights.
  it('closes on esc in the Document body and clears the highlights', () => {
    const fake = fakeEditor('Welcome.')
    render(<RichFind editor={fake.editor} path={PATH} request={request(1)} />)
    fireEvent.change(input(), { target: { value: 'welcome' } })

    const handled = !fireEvent.keyDown(fake.dom, { key: 'Escape' })

    expect(handled).toBe(true)
    expect(screen.queryByTestId('rich-editor-find-bar')).toBeNull()
    expect(fake.decorations()).toEqual([])
  })

  it('leaves esc in the body to an open menu, and to the input method', () => {
    const fake = fakeEditor('Welcome.')
    let menuShown = true
    const editor: RichFindEditor = {
      ...fake.editor,
      getExtension: ((extension: unknown) => (extension === SuggestionMenu ? { shown: () => menuShown } : undefined)) as RichFindEditor['getExtension'],
    }
    render(<RichFind editor={editor} path={PATH} request={request(1)} />)

    expect(fireEvent.keyDown(fake.dom, { key: 'Escape' })).toBe(true)
    menuShown = false
    expect(fireEvent.keyDown(fake.dom, { key: 'Escape', keyCode: 229 })).toBe(true)
    expect(screen.getByTestId('rich-editor-find-bar')).toBeInTheDocument()

    fireEvent.keyDown(fake.dom, { key: 'Escape' })
    expect(screen.queryByTestId('rich-editor-find-bar')).toBeNull()
  })
})

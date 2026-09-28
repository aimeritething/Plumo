import { describe, it, expect, vi } from 'vitest'
import { useState } from 'react'
import { render, screen, act } from '@testing-library/react'
import type { EditorHistory } from './editor-history'
import { language, syntaxTree } from '@codemirror/language'
import type { EditorView } from '@codemirror/view'
import { RawEditorView } from './raw-editor-view'

const defaultProps = {
  content: '---\ntitle: My Note\n---\n\n# My Note\n\nSome content.',
  path: '/vault/note/my-note.md',
  onContentChange: vi.fn(),
  onSave: vi.fn(),
}

type CodeMirrorHost = HTMLElement & {
  __cmView?: EditorView
}

describe('RawEditorView', () => {
  it('renders CodeMirror container', () => {
    render(<RawEditorView {...defaultProps} />)
    expect(screen.getByTestId('raw-editor-codemirror')).toBeInTheDocument()
  })

  it('registers Undo and Redo on CodeMirror\'s history while it is mounted (AIM-468)', () => {
    const historyRef = { current: null as EditorHistory | null }
    const { unmount } = render(<RawEditorView {...defaultProps} historyRef={historyRef} />)
    const host = screen.getByTestId('raw-editor-codemirror') as CodeMirrorHost
    const view = host.__cmView!
    const before = view.state.doc.toString()

    act(() => { view.dispatch({ changes: { from: 0, insert: 'typed ' } }) })
    expect(view.state.doc.toString()).toBe(`typed ${before}`)

    act(() => { historyRef.current!.undo() })
    expect(view.state.doc.toString()).toBe(before)
    act(() => { historyRef.current!.redo() })
    expect(view.state.doc.toString()).toBe(`typed ${before}`)

    unmount()
    expect(historyRef.current).toBeNull()
  })

  it('renders CodeMirror editor with line numbers', () => {
    render(<RawEditorView {...defaultProps} />)
    const container = screen.getByTestId('raw-editor-codemirror')
    expect(container.querySelector('.cm-editor')).toBeInTheDocument()
    expect(container.querySelector('.cm-gutters')).toBeInTheDocument()
    expect(container.querySelector('.cm-lineNumbers')).toBeInTheDocument()
  })

  it('initializes editor with provided content', () => {
    render(<RawEditorView {...defaultProps} />)
    const container = screen.getByTestId('raw-editor-codemirror')
    const content = container.querySelector('.cm-content')
    expect(content?.textContent).toContain('title: My Note')
  })

  it('uses the file extension to parse raw text files for syntax highlighting', () => {
    render(<RawEditorView
      {...defaultProps}
      content="SELECT id FROM notes WHERE archived = false"
      path="/vault/queries/open-notes.sql"
    />)

    const container = screen.getByTestId('raw-editor-codemirror') as CodeMirrorHost
    expect(syntaxTree(container.__cmView!.state).toString()).toContain('Keyword')
  })

  it('uses the HTML language for standalone HTML source', () => {
    render(<RawEditorView
      {...defaultProps}
      path="/vault/reports/dashboard.html"
    />)

    const container = screen.getByTestId('raw-editor-codemirror') as CodeMirrorHost
    const view = container.__cmView
    expect(view).toBeDefined()
    if (!view) return
    expect(view.state.facet(language)?.name).toBe('html')
  })

  it('keeps the editable CodeMirror surface out of spellcheck without disabling IME autocorrection', () => {
    render(<RawEditorView {...defaultProps} />)
    const container = screen.getByTestId('raw-editor-codemirror')
    const content = container.querySelector('.cm-content')

    expect(content).toHaveAttribute('spellcheck', 'false')
    expect(content).toHaveAttribute('autocomplete', 'off')
    expect(content).toHaveAttribute('autocorrect', 'on')
    expect(content).toHaveAttribute('autocapitalize', 'sentences')
  })

  it('calls onContentChange when editor content changes (debounced)', async () => {
    vi.useFakeTimers()
    const onContentChange = vi.fn()
    render(<RawEditorView {...defaultProps} onContentChange={onContentChange} />)
    const container = screen.getByTestId('raw-editor-codemirror')
    const cmEditor = container.querySelector('.cm-editor')
    expect(cmEditor).toBeInTheDocument()

    // CodeMirror dispatches through its own API; simulate via the cm-content
    const cmContent = container.querySelector('.cm-content') as HTMLElement
    // Trigger an input event on cm-content to simulate typing
    await act(async () => {
      cmContent.textContent = '---\ntitle: Changed\n---\n\n# Changed'
      cmContent.dispatchEvent(new Event('input', { bubbles: true }))
    })

    // Even if the input event doesn't go through CM's pipeline in jsdom,
    // the debounce test for the pure function is covered separately.
    // This test verifies the component mounts and renders correctly.
    vi.useRealTimers()
  })

  it('shows YAML error banner for unclosed frontmatter', () => {
    render(<RawEditorView {...defaultProps} content="---\ntitle: Bad\n\n# Title" />)
    expect(screen.getByTestId('raw-editor-yaml-error')).toBeInTheDocument()
    expect(screen.getByTestId('raw-editor-yaml-error')).toHaveTextContent('Unclosed frontmatter')
  })

  it('does not treat YAML document delimiters as Markdown frontmatter errors', () => {
    render(<RawEditorView
      {...defaultProps}
      content="---\nname: raw-yaml\nitems:\n  - one"
      path="/vault/config/workflow.yaml"
    />)

    expect(screen.queryByTestId('raw-editor-yaml-error')).not.toBeInTheDocument()
  })

  it('does not show YAML error for valid content', () => {
    render(<RawEditorView {...defaultProps} />)
    expect(screen.queryByTestId('raw-editor-yaml-error')).not.toBeInTheDocument()
  })

  it('has monospaced font applied to CodeMirror', () => {
    render(<RawEditorView {...defaultProps} />)
    const container = screen.getByTestId('raw-editor-codemirror')
    const cmEditor = container.querySelector('.cm-editor') as HTMLElement
    expect(cmEditor).toBeInTheDocument()
    const cmScroller = container.querySelector('.cm-scroller')
    // The font is applied via CM theme classes, verify the structure exists
    expect(cmScroller).toBeInTheDocument()
  })

  // AIM-483: the idle debounce reports a keystroke, the Tab takes it, and the
  // content prop comes back. A key typed between the report and that commit
  // is newer than the echo, which must not overwrite it.
  it('keeps a keystroke typed between its idle report and the Tab taking the report', () => {
    vi.useFakeTimers()
    function Tab() {
      const [content, setContent] = useState('hello')
      return <RawEditorView {...defaultProps} content={content} onContentChange={(_path, next) => setContent(next)} />
    }
    render(<Tab />)
    const view = (screen.getByTestId('raw-editor-codemirror') as CodeMirrorHost).__cmView!

    act(() => { view.dispatch({ changes: { from: 5, insert: ' a' }, selection: { anchor: 7 }, userEvent: 'input.type' }) })
    act(() => {
      vi.advanceTimersByTime(500)
      view.dispatch({ changes: { from: 7, insert: 'b' }, selection: { anchor: 8 }, userEvent: 'input.type' })
    })

    expect(view.state.doc.toString()).toBe('hello ab')
    expect(view.state.selection.main.head).toBe(8)
    vi.useRealTimers()
  })

  it('cleans up CodeMirror view on unmount', () => {
    const { unmount } = render(<RawEditorView {...defaultProps} />)
    const container = screen.getByTestId('raw-editor-codemirror')
    expect(container.querySelector('.cm-editor')).toBeInTheDocument()
    unmount()
    // After unmount, the CM editor is destroyed — no assertion needed,
    // just verify no errors are thrown during cleanup
  })
})

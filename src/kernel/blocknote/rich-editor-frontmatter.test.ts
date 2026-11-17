import { describe, expect, it, vi } from 'vitest'
import { redo, undo } from '@tiptap/pm/history'
import { createEditor } from './rich-editor-frontmatter.test-utils'
import {
  resetRichEditorFrontmatter,
  RICH_FRONTMATTER_RESET_META,
  richEditorFrontmatter,
  richFrontmatterFromState,
  setRichEditorFrontmatter,
} from './rich-editor-frontmatter'
import { RICH_EDITOR_EXTERNAL_CHANGE_EVENT } from './editor-external-change-events'

describe('rich editor Frontmatter', () => {
  it('holds what an edit set, for the path it was set for', () => {
    const { editor, state } = createEditor()
    setRichEditorFrontmatter(editor, '/a.md', '---\na: 1\n---\n', '---\na: 2\n---\n')
    expect(richFrontmatterFromState(state(), '/a.md')).toBe('---\na: 2\n---\n')
    expect(richFrontmatterFromState(state(), '/b.md')).toBeNull()
    expect(richEditorFrontmatter(editor, '/a.md')).toBe('---\na: 2\n---\n')
  })

  it('leaves the blocks alone', () => {
    const { editor, state, typeText } = createEditor()
    typeText('body')
    const before = state().doc
    setRichEditorFrontmatter(editor, '/a.md', '', '---\na:\n---\n')
    expect(state().doc.eq(before)).toBe(true)
  })

  it('makes each edit one Undo step of the body history, apart from the typing around it', () => {
    const { editor, state, run, typeText } = createEditor()
    typeText('x')
    setRichEditorFrontmatter(editor, '/a.md', 'v1', 'v2')
    setRichEditorFrontmatter(editor, '/a.md', 'v2', 'v3')
    typeText('y')

    run(undo)
    expect(state().doc.textContent).toBe('x')
    expect(richFrontmatterFromState(state(), '/a.md')).toBe('v3')
    run(undo)
    expect(richFrontmatterFromState(state(), '/a.md')).toBe('v2')
    run(undo)
    expect(richFrontmatterFromState(state(), '/a.md')).toBe('v1')
    expect(state().doc.textContent).toBe('x')
    run(redo)
    expect(richFrontmatterFromState(state(), '/a.md')).toBe('v2')
  })

  it('announces an edit, its Undo and its Redo as an editor change, since TipTap will not', () => {
    const { editor, run } = createEditor()
    const heard = vi.fn()
    window.addEventListener(RICH_EDITOR_EXTERNAL_CHANGE_EVENT, heard)
    setRichEditorFrontmatter(editor, '/a.md', 'v1', 'v2')
    run(undo)
    run(redo)
    window.removeEventListener(RICH_EDITOR_EXTERNAL_CHANGE_EVENT, heard)
    expect(heard).toHaveBeenCalledTimes(3)
  })

  it('drops what it held on a reset or a content swap, off the Undo history', () => {
    const { editor, state, run } = createEditor()
    setRichEditorFrontmatter(editor, '/a.md', 'v1', 'v2')
    resetRichEditorFrontmatter(editor)
    expect(richFrontmatterFromState(state(), '/a.md')).toBeNull()

    setRichEditorFrontmatter(editor, '/a.md', 'v1', 'v3')
    editor.prosemirrorView.dispatch(state().tr.insertText('swap', 1).setMeta('addToHistory', false).setMeta(RICH_FRONTMATTER_RESET_META, true))
    expect(richFrontmatterFromState(state(), '/a.md')).toBeNull()
    run(undo)
    expect(richFrontmatterFromState(state(), '/a.md')).toBe('v1')
  })

  it('does nothing for an edit that changes nothing', () => {
    const { editor, state } = createEditor()
    setRichEditorFrontmatter(editor, '/a.md', 'v1', 'v1')
    expect(richFrontmatterFromState(state(), '/a.md')).toBeNull()
  })
})

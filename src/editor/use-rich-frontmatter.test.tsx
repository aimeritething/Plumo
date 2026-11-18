import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { undo } from '@tiptap/pm/history'
import { createEditor } from '@/kernel/blocknote/rich-editor-frontmatter.test-utils'
import { richFrontmatterFromState } from '@/kernel/blocknote/rich-editor-frontmatter'
import { useRichFrontmatter } from './use-rich-frontmatter'

const PATH = '/a.md'
const fm = (value: string) => `---\ntitle: ${value}\n---\n`
const doc = (value: string) => `${fm(value)}# Body\n`

function renderFrontmatter(tabContent: string) {
  const { editor, state, run } = createEditor()
  const hook = renderHook(({ content }: { content: string }) => useRichFrontmatter(editor, PATH, content), {
    initialProps: { content: tabContent },
  })
  return {
    hook,
    editor,
    held: () => richFrontmatterFromState(state(), PATH),
    commit: (next: string) => act(() => { hook.result.current.commit(next) }),
    tab: (content: string) => act(() => { hook.rerender({ content }) }),
    undo: () => act(() => { run(undo) }),
  }
}

describe('useRichFrontmatter', () => {
  it('shows the Tab\'s Frontmatter until an edit, then the edit\'s', () => {
    const { hook, commit } = renderFrontmatter(doc('A'))
    expect(hook.result.current.frontmatter).toBe(fm('A'))
    commit(fm('B'))
    expect(hook.result.current.frontmatter).toBe(fm('B'))
  })

  it('keeps an edit while the Tab catches up with it', () => {
    const { hook, commit, tab, held } = renderFrontmatter(doc('A'))
    commit(fm('B'))
    tab(doc('B'))
    expect(held()).toBe(fm('B'))
    expect(hook.result.current.frontmatter).toBe(fm('B'))
  })

  it('keeps a second edit when the Tab is still catching up with the first', () => {
    const { hook, commit, tab, held } = renderFrontmatter(doc('A'))
    commit(fm('B'))
    commit(fm('C'))
    // Autosave serialized the editor between the two edits: the Tab shows the first.
    tab(doc('B'))
    expect(held()).toBe(fm('C'))
    expect(hook.result.current.frontmatter).toBe(fm('C'))
    tab(doc('C'))
    expect(held()).toBe(fm('C'))
  })

  it('keeps what an Undo put back while the Tab catches up with that', () => {
    const { hook, commit, tab, undo, held } = renderFrontmatter(doc('A'))
    commit(fm('B'))
    tab(doc('B'))
    undo()
    expect(hook.result.current.frontmatter).toBe(fm('A'))
    tab(doc('A'))
    expect(held()).toBe(fm('A'))
  })

  it('drops an edit when the Tab changes to something the editor never wrote', () => {
    const { hook, commit, tab, held } = renderFrontmatter(doc('A'))
    commit(fm('B'))
    tab(doc('B'))
    tab(doc('Z'))
    expect(held()).toBeNull()
    expect(hook.result.current.frontmatter).toBe(fm('Z'))
  })

  it('leaves the editor alone while it holds nothing', () => {
    const { hook, tab, held } = renderFrontmatter(doc('A'))
    tab(doc('Z'))
    expect(held()).toBeNull()
    expect(hook.result.current.frontmatter).toBe(fm('Z'))
  })
})

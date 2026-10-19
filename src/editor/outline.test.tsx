import { BlockNoteEditor, type PartialBlock } from '@blocknote/core'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { editorBlockElement, type RichEditor } from '@/kernel/blocknote/block-note-dom'
import { isCollapsedBlock, toggleCollapsedHeading } from '@/kernel/blocknote/collapsed-sections'
import { Outline } from './outline'

const ARTICLE: PartialBlock[] = [
  { id: 'title', type: 'heading', props: { level: 1 }, content: 'Keeping a Markdown folder in sync with git' },
  { type: 'paragraph', content: 'I keep every note I write in one folder.' },
  { id: 'why', type: 'heading', props: { level: 2 }, content: 'Why git at all' },
  { type: 'paragraph', content: 'A sync service is easier on day one.' },
  { id: 'setup', type: 'heading', props: { level: 2 }, content: 'Setting it up' },
  { id: 'one', type: 'heading', props: { level: 3 }, content: 'One: create the repository' },
  { type: 'paragraph', content: 'git init' },
  { id: 'conflicts', type: 'heading', props: { level: 2 }, content: 'What about conflicts' },
]

/** A Rich surface: the editor mounted in a scroll area whose editor box sits `gutter` px in from its left. */
function mountOutline(blocks: PartialBlock[] = ARTICLE, gutter = 200) {
  const scrollArea = document.createElement('div')
  const mount = document.createElement('div')
  scrollArea.appendChild(mount)
  document.body.appendChild(scrollArea)
  const editor = BlockNoteEditor.create({ initialContent: blocks }) as unknown as RichEditor
  editor.mount(mount)
  // A bare mount leaves BlockNote headless, with no `domElement`, and without
  // the `bn-editor` class BlockNoteView gives it; the mount is its ProseMirror root.
  Object.defineProperty(editor, 'domElement', { get: () => mount })
  mount.classList.add('bn-editor')
  const editorElement = editorBlockElement(editor)!
  editorElement.getBoundingClientRect = () => DOMRect.fromRect({ x: gutter, y: 0, width: 760, height: 2000 })
  Object.defineProperty(scrollArea, 'clientHeight', { value: 800 })
  scrollArea.scrollTo = vi.fn()

  const view = render(<Outline editor={editor} scrollAreaRef={{ current: scrollArea }} />)
  onTestFinished(() => {
    view.unmount()
    editor.unmount()
    scrollArea.remove()
  })
  const card = () => view.container.querySelector('nav')
  const rail = () => view.container.querySelector('[aria-hidden="true"]')!
  const row = (text: string) => Array.from(card()?.querySelectorAll('button') ?? []).find((button) => button.textContent === text)!
  return { editor, scrollArea, view, card, rail, row }
}

describe('Outline', () => {
  it('lists the headings but the title, closed until the rail is hovered', async () => {
    const { card } = mountOutline()

    await waitFor(() => expect(card()).not.toBeNull())
    expect(Array.from(card()!.querySelectorAll('button'), (button) => button.textContent)).toEqual([
      'Why git at all',
      'Setting it up',
      'One: create the repository',
      'What about conflicts',
    ])
    expect(card()).not.toHaveAttribute('data-open')
  })

  it('opens on hovering the rail after a moment, and closes a moment after the pointer leaves', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    onTestFinished(() => { vi.useRealTimers() })
    const { card, rail } = mountOutline()
    await vi.waitFor(() => expect(card()).not.toBeNull())

    fireEvent.pointerEnter(rail())
    act(() => { vi.advanceTimersByTime(60) })
    expect(card()).not.toHaveAttribute('data-open')
    act(() => { vi.advanceTimersByTime(60) })
    expect(card()).toHaveAttribute('data-open')

    // Crossing from the rail onto the card keeps it open.
    fireEvent.pointerLeave(rail())
    act(() => { vi.advanceTimersByTime(50) })
    fireEvent.pointerEnter(card()!)
    act(() => { vi.advanceTimersByTime(300) })
    expect(card()).toHaveAttribute('data-open')

    fireEvent.pointerLeave(card()!)
    act(() => { vi.advanceTimersByTime(160) })
    expect(card()).not.toHaveAttribute('data-open')
  })

  it('jumps to a picked heading with the caret at its start, and closes', async () => {
    const { card, editor, rail, row, scrollArea } = mountOutline()
    await waitFor(() => expect(card()).not.toBeNull())
    fireEvent.pointerEnter(rail())
    await waitFor(() => expect(card()).toHaveAttribute('data-open'))

    fireEvent.click(row('What about conflicts'))

    expect(editor.getTextCursorPosition().block.id).toBe('conflicts')
    expect(scrollArea.scrollTo).toHaveBeenCalledOnce()
    expect(card()).not.toHaveAttribute('data-open')
  })

  it('opens the collapsed Section a picked heading is hidden in', async () => {
    const { card, editor, row } = mountOutline()
    await waitFor(() => expect(card()).not.toBeNull())
    act(() => { toggleCollapsedHeading(editor, 'setup') })
    expect(isCollapsedBlock(editor, 'setup')).toBe(true)
    await waitFor(() => expect(row('One: create the repository')).toHaveClass('text-text-muted'))

    fireEvent.click(row('One: create the repository'))

    expect(isCollapsedBlock(editor, 'setup')).toBe(false)
    expect(editor.getTextCursorPosition().block.id).toBe('one')
  })

  it('is not shown where the rail has no room left of the editor', async () => {
    const { card, rail } = mountOutline(ARTICLE, 20)

    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(card()).toBeNull()
    expect(rail()).toBeNull()
  })

  it('is not shown for a Document with fewer than two headings besides its title', async () => {
    const { card } = mountOutline([
      { type: 'heading', props: { level: 1 }, content: 'Title' },
      { type: 'heading', props: { level: 2 }, content: 'Only section' },
    ])

    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(card()).toBeNull()
  })
})

import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, onTestFinished, vi } from 'vitest'

const editorElement = document.createElement('div')
document.body.appendChild(editorElement)

vi.mock('@blocknote/react', () => ({
  useBlockNoteEditor: () => ({ domElement: editorElement }),
  useDictionary: () => ({ suggestion_menu: { no_items_title: 'No items' } }),
}))

import { SlashMenu } from './slash-menu'
import type { SlashMenuItem } from './slash-menu-items'

function calloutItem(): SlashMenuItem {
  return {
    aliases: [],
    key: 'callout',
    onItemClick: vi.fn(),
    submenuItems: [
      { key: 'callout_note', title: 'Note', onItemClick: vi.fn() },
      { key: 'callout_tip', title: 'Tip', onItemClick: vi.fn() },
    ],
    title: 'Callout',
  }
}

describe('SlashMenu', () => {
  // BlockNote's wrapper names the list and the selected row in the editor's
  // aria-controls and aria-activedescendant, by these ids.
  it('lists the rows under one label per group, each with the id the editor points at', () => {
    render(<SlashMenu
      items={[
        { key: 'heading', group: 'Headings', title: 'Heading 1', badge: '⌘⌥1', onItemClick: vi.fn() },
        { key: 'heading_2', group: 'Headings', title: 'Heading 2', onItemClick: vi.fn() },
        { ...calloutItem(), group: 'Basic blocks' },
      ]}
      loadingState="loaded"
      selectedIndex={1}
      onItemClick={vi.fn()}
    />)

    const list = screen.getByRole('listbox')
    expect(list).toHaveAttribute('id', 'bn-suggestion-menu')
    expect(within(list).getAllByText(/^(Headings|Basic blocks)$/).map((label) => label.textContent)).toEqual(['Headings', 'Basic blocks'])
    const rows = within(list).getAllByRole('option')
    expect(rows.map((row) => row.id)).toEqual(['bn-suggestion-menu-item-0', 'bn-suggestion-menu-item-1', 'bn-suggestion-menu-item-2'])
    expect(rows.map((row) => row.getAttribute('aria-selected'))).toEqual([null, 'true', null])
    expect(rows[0]).toHaveTextContent('Heading 1⌘⌥1')
    expect(rows[2]).toHaveAttribute('aria-haspopup', 'menu')
  })

  // The adapter's row used to repeat its class on the icon cell, the title and
  // the subtitle, and the titles overflowed into the rows below.
  it('draws each row one line tall: the icon, the title and the hint, no subtitle', () => {
    render(<SlashMenu
      items={[{ key: 'paragraph', title: 'Paragraph', subtext: 'Plain text', onItemClick: vi.fn() }]}
      loadingState="loaded"
      selectedIndex={0}
      onItemClick={vi.fn()}
    />)

    const row = screen.getByRole('option', { name: 'Paragraph' })
    expect(row).toHaveClass('h-8')
    expect(row.children).toHaveLength(1)
    expect(row).not.toHaveTextContent('Plain text')
  })

  it('scrolls the selected row into view as the keys move the selection', () => {
    const items: SlashMenuItem[] = [
      { key: 'a', title: 'A', onItemClick: vi.fn() },
      { key: 'b', title: 'B', onItemClick: vi.fn() },
    ]
    const { rerender } = render(<SlashMenu items={items} loadingState="loaded" selectedIndex={0} onItemClick={vi.fn()} />)
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
    scrollIntoView.mockClear()

    rerender(<SlashMenu items={items} loadingState="loaded" selectedIndex={1} onItemClick={vi.fn()} />)

    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('option', { name: 'B' }))
  })

  it('keeps the editor focused when a row is pressed', () => {
    render(<SlashMenu items={[calloutItem()]} loadingState="loaded" selectedIndex={0} onItemClick={vi.fn()} />)

    expect(fireEvent.mouseDown(screen.getByRole('option', { name: 'Callout' }))).toBe(false)
  })

  it('says so when nothing matches', () => {
    render(<SlashMenu items={[]} loadingState="loaded" selectedIndex={undefined} onItemClick={vi.fn()} />)

    expect(screen.getByText('No items')).toBeInTheDocument()
  })

  it('opens the callout type submenu on the right and selects a clicked style', () => {
    const item = calloutItem()
    const onItemClick = vi.fn()
    render(<SlashMenu
      items={[item]}
      loadingState="loaded"
      selectedIndex={0}
      onItemClick={onItemClick}
    />)

    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Callout' }))

    const submenu = screen.getByRole('menu', { name: 'Callout' })
    expect(submenu).toHaveClass('fixed', 'rounded-xl', 'shadow-menu')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tip' }))
    expect(onItemClick).toHaveBeenCalledWith(item.submenuItems?.[1])
  })

  it('slides the submenu up when level with its row it would run off the viewport', () => {
    const rect = (overrides: Partial<DOMRect>) => ({
      bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0, toJSON: () => ({}), ...overrides,
    }) as DOMRect
    const boundsSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return this.getAttribute('role') === 'menu' ? rect({ height: 400 }) : rect({ right: 300, top: 700 })
    })
    const innerHeight = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })

    render(<SlashMenu items={[calloutItem()]} loadingState="loaded" selectedIndex={0} onItemClick={vi.fn()} />)
    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Callout' }))

    expect(screen.getByRole('menu', { name: 'Callout' })).toHaveStyle({ left: '304px', top: '392px' })

    boundsSpy.mockRestore()
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: innerHeight })
  })

  it('supports right-arrow entry and keyboard selection inside the submenu', () => {
    const item = calloutItem()
    const onItemClick = vi.fn()
    render(<SlashMenu
      items={[item]}
      loadingState="loaded"
      selectedIndex={0}
      onItemClick={onItemClick}
    />)

    fireEvent.keyDown(editorElement, { key: 'ArrowRight' })
    fireEvent.keyDown(editorElement, { key: 'ArrowDown' })
    fireEvent.keyDown(editorElement, { key: 'Enter' })

    expect(onItemClick).toHaveBeenCalledWith(item.submenuItems?.[1])
  })
  // BlockNote's own Enter closes the menu, clears the query and runs the row's
  // empty `onItemClick`: `/callout` + Enter used to leave an empty line.
  it('opens the submenu on Enter instead of running the parent row, and picks a style on the next Enter', () => {
    const item = calloutItem()
    const onItemClick = vi.fn()
    render(<SlashMenu
      items={[item]}
      loadingState="loaded"
      selectedIndex={0}
      onItemClick={onItemClick}
    />)

    const enter = fireEvent.keyDown(editorElement, { key: 'Enter' })

    expect(enter).toBe(false)
    expect(onItemClick).not.toHaveBeenCalled()
    expect(screen.getByRole('menu', { name: 'Callout' })).toBeInTheDocument()

    fireEvent.keyDown(editorElement, { key: 'Enter' })
    expect(onItemClick).toHaveBeenCalledWith(item.submenuItems?.[0])
  })

  it('leaves Enter alone on a row without a submenu', () => {
    const onItemClick = vi.fn()
    render(<SlashMenu
      items={[{ key: 'paragraph', title: 'Paragraph', onItemClick: vi.fn() }]}
      loadingState="loaded"
      selectedIndex={0}
      onItemClick={onItemClick}
    />)

    expect(fireEvent.keyDown(editorElement, { key: 'Enter' })).toBe(true)
  })

  // `/callout` typed through a pinyin input method: the Enter that confirms the
  // letters is the input method's, and so is an arrow in its candidate window.
  it.each([
    { name: 'while composing', init: { isComposing: true } },
    { name: 'ending a composition (keyCode 229)', init: { keyCode: 229 } },
  ])('leaves a key of the input method alone, $name', ({ init }) => {
    const onItemClick = vi.fn()
    render(<SlashMenu
      items={[calloutItem()]}
      loadingState="loaded"
      selectedIndex={0}
      onItemClick={onItemClick}
    />)

    expect(fireEvent.keyDown(editorElement, { key: 'Enter', ...init })).toBe(true)
    expect(screen.queryByRole('menu', { name: 'Callout' })).not.toBeInTheDocument()

    fireEvent.keyDown(editorElement, { key: 'ArrowRight' })
    expect(fireEvent.keyDown(editorElement, { key: 'ArrowDown', ...init })).toBe(true)
    expect(fireEvent.keyDown(editorElement, { key: 'Enter', ...init })).toBe(true)
    expect(onItemClick).not.toHaveBeenCalled()

    fireEvent.keyDown(editorElement, { key: 'Enter' })
    expect(onItemClick).toHaveBeenCalledWith(expect.objectContaining({ key: 'callout_note' }))
  })

  // BlockNote's own keyboard navigation listens on the editor element too, in
  // the same capture phase, and runs Enter as "execute the selected row". Which
  // of the two listeners ran first used to depend on which registered last.
  it('gets the submenu keys before a listener on the editor element, whichever registered first', () => {
    const rival = vi.fn()
    editorElement.addEventListener('keydown', rival, true)
    onTestFinished(() => editorElement.removeEventListener('keydown', rival, true))
    const item = calloutItem()
    const onItemClick = vi.fn()
    render(<SlashMenu
      items={[item]}
      loadingState="loaded"
      selectedIndex={0}
      onItemClick={onItemClick}
    />)

    fireEvent.keyDown(editorElement, { key: 'Enter' })
    fireEvent.keyDown(editorElement, { key: 'ArrowDown' })
    fireEvent.keyDown(editorElement, { key: 'Enter' })

    expect(rival).not.toHaveBeenCalled()
    expect(onItemClick).toHaveBeenCalledTimes(1)
    expect(onItemClick).toHaveBeenCalledWith(item.submenuItems?.[1])
  })
})

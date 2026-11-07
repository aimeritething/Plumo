import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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

  it('scrolls the selected row into the menu\'s view as the keys move the selection', () => {
    const items: SlashMenuItem[] = [
      { key: 'a', title: 'A', onItemClick: vi.fn() },
      { key: 'b', title: 'B', onItemClick: vi.fn() },
    ]
    const { rerender } = render(<SlashMenu items={items} loadingState="loaded" selectedIndex={0} onItemClick={vi.fn()} />)
    const viewport = screen.getByRole('listbox').querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!
    const rect = (top: number) => ({ top, bottom: top + 32 }) as DOMRect
    vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(rect(0))
    vi.spyOn(screen.getByRole('option', { name: 'B' }), 'getBoundingClientRect').mockReturnValue(rect(32))
    onTestFinished(() => { vi.restoreAllMocks() })
    vi.mocked(Element.prototype.scrollIntoView).mockClear()

    rerender(<SlashMenu items={items} loadingState="loaded" selectedIndex={1} onItemClick={vi.fn()} />)

    expect(viewport.scrollTop).toBe(32)
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled()
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
    expect(submenu).toHaveClass('rounded-xl', 'shadow-md')
    expect(submenu.closest('[data-slot="popover-content"]')).toHaveAttribute('data-side', 'right')
    fireEvent.click(screen.getByRole('menuitem', { name: 'Tip' }))
    expect(onItemClick).toHaveBeenCalledWith(item.submenuItems?.[1])
  })

  // The popover places the submenu beside the row it opened from: level with
  // it and 4px to its right, slid up as far as it must to stay 8px inside the
  // viewport near its bottom.
  it('places the submenu beside its row, slid up when level with it it would run off the viewport', async () => {
    const rect = (overrides: Partial<DOMRect>) => {
      const box = { bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0, x: 0, y: 0, ...overrides }
      return { ...box, toJSON: () => box } as DOMRect
    }
    const isPopper = (element: HTMLElement) => element.hasAttribute('data-radix-popper-content-wrapper')
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('role') === 'option') return rect({ bottom: 732, height: 32, left: 12, right: 300, top: 700, width: 288, x: 12, y: 700 })
      return isPopper(this) ? rect({ height: 400, width: 160 }) : rect({})
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
      return isPopper(this) ? 400 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (this: HTMLElement) {
      return isPopper(this) ? 160 : 0
    })
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(800)
    vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1200)
    onTestFinished(() => { vi.restoreAllMocks() })

    render(<SlashMenu items={[calloutItem()]} loadingState="loaded" selectedIndex={0} onItemClick={vi.fn()} />)
    fireEvent.mouseEnter(screen.getByRole('option', { name: 'Callout' }))

    const popper = screen.getByRole('menu', { name: 'Callout' }).closest<HTMLElement>('[data-radix-popper-content-wrapper]')!
    await waitFor(() => { expect(popper.style.transform).toBe('translate(304px, 392px)') })
  })

  // The submenu is a popover for its placement only: it would otherwise take
  // the focus on open, and close on a press on the Slash menu's own rows or on
  // the focus the editor keeps, both "outside" it.
  it('leaves the focus in the editor and stays open on a press or a focus outside it', async () => {
    editorElement.tabIndex = -1
    editorElement.focus()
    onTestFinished(() => { editorElement.blur() })
    render(<SlashMenu items={[calloutItem()]} loadingState="loaded" selectedIndex={0} onItemClick={vi.fn()} />)

    fireEvent.keyDown(editorElement, { key: 'ArrowRight' })
    expect(screen.getByRole('menu', { name: 'Callout' })).toBeInTheDocument()
    expect(document.activeElement).toBe(editorElement)

    // The popover starts listening for presses outside it a task after it opens.
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    fireEvent.pointerDown(screen.getByRole('option', { name: 'Callout' }))
    fireEvent.focusIn(editorElement)

    expect(screen.getByRole('menu', { name: 'Callout' })).toBeInTheDocument()
    expect(document.activeElement).toBe(editorElement)
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

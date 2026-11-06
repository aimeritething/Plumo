import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MenuList, MenuListItem } from './menu-list'

afterEach(() => {
  vi.restoreAllMocks()
})

function box(top: number, height: number): DOMRect {
  return { top, bottom: top + height, height, left: 0, right: 100, width: 100, x: 0, y: top, toJSON: () => ({}) }
}

/** A 100px-tall menu whose rows are 32px tall, row `i` at `32 * i - scrollTop`. */
function placeRows(viewport: HTMLElement) {
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue(box(0, 100))
  screen.getAllByRole('option').forEach((row, index) => {
    vi.spyOn(row, 'getBoundingClientRect').mockImplementation(() => box(32 * index - viewport.scrollTop, 32))
  })
}

function Menu({ selected }: { selected: number }) {
  return (
    <MenuList>
      {['A', 'B', 'C', 'D', 'E'].map((title, index) => (
        <MenuListItem key={title} selected={index === selected}>{title}</MenuListItem>
      ))}
    </MenuList>
  )
}

describe('MenuListItem', () => {
  // The Slash menu's first row mounts before BlockNote places the menu, at the
  // top of the Document; the row's scrollIntoView scrolled the editor there.
  it('never scrolls anything but the menu, even when it mounts selected', () => {
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
    scrollIntoView.mockClear()

    const { rerender } = render(<Menu selected={0} />)
    rerender(<Menu selected={4} />)

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('scrolls the menu down to a row below its view and back up to one above', () => {
    const { container, rerender } = render(<Menu selected={0} />)
    const viewport = container.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!
    placeRows(viewport)

    rerender(<Menu selected={4} />)
    expect(viewport.scrollTop).toBe(32 * 5 - 100)

    rerender(<Menu selected={2} />)
    expect(viewport.scrollTop).toBe(60)

    rerender(<Menu selected={0} />)
    expect(viewport.scrollTop).toBe(0)
  })
})

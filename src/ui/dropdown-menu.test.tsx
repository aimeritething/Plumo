import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { pressToOpen } from './open-layer.test-utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'

function press(element: Element) {
  fireEvent.pointerDown(element)
  fireEvent.mouseDown(element)
  fireEvent.pointerUp(element)
  fireEvent.mouseUp(element)
  fireEvent.click(element)
}

describe('DropdownMenuTrigger', () => {
  it.each([
    ['an element', <button type="button">Handle</button>],
    ['a function', (props: React.HTMLAttributes<HTMLButtonElement>) => <button type="button" {...props}>Handle</button>],
  ])('leaves the press alone with openOnPress={false} when its render is %s', (_kind, element) => {
    const onOpenChange = vi.fn()
    render(
      <DropdownMenu open={false} onOpenChange={onOpenChange}>
        <DropdownMenuTrigger openOnPress={false} render={element} />
        <DropdownMenuContent>
          <DropdownMenuItem>Delete</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    const trigger = screen.getByRole('button', { name: 'Handle' })
    press(trigger)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu')
  })
})

describe('DropdownMenuContent', () => {
  it('keeps Tab in the open menu, as Radix did', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button">More</button>} />
        <DropdownMenuContent data-testid="menu">
          <DropdownMenuItem>Pin</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )

    pressToOpen(screen.getByRole('button', { name: 'More' }))
    const item = await screen.findByRole('menuitem', { name: 'Pin' })
    expect(fireEvent.keyDown(item, { key: 'Tab' })).toBe(false)
    expect(fireEvent.keyDown(item, { key: 'Tab', shiftKey: true })).toBe(false)
    expect(screen.getByTestId('menu')).toBeInTheDocument()
  })
})

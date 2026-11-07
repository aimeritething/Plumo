import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'
import { SimpleTooltip, TooltipProvider } from './tooltip'

describe('SimpleTooltip', () => {
  it('shows the label, the shortcut as chips, on the side asked for', async () => {
    render(
      <SimpleTooltip label="New Document" shortcut="⌘N" side="bottom">
        <button type="button">New</button>
      </SimpleTooltip>,
      { wrapper: TooltipProvider },
    )

    fireEvent.focus(screen.getByRole('button', { name: 'New' }))
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('New Document ⌘N')
    const content = document.querySelector('[data-slot="tooltip-content"]')
    expect(content).toHaveAttribute('data-side', 'bottom')
    expect(content?.querySelectorAll('kbd')).toHaveLength(2)
  })

  // A menu trigger wrapping the tooltip hands its props down through it: the
  // button opens the menu and keeps the menu's open / closed state.
  it('passes the props of a menu trigger around it on to the button', async () => {
    render(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SimpleTooltip label="More">
            <button type="button">More</button>
          </SimpleTooltip>
        </DropdownMenuTrigger>
        <DropdownMenuContent data-testid="menu">
          <DropdownMenuItem>Close Tab</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
      { wrapper: TooltipProvider },
    )

    const button = screen.getByRole('button', { name: 'More' })
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(button).toHaveAttribute('data-state', 'closed')

    fireEvent.pointerDown(button, { button: 0, ctrlKey: false, pointerType: 'mouse' })
    expect(await screen.findByTestId('menu')).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).toHaveAttribute('data-state', 'open')
  })
})

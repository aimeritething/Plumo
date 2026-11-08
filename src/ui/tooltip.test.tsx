import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { holdsOpenMenu, hoverToOpen, pressToOpen } from './open-layer.test-utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './dropdown-menu'
import { Toggle } from './toggle'
import { SimpleTooltip, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

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
        <DropdownMenuTrigger
          render={(
            <SimpleTooltip label="More">
              <button type="button">More</button>
            </SimpleTooltip>
          )}
        />
        <DropdownMenuContent data-testid="menu">
          <DropdownMenuItem>Close Tab</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>,
      { wrapper: TooltipProvider },
    )

    const button = screen.getByRole('button', { name: 'More' })
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    expect(holdsOpenMenu(button)).toBe(false)

    pressToOpen(button)
    expect(await screen.findByTestId('menu')).toBeInTheDocument()
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(holdsOpenMenu(button)).toBe(true)
  })

  // The tooltip's trigger hands its own open / closed state to the toggle
  // under it; the toggle keeps its on / off, which its look reads.
  it('leaves a toggle under it its on / off state', () => {
    render(
      <SimpleTooltip label="Match case">
        <Toggle pressed aria-label="Match case" />
      </SimpleTooltip>,
      { wrapper: TooltipProvider },
    )

    const toggle = screen.getByRole('button', { name: 'Match case' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveAttribute('data-pressed')
  })
})

describe('TooltipContent', () => {
  it('draws the shortcut after the label, one kbd chip per key', async () => {
    render(
      <TooltipProvider>
        <Tooltip open>
          <TooltipTrigger render={<button type="button">Hide sidebar</button>} />
          <TooltipContent shortcut="⌘[">Hide sidebar</TooltipContent>
        </Tooltip>
      </TooltipProvider>,
    )

    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('Hide sidebar ⌘[')
    expect(Array.from(tip.querySelectorAll('kbd'), (chip) => chip.textContent)).toEqual(['⌘', '['])
  })
})

// On Radix the content sat in an error boundary against a throw when BlockNote
// unmounted an open tooltip's trigger mid-render. Base UI's tooltip does not
// throw there, so there is no boundary; these hold that.
describe('a tooltip whose trigger goes while it is open', () => {
  it('logs no error when the toolbar holding it unmounts', () => {
    vi.useFakeTimers()
    const consoleError = vi.spyOn(console, 'error')
    function FormattingToolbar() {
      const [shown, setShown] = useState(true)
      return (
        <>
          <button type="button" onClick={() => setShown(false)}>Collapse selection</button>
          {shown && <SimpleTooltip label="Bold"><button type="button">B</button></SimpleTooltip>}
        </>
      )
    }
    render(<FormattingToolbar />, { wrapper: TooltipProvider })

    hoverToOpen(screen.getByRole('button', { name: 'B' }))
    act(() => { vi.advanceTimersByTime(400) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse selection' }))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('logs no error when the trigger alone unmounts and the tooltip stays', () => {
    const consoleError = vi.spyOn(console, 'error')
    const tooltip = (trigger: boolean) => (
      <Tooltip open>
        {trigger && <TooltipTrigger render={<button type="button">B</button>} />}
        <TooltipContent>Bold</TooltipContent>
      </Tooltip>
    )
    const { rerender } = render(tooltip(true), { wrapper: TooltipProvider })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    rerender(tooltip(false))
    expect(consoleError).not.toHaveBeenCalled()
  })

  // A callback ref, new each render, that sets the parent's state settles
  // instead of looping through the refs the trigger merges.
  it('logs no error when the trigger re-renders its parent as it mounts', () => {
    const consoleError = vi.spyOn(console, 'error')
    function Parent() {
      const [renders, setRenders] = useState(0)
      return (
        <Tooltip open>
          <TooltipTrigger
            render={(
              <button type="button" ref={() => { if (renders < 3) setRenders(renders + 1) }}>
                B {renders}
              </button>
            )}
          />
          <TooltipContent>Bold</TooltipContent>
        </Tooltip>
      )
    }
    render(<Parent />, { wrapper: TooltipProvider })

    expect(screen.getByRole('button', { name: 'B 3' })).toBeInTheDocument()
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(consoleError).not.toHaveBeenCalled()
  })
})

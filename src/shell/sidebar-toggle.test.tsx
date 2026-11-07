import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/ui/tooltip'
import { SidebarProvider } from '@/ui/sidebar'
import { SidebarToggle } from './sidebar-toggle'

function renderToggle(open: boolean) {
  const onOpenChange = vi.fn()
  render(
    <TooltipProvider>
      <SidebarProvider open={open} onOpenChange={onOpenChange}>
        <SidebarToggle />
      </SidebarProvider>
    </TooltipProvider>,
  )
  return { onOpenChange }
}

describe('SidebarToggle', () => {
  it('hides the sidebar from its top row, with the shortcut as a chip in its tooltip', async () => {
    const { onOpenChange } = renderToggle(true)

    const button = screen.getByRole('button', { name: 'Hide sidebar' })
    fireEvent.click(button)
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false)

    fireEvent.focus(button)
    const tip = await screen.findByRole('tooltip')
    expect(tip).toHaveTextContent('Hide sidebar ⌘[')
    expect(Array.from(tip.querySelectorAll('kbd'), (chip) => chip.textContent)).toEqual(['⌘', '['])
  })

  it('shows the sidebar again once collapsed', async () => {
    const { onOpenChange } = renderToggle(false)

    const button = screen.getByRole('button', { name: 'Show sidebar' })
    fireEvent.focus(button)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Show sidebar ⌘[')
    fireEvent.click(button)
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(true)
  })
})

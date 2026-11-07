import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ToggleGroup, ToggleGroupItem } from './toggle-group'
import { SimpleTooltip, TooltipProvider } from './tooltip'

describe('ToggleGroupItem', () => {
  it('keeps its on / off state under a tooltip, whose open / closed state would otherwise be written over it', async () => {
    render(
      <TooltipProvider>
        <ToggleGroup type="single" variant="segmented" value="a" aria-label="Choice">
          <SimpleTooltip label="A">
            <ToggleGroupItem value="a" aria-label="A" />
          </SimpleTooltip>
          <SimpleTooltip label="B">
            <ToggleGroupItem value="b" aria-label="B" />
          </SimpleTooltip>
        </ToggleGroup>
      </TooltipProvider>,
    )

    const a = screen.getByRole('radio', { name: 'A' })
    fireEvent.focus(a)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('A')

    expect(a).toHaveAttribute('data-state', 'on')
    expect(screen.getByRole('radio', { name: 'B' })).toHaveAttribute('data-state', 'off')
  })
})

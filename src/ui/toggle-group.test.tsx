import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ToggleGroup, ToggleGroupItem } from './toggle-group'
import { SimpleTooltip, TooltipProvider } from './tooltip'

describe('ToggleGroupItem', () => {
  it('keeps its chosen state under a tooltip, whose open / closed state is its own', async () => {
    render(
      <TooltipProvider>
        <ToggleGroup variant="segmented" value={['a']} aria-label="Choice">
          <SimpleTooltip label="A">
            <ToggleGroupItem value="a" aria-label="A" />
          </SimpleTooltip>
          <SimpleTooltip label="B">
            <ToggleGroupItem value="b" aria-label="B" />
          </SimpleTooltip>
        </ToggleGroup>
      </TooltipProvider>,
    )

    const a = screen.getByRole('button', { name: 'A' })
    fireEvent.focus(a)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('A')

    expect(a).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'B' })).toHaveAttribute('aria-pressed', 'false')
  })
})

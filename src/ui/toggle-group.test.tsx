import { act, fireEvent, render, screen } from '@testing-library/react'
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

describe('ToggleGroup', () => {
  function Group({ value }: { value: string[] }) {
    return (
      <>
        <button type="button">Before</button>
        <ToggleGroup variant="card" value={value} aria-label="Theme">
          <ToggleGroupItem value="system" aria-label="System" />
          <ToggleGroupItem value="light" aria-label="Light" />
          <ToggleGroupItem value="dark" aria-label="Dark" />
        </ToggleGroup>
      </>
    )
  }

  // Tab reaches the group's one tab stop, the first item at the start; the
  // focus moves on to the chosen one.
  it('takes a focus from outside to the chosen item', () => {
    render(<Group value={['light']} />)
    const system = screen.getByRole('button', { name: 'System' })
    expect(system).toHaveAttribute('tabindex', '0')

    act(() => { system.focus() })
    const light = screen.getByRole('button', { name: 'Light' })
    expect(light).toHaveFocus()
    expect(light).toHaveAttribute('tabindex', '0')
  })

  it('leaves a press on another item, and the arrows inside the group, where they put the focus', () => {
    render(<Group value={['light']} />)
    const dark = screen.getByRole('button', { name: 'Dark' })
    fireEvent.pointerDown(dark)
    act(() => { dark.focus() })
    expect(dark).toHaveFocus()

    act(() => { screen.getByRole('button', { name: 'System' }).focus() })
    expect(screen.getByRole('button', { name: 'System' })).toHaveFocus()
  })
})

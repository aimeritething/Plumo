import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Popover, PopoverContent, PopoverTrigger } from './popover'
import { Toolbar, ToolbarButton } from './toolbar'

// A popup a toolbar button opens is portaled out of the toolbar but stays
// inside it in React's tree (the Formatting toolbar's link field).
function ToolbarWithField() {
  return (
    <Toolbar aria-label="Formatting">
      <ToolbarButton aria-label="Bold" />
      <Popover open>
        <PopoverTrigger render={<ToolbarButton aria-label="Link" />} />
        <PopoverContent>
          <input aria-label="URL" defaultValue="https://plumo.app" />
        </PopoverContent>
      </Popover>
    </Toolbar>
  )
}

describe('Toolbar', () => {
  it('moves the focus along its buttons with the arrows', async () => {
    render(<ToolbarWithField />)

    const bold = screen.getByRole('button', { name: 'Bold' })
    act(() => bold.focus())
    fireEvent.keyDown(bold, { key: 'ArrowRight' })
    await act(async () => {})
    expect(screen.getByRole('button', { name: 'Link' })).toHaveFocus()
  })

  it('leaves the keys and focus of a popup it opened to that popup', async () => {
    render(<ToolbarWithField />)

    const field = screen.getByRole('textbox', { name: 'URL' })
    act(() => field.focus())
    field.setSelectionRange(field.value.length, field.value.length)
    expect(field.selectionStart).toBe(field.selectionEnd)

    fireEvent.keyDown(field, { key: 'ArrowRight' })
    await act(async () => {})
    expect(field).toHaveFocus()

    act(() => field.blur())
    act(() => field.focus())
    expect(field.selectionStart).toBe(field.selectionEnd)
  })
})

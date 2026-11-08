import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { HoverCard, HoverCardContent, HoverCardTrigger } from './hover-card'

describe('HoverCard', () => {
  // The editor handles its Esc and stops it short of the document, where
  // Base UI listens; the card still closes, and leaves the Esc unmarked for
  // the editor.
  it('closes on an Esc pressed where the focus is, which stops it, and leaves it unmarked', () => {
    const onOpenChange = vi.fn()
    let markedOnArrival: boolean | undefined
    render(
      <>
        <div
          data-testid="editor"
          tabIndex={-1}
          onKeyDown={(event) => {
            markedOnArrival = event.defaultPrevented
            event.stopPropagation()
          }}
        />
        <HoverCard open onOpenChange={onOpenChange}>
          <HoverCardTrigger render={<button type="button">Outline</button>} />
          <HoverCardContent>Headings</HoverCardContent>
        </HoverCard>
      </>,
    )
    expect(screen.getByText('Headings')).toBeInTheDocument()

    fireEvent.keyDown(screen.getByTestId('editor'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything())
    expect(markedOnArrival).toBe(false)
  })
})

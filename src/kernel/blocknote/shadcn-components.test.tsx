import { components, ShadCNComponentsContext, ShadCNDefaultComponents } from '@blocknote/shadcn'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/ui/tooltip'
import { blockNoteShadCNComponents } from './shadcn-components'

// BlockNote's Toolbar wraps its buttons in the map's TooltipProvider with a 0ms
// delay. Rendered under the one Provider main.tsx gives the app, a toolbar
// button's tooltip must still wait that Provider's 400ms.
function CaptionInBlockNoteToolbar() {
  const Toolbar = components.FormattingToolbar.Root
  const ToolbarButton = components.FormattingToolbar.Button
  return (
    <TooltipProvider>
      <ShadCNComponentsContext.Provider value={{ ...ShadCNDefaultComponents, ...blockNoteShadCNComponents }}>
        <Toolbar>
          <ToolbarButton label="Edit caption" mainTooltip="Edit caption" />
        </Toolbar>
      </ShadCNComponentsContext.Provider>
    </TooltipProvider>
  )
}

describe('the shadcn component map', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("lets a BlockNote toolbar tooltip wait the app Provider's delay instead of the toolbar's 0ms", () => {
    render(<CaptionInBlockNoteToolbar />)
    const button = screen.getByRole('button', { name: 'Edit caption' })

    fireEvent.pointerMove(button, { pointerType: 'mouse' })
    expect(screen.queryByRole('tooltip')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(399)
    })
    expect(screen.queryByRole('tooltip')).toBeNull()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(screen.getByRole('tooltip')).toHaveTextContent('Edit caption')
  })
})

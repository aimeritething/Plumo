import { render, screen } from '@testing-library/react'
import { useCallback, useLayoutEffect, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip'
import { isRecoveredTooltipError } from './tooltip-recovery'

afterEach(() => {
  vi.restoreAllMocks()
})

const tooltipError = new Error('tooltip content render failed')

function Boom(): never {
  throw tooltipError
}

/** An open tooltip whose content throws while rendering. */
function FailingTooltip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <TooltipProvider>
      <Tooltip open>
        <TooltipTrigger render={children} />
        <TooltipContent>
          {label}
          <Boom />
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

describe('Tooltip recovery', () => {
  it('keeps the trigger mounted when tooltip content rendering fails', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <FailingTooltip label="Switch editor layout">
        <button type="button">Switch editor layout</button>
      </FailingTooltip>,
    )

    expect(screen.getByRole('button', { name: 'Switch editor layout' })).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    expect(isRecoveredTooltipError(tooltipError)).toBe(true)
    expect(consoleError).toHaveBeenCalled()
  })

  it('keeps failed tooltip content disabled when the trigger updates parent state on mount', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // Not `onMount`: the trigger merges an `on…` prop as an event handler,
    // a new function each render.
    function TriggerButton({ afterMount }: { afterMount: () => void }) {
      useLayoutEffect(() => {
        afterMount()
      }, [afterMount])
      return <button type="button">Switch editor layout</button>
    }

    function ParentWithStateUpdate() {
      const [renderCount, setRenderCount] = useState(0)
      const bumpRenderCount = useCallback(() => {
        setRenderCount((current) => current + 1)
      }, [])

      return (
        <FailingTooltip label={`Switch editor layout ${renderCount}`}>
          <TriggerButton afterMount={bumpRenderCount} />
        </FailingTooltip>
      )
    }

    expect(() => render(<ParentWithStateUpdate />)).not.toThrow(/Maximum update depth/)

    expect(screen.getByRole('button', { name: 'Switch editor layout' })).toBeInTheDocument()
    expect(isRecoveredTooltipError(tooltipError)).toBe(true)
    expect(consoleError).toHaveBeenCalled()
  })

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

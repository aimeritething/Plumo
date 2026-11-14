import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { UpdateButton } from './update-button'

const UPDATE = { version: '0.2.0', notes: '### Added\n- Plumo updates itself.\n\n### Fixed\n- A crash.' }

describe('UpdateButton', () => {
  it('is not there until an Update is ready', () => {
    render(<UpdateButton update={null} open={false} onOpenChange={vi.fn()} onRestart={vi.fn()} restarting={false} />)

    expect(screen.queryByRole('button', { name: 'Update' })).toBeNull()
  })

  it('asks to open its popover when clicked, and installs nothing by itself', () => {
    const onOpenChange = vi.fn()
    const onRestart = vi.fn()
    render(<UpdateButton update={UPDATE} open={false} onOpenChange={onOpenChange} onRestart={onRestart} restarting={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Update' }))

    expect(onOpenChange).toHaveBeenCalledWith(true, expect.anything())
    expect(onRestart).not.toHaveBeenCalled()
  })

  it('shows the version and its notes, and restarts from the popover\'s button', async () => {
    const onRestart = vi.fn()
    render(<UpdateButton update={UPDATE} open onOpenChange={vi.fn()} onRestart={onRestart} restarting={false} />)

    expect(await screen.findByText('Plumo 0.2.0 is ready')).toBeInTheDocument()
    expect(screen.getByText('Added')).toBeInTheDocument()
    expect(screen.getByText('Plumo updates itself.')).toBeInTheDocument()
    expect(screen.getByText('A crash.')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Restart and Update' }))
    expect(onRestart).toHaveBeenCalledTimes(1)
  })

  it('holds the restart button while the restart is under way', async () => {
    render(<UpdateButton update={UPDATE} open onOpenChange={vi.fn()} onRestart={vi.fn()} restarting />)

    expect(await screen.findByRole('button', { name: 'Restart and Update' })).toBeDisabled()
  })
})

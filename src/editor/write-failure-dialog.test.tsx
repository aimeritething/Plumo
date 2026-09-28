import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WriteFailureDialog } from './write-failure-dialog'

const PATH = '/Users/plumo/Documents/Notes/Welcome.md'

describe('WriteFailureDialog', () => {
  it('is absent without a prompt', () => {
    render(<WriteFailureDialog prompt={null} onAnswer={vi.fn()} onDismiss={vi.fn()} />)

    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closing a Tab with a refused write offers Retry and Discard changes only', () => {
    const onAnswer = vi.fn()
    render(
      <WriteFailureDialog
        prompt={{ kind: 'close', path: PATH, message: 'Permission denied' }}
        onAnswer={onAnswer}
        onDismiss={vi.fn()}
      />,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent(`Couldn't save to ${PATH}`)
    expect(dialog).toHaveTextContent('Permission denied')
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Retry', 'Discard changes'])

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onAnswer).toHaveBeenLastCalledWith('retry')
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }))
    expect(onAnswer).toHaveBeenLastCalledWith('discard')
  })

  it('quitting with a refused write adds Discard and quit', () => {
    const onAnswer = vi.fn()
    render(
      <WriteFailureDialog
        prompt={{ kind: 'quit', path: PATH, message: 'Permission denied' }}
        onAnswer={onAnswer}
        onDismiss={vi.fn()}
      />,
    )

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Retry',
      'Discard changes',
      'Discard and quit',
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Discard and quit' }))
    expect(onAnswer).toHaveBeenLastCalledWith('discardAndQuit')
  })

  it('Escape dismisses the prompt without answering it', () => {
    const onAnswer = vi.fn()
    const onDismiss = vi.fn()
    render(
      <WriteFailureDialog
        prompt={{ kind: 'quit', path: PATH, message: 'Permission denied' }}
        onAnswer={onAnswer}
        onDismiss={onDismiss}
      />,
    )

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })

    expect(onDismiss).toHaveBeenCalledOnce()
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('while an answer is in flight, says so and takes no button', () => {
    const onAnswer = vi.fn()
    render(
      <WriteFailureDialog
        prompt={{ kind: 'quit', path: PATH, message: 'Permission denied' }}
        pending="retry"
        onAnswer={onAnswer}
        onDismiss={vi.fn()}
      />,
    )

    const retry = screen.getByRole('button', { name: 'Retrying…' })
    expect(retry).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByRole('button').every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
    fireEvent.click(retry)
    expect(onAnswer).not.toHaveBeenCalled()
  })
})

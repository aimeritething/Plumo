import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/ui/tooltip'
import { FindBar, type FindBarProps } from './find-bar'

function renderFindBar(overrides: Partial<FindBarProps> = {}) {
  const props: FindBarProps = {
    testIdPrefix: 'test',
    locale: 'en',
    inputRef: null,
    query: 'foo',
    onQueryChange: vi.fn(),
    caseSensitive: false,
    onCaseSensitiveChange: vi.fn(),
    regex: false,
    onRegexChange: vi.fn(),
    matchCount: 2,
    currentIndex: 0,
    error: null,
    onNext: vi.fn(),
    onPrevious: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
  render(<FindBar {...props} />, { wrapper: TooltipProvider })
  return props
}

const replace = (overrides: Partial<NonNullable<FindBarProps['replace']>> = {}) => ({
  open: true,
  onOpenChange: vi.fn(),
  value: 'bar',
  onValueChange: vi.fn(),
  onReplace: vi.fn(),
  onReplaceAll: vi.fn(),
  ...overrides,
})

describe('FindBar', () => {
  // Rich mode cannot replace, so its bar shows neither the toggle nor the row.
  it('shows no replace toggle or row without a replace', () => {
    renderFindBar()

    expect(screen.queryByRole('button', { name: 'Show replace' })).toBeNull()
    expect(screen.queryByTestId('test-replace-input')).toBeNull()
  })

  it('shows the replace row only while it is open, and the toggle flips it', () => {
    const onOpenChange = vi.fn()
    renderFindBar({ replace: replace({ open: false, onOpenChange }) })
    expect(screen.queryByTestId('test-replace-input')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Show replace' }))

    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  // The Raw bar hands the focus to the editor after the button, and keeps it in the input after ↵.
  it('tells the button from ↵ in the replace input, and leaves ⇧↵ and a composing ↵ alone', () => {
    const onReplace = vi.fn()
    renderFindBar({ replace: replace({ onReplace }) })

    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))
    fireEvent.keyDown(screen.getByTestId('test-replace-input'), { key: 'Enter' })
    fireEvent.keyDown(screen.getByTestId('test-replace-input'), { key: 'Enter', shiftKey: true })
    fireEvent.keyDown(screen.getByTestId('test-replace-input'), { key: 'Enter', isComposing: true })

    expect(onReplace.mock.calls).toEqual([['button'], ['enter']])
  })

  it('greys the walk and the replace buttons when nothing matches', () => {
    renderFindBar({ matchCount: 0, replace: replace() })

    expect(screen.getByTestId('test-find-count')).toHaveTextContent('No matches')
    for (const name of ['Previous match', 'Next match', 'Replace', 'All']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
  })
})

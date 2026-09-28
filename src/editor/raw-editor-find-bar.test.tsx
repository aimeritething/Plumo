import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useEffect } from 'react'
import { TooltipProvider } from '@/ui/tooltip'
import { describe, expect, it, vi } from 'vitest'
import type { EditorView } from '@codemirror/view'
import type { TransactionSpec } from '@codemirror/state'
import { setRawFindQuery } from '@/kernel/raw/raw-editor-find'
import { RawEditorFindBar } from './raw-editor-find-bar'
import { useEditorFindSession } from './editor-find-session'

type FindBarProps = React.ComponentProps<typeof RawEditorFindBar>

/** The bar under the editor pane's find session, opened as a request would; `onClose` hears it close. */
function OpenFindBar({ onClose, ...props }: Omit<FindBarProps, 'find'> & { onClose: () => void }) {
  const session = useEditorFindSession(props.path)
  const { show } = session
  useEffect(() => { show() }, [show])
  const find = { ...session, close: () => { onClose(); session.close() } }
  return <RawEditorFindBar {...props} find={find} />
}

function renderFindBar(overrides: Partial<React.ComponentProps<typeof OpenFindBar>> = {}) {
  const view = {
    dispatch: vi.fn(),
    focus: vi.fn(),
  } as unknown as EditorView
  const props = {
    doc: 'Alpha beta Alpha',
    locale: 'en' as const,
    onClose: vi.fn(),
    onReplaceOpenChange: vi.fn(),
    path: '/vault/a.md',
    replaceOpen: false,
    request: { id: 1, path: '/vault/a.md', replace: false },
    viewRef: { current: view },
    ...overrides,
  }

  const rendered = render(<OpenFindBar {...props} />, { wrapper: TooltipProvider })
  return {
    props,
    rerender: (nextOverrides: Partial<React.ComponentProps<typeof OpenFindBar>>) => {
      rendered.rerender(<OpenFindBar {...props} {...nextOverrides} />)
    },
    view,
  }
}

describe('RawEditorFindBar', () => {
  it('finds matches and moves the CodeMirror selection', async () => {
    const { view } = renderFindBar()

    const input = screen.getByTestId('raw-editor-find-input')
    input.focus()

    fireEvent.change(input, {
      target: { value: 'Alpha' },
    })

    await waitFor(() => {
      expect(screen.getByTestId('raw-editor-find-count')).toHaveTextContent('1 / 2')
      expect(view.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
        selection: { anchor: 0, head: 5 },
      }))
    })
    expect(input).toHaveFocus()
    expect(view.focus).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Next match' }))

    await waitFor(() => {
      expect(screen.getByTestId('raw-editor-find-count')).toHaveTextContent('2 / 2')
      expect(view.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
        selection: { anchor: 11, head: 16 },
      }))
    })
  })

  it('opens replace mode and dispatches regex replacement changes', async () => {
    const onReplaceOpenChange = vi.fn()
    const { view } = renderFindBar({
      doc: 'foo-123 foo-456',
      onReplaceOpenChange,
      replaceOpen: true,
      request: { id: 2, path: '/vault/a.md', replace: true },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Use regular expression' }))
    fireEvent.change(screen.getByTestId('raw-editor-find-input'), {
      target: { value: 'foo-(\\d+)' },
    })
    fireEvent.change(screen.getByTestId('raw-editor-replace-input'), {
      target: { value: 'bar-$1' },
    })

    await waitFor(() => {
      expect(screen.getByTestId('raw-editor-find-count')).toHaveTextContent('1 / 2')
    })

    fireEvent.click(screen.getByRole('button', { name: 'Replace' }))

    expect(view.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      changes: { from: 0, insert: 'bar-123', to: 7 },
      selection: { anchor: 0, head: 7 },
    }))
    expect(view.focus).toHaveBeenCalled()
    expect(onReplaceOpenChange).toHaveBeenCalledWith(true)
  })

  it('keeps the editor selection in place when document edits change the matches', async () => {
    const { rerender, view } = renderFindBar()

    fireEvent.change(screen.getByTestId('raw-editor-find-input'), {
      target: { value: 'Alpha' },
    })

    await waitFor(() => {
      expect(view.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
        selection: { anchor: 0, head: 5 },
      }))
    })

    vi.mocked(view.dispatch).mockClear()
    rerender({ doc: 'Xlpha beta Alpha' })

    await waitFor(() => {
      expect(screen.getByTestId('raw-editor-find-count')).toHaveTextContent('1 / 1')
    })
    expect(view.dispatch).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Next match' }))

    await waitFor(() => {
      expect(view.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
        selection: { anchor: 11, head: 16 },
      }))
    })
  })

  it.each([
    { name: 'while composing', init: { isComposing: true } },
    { name: 'ending a composition (keyCode 229)', init: { keyCode: 229 } },
  ])('leaves Enter and Escape to the input method $name', async ({ init }) => {
    const onClose = vi.fn()
    const { view } = renderFindBar({ onClose })
    const input = screen.getByTestId('raw-editor-find-input')
    fireEvent.change(input, { target: { value: 'Alpha' } })
    await waitFor(() => expect(screen.getByTestId('raw-editor-find-count')).toHaveTextContent('1 / 2'))
    vi.mocked(view.dispatch).mockClear()

    expect(fireEvent.keyDown(input, { key: 'Enter', ...init })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'Escape', ...init })).toBe(true)

    expect(screen.getByTestId('raw-editor-find-count')).toHaveTextContent('1 / 2')
    expect(view.dispatch).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    renderFindBar({ onClose })

    fireEvent.keyDown(screen.getByTestId('raw-editor-find-bar'), { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
    expect(screen.queryByTestId('raw-editor-find-bar')).toBeNull()
  })

  // AIM-482: the input's own handler and the bar's listener both closed it.
  it('closes once on Escape in the find input', () => {
    const onClose = vi.fn()
    renderFindBar({ onClose })

    fireEvent.keyDown(screen.getByTestId('raw-editor-find-input'), { key: 'Escape' })

    expect(onClose).toHaveBeenCalledOnce()
  })

  // AIM-482: CodeMirror draws no selection while the focus is in the find
  // input, so the current match was invisible; the bar now asks the editor to
  // highlight every match, the current one distinctly.
  it('asks the editor to highlight the matches and the current one, and nothing once closed', async () => {
    const { view } = renderFindBar()
    const highlightRequests = () => vi.mocked(view.dispatch).mock.calls
      .flatMap(([spec]) => [(spec as TransactionSpec).effects ?? []].flat())
      .filter((effect) => effect.is(setRawFindQuery))
      .map((effect) => ({ query: effect.value.query, activeIndex: effect.value.activeIndex }))

    fireEvent.change(screen.getByTestId('raw-editor-find-input'), { target: { value: 'Alpha' } })
    await waitFor(() => expect(highlightRequests().at(-1)).toEqual({ query: 'Alpha', activeIndex: 0 }))

    fireEvent.click(screen.getByRole('button', { name: 'Next match' }))
    await waitFor(() => expect(highlightRequests().at(-1)).toEqual({ query: 'Alpha', activeIndex: 1 }))

    fireEvent.keyDown(screen.getByTestId('raw-editor-find-input'), { key: 'Escape' })
    expect(highlightRequests().at(-1)).toEqual({ query: '', activeIndex: 1 })
  })

  // AIM-482: ↵ in the replace input did nothing.
  it('replaces the current match on ↵ in the replace input, keeping the focus there', async () => {
    const { view } = renderFindBar({ doc: 'foo foo', replaceOpen: true })
    fireEvent.change(screen.getByTestId('raw-editor-find-input'), { target: { value: 'foo' } })
    const replaceInput = screen.getByTestId('raw-editor-replace-input')
    fireEvent.change(replaceInput, { target: { value: 'bar' } })
    await waitFor(() => expect(screen.getByTestId('raw-editor-find-count')).toHaveTextContent('1 / 2'))
    replaceInput.focus()

    fireEvent.keyDown(replaceInput, { key: 'Enter' })

    expect(view.dispatch).toHaveBeenLastCalledWith(expect.objectContaining({
      changes: { from: 0, insert: 'bar', to: 3 },
    }))
    expect(replaceInput).toHaveFocus()
    expect(view.focus).not.toHaveBeenCalled()
  })

  it('leaves ↵ in the replace input to the input method', async () => {
    const { view } = renderFindBar({ doc: 'foo foo', replaceOpen: true })
    fireEvent.change(screen.getByTestId('raw-editor-find-input'), { target: { value: 'foo' } })
    await waitFor(() => expect(screen.getByTestId('raw-editor-find-count')).toHaveTextContent('1 / 2'))
    vi.mocked(view.dispatch).mockClear()

    fireEvent.keyDown(screen.getByTestId('raw-editor-replace-input'), { key: 'Enter', keyCode: 229 })

    expect(view.dispatch).not.toHaveBeenCalled()
  })
})

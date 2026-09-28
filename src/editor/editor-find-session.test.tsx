import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { EditorView } from '@codemirror/view'
import { describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/ui/tooltip'
import { useEditorFindSession } from './editor-find-session'
import { RawEditorFindBar } from './raw-editor-find-bar'
import { RichEditorFindBar } from './rich-editor-find-bar'
import type { RawEditorFindRequest } from './raw-editor-find-types'

const PATH = '/vault/a.md'

describe('useEditorFindSession', () => {
  it('keeps the query and the open state for its Tab, and starts over for another', () => {
    const { result, rerender } = renderHook(({ scope }) => useEditorFindSession(scope), { initialProps: { scope: PATH } })
    act(() => {
      result.current.show()
      result.current.setQuery('alpha')
      result.current.setOptions({ caseSensitive: true, regex: false })
    })
    rerender({ scope: PATH })
    expect(result.current).toMatchObject({ open: true, query: 'alpha', options: { caseSensitive: true, regex: false } })

    rerender({ scope: '/vault/b.md' })
    expect(result.current).toMatchObject({ open: false, query: '', options: { caseSensitive: false, regex: false } })
  })
})

/** The editor pane's two surfaces over one session: the mode picks the bar, as `Editor` does. */
function Surfaces({ mode, request }: { mode: 'rich' | 'raw'; request: RawEditorFindRequest | null }) {
  const find = useEditorFindSession(PATH)
  if (mode === 'rich') {
    return <RichEditorFindBar editor={{ prosemirrorView: undefined }} path={PATH} request={request} find={find} />
  }
  const view = { dispatch: vi.fn(), focus: vi.fn() } as unknown as EditorView
  return (
    <RawEditorFindBar doc="Alpha" find={find} onReplaceOpenChange={() => {}} path={PATH} replaceOpen={false} request={request} viewRef={{ current: view }} />
  )
}

// AIM-482: each bar kept its query in its own state, so a mode switch closed
// the bar and lost what was typed.
describe('find across a Rich ↔ Raw switch', () => {
  it('keeps the bar open on the same query and options', () => {
    const { rerender } = render(<Surfaces mode="rich" request={{ id: 1, path: PATH, replace: false }} />, { wrapper: TooltipProvider })
    fireEvent.change(screen.getByTestId('rich-editor-find-input'), { target: { value: 'Alpha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Match case' }))

    // The shell drops the request with the mode it was made in.
    rerender(<Surfaces mode="raw" request={null} />)
    expect(screen.getByTestId('raw-editor-find-input')).toHaveValue('Alpha')
    expect(screen.getByRole('button', { name: 'Match case' })).toHaveAttribute('data-state', 'on')
    fireEvent.change(screen.getByTestId('raw-editor-find-input'), { target: { value: 'Alph' } })

    rerender(<Surfaces mode="rich" request={null} />)
    expect(screen.getByTestId('rich-editor-find-input')).toHaveValue('Alph')
  })

  it('stays closed across the switch once closed', () => {
    const { rerender } = render(<Surfaces mode="rich" request={{ id: 1, path: PATH, replace: false }} />, { wrapper: TooltipProvider })
    fireEvent.keyDown(screen.getByTestId('rich-editor-find-input'), { key: 'Escape' })
    expect(screen.queryByTestId('rich-editor-find-bar')).toBeNull()

    rerender(<Surfaces mode="raw" request={null} />)

    expect(screen.queryByTestId('raw-editor-find-bar')).toBeNull()
  })
})

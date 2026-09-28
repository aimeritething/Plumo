import { act, render, renderHook, screen } from '@testing-library/react'
import { undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'
import { describe, expect, it } from 'vitest'
import type { CodeMirrorSnapshot } from '@/kernel/raw/use-code-mirror'
import type { Tab } from '@/types'
import { RawEditorView } from './raw-editor-view'
import { useRawEditorSnapshots, type RawEditorSnapshots } from './use-raw-editor-snapshots'

const A = '/vault/a.md'
const B = '/vault/b.md'
const tab = (path: string, content = ''): Tab => ({ entry: { path }, content, mode: 'raw' }) as unknown as Tab
const snapshot = {} as CodeMirrorSnapshot

type CodeMirrorHost = HTMLElement & { __cmView?: EditorView }
const rawView = () => (screen.getByTestId('raw-editor-codemirror') as CodeMirrorHost).__cmView!

/** The editor pane's Raw surface as the shell mounts it: one view, keyed by the active Tab's path. */
function RawTabs({ tabs, active }: { tabs: Tab[]; active: string }) {
  const snapshots = useRawEditorSnapshots(tabs, active, true)
  const activeTab = tabs.find((candidate) => candidate.entry.path === active)!
  return <RawEditorView key={active} content={activeTab.content} path={active} onContentChange={() => {}} onSave={() => {}} snapshots={snapshots} />
}

describe('useRawEditorSnapshots', () => {
  it('keeps a snapshot per open Tab, and drops it when the Tab closes', () => {
    const { result, rerender } = renderHook(
      ({ tabs }) => useRawEditorSnapshots(tabs, A, true),
      { initialProps: { tabs: [tab(A), tab(B)] } },
    )
    act(() => result.current.keep(B, snapshot))
    expect(result.current.read(B)).toBe(snapshot)

    rerender({ tabs: [tab(A)] })

    expect(result.current.read(B)).toBeNull()
  })

  it('drops the active Tab\'s snapshot when it leaves Raw mode, and keeps the others', () => {
    const { result, rerender } = renderHook(
      ({ rawMode }: { rawMode: boolean }) => useRawEditorSnapshots([tab(A), tab(B)], A, rawMode),
      { initialProps: { rawMode: true } },
    )
    const snapshots: RawEditorSnapshots = result.current
    act(() => {
      snapshots.keep(A, snapshot)
      snapshots.keep(B, snapshot)
    })

    rerender({ rawMode: false })

    expect(result.current.read(A)).toBeNull()
    expect(result.current.read(B)).toBe(snapshot)
  })

  // AIM-486: A → B → A remounted CodeMirror from the Tab's bytes, so the caret
  // went to the top and ⌘Z had nothing to undo.
  it('brings a Raw Tab back with its caret and its undo history after a Tab switch', () => {
    const tabs = [tab(A, 'alpha\nbeta\ngamma'), tab(B, 'other')]
    const { rerender } = render(<RawTabs tabs={tabs} active={A} />)
    act(() => {
      rawView().dispatch({ changes: { from: 0, insert: 'typed ' }, userEvent: 'input.type' })
      rawView().dispatch({ selection: { anchor: 'typed alpha\nbe'.length } })
    })
    // What Autosave hands back to the Tab.
    const edited = [tab(A, 'typed alpha\nbeta\ngamma'), tabs[1]]

    rerender(<RawTabs tabs={edited} active={B} />)
    expect(rawView().state.doc.toString()).toBe('other')
    rerender(<RawTabs tabs={edited} active={A} />)

    expect(rawView().state.doc.toString()).toBe('typed alpha\nbeta\ngamma')
    expect(rawView().state.selection.main.head).toBe('typed alpha\nbe'.length)
    act(() => { undo(rawView()) })
    expect(rawView().state.doc.toString()).toBe('alpha\nbeta\ngamma')
  })
})

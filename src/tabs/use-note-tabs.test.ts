import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { subscribeNoteContentResolved, type NoteContentResolvedEvent } from '@/kernel/resolve/note-content-cache'
import { useNoteTabs } from './use-note-tabs'

const runtime = vi.hoisted(() => ({
  invoke: vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>(),
}))

vi.mock('@/platform/tauri', () => ({
  isTauri: () => false,
  mockInvoke: (cmd: string, args?: Record<string, unknown>) => runtime.invoke(cmd, args),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

const A = '/n/a.md'
const B = '/n/b.md'
const C = '/n/c.md'
const COVER = '/n/cover.png'

/** Answers get_note_content from `files`; a path outside it does not exist. */
function seedFiles(files: Record<string, string>) {
  runtime.invoke.mockImplementation(async (_cmd, args) => {
    const path = String(args?.path)
    if (!(path in files)) throw new Error('File does not exist')
    return files[path]
  })
}

async function openThree() {
  seedFiles({ [A]: '# A\n', [B]: '# B\n', [C]: '# C\n' })
  const rendered = renderHook(() => useNoteTabs())
  await act(async () => {
    await rendered.result.current.openNote(A)
    await rendered.result.current.openNote(B)
    await rendered.result.current.openNote(C)
  })
  return rendered
}

const openPaths = (result: { current: ReturnType<typeof useNoteTabs> }) =>
  result.current.tabs.map((tab) => tab.entry.path)

describe('useNoteTabs', () => {
  beforeEach(() => {
    runtime.invoke.mockReset()
  })

  it('opens a Document by reading it through the boundary with its own directory as the root', async () => {
    runtime.invoke.mockResolvedValue('# Welcome\n')
    const { result } = renderHook(() => useNoteTabs())

    await act(async () => {
      await result.current.openNote('/Users/plumo/Documents/Notes/Welcome.md')
    })

    expect(runtime.invoke).toHaveBeenCalledWith('get_note_content', {
      path: '/Users/plumo/Documents/Notes/Welcome.md',
      vaultPath: '/Users/plumo/Documents/Notes',
    })
    expect(result.current.activeTabPath).toBe('/Users/plumo/Documents/Notes/Welcome.md')
    expect(result.current.activeTab?.entry.filename).toBe('Welcome.md')
    expect(result.current.activeTab?.content).toBe('# Welcome\n')
    expect(result.current.tabs).toHaveLength(1)
  })

  it('keeps every opened Document as a Tab, in opening order, with the latest active', async () => {
    const { result } = await openThree()

    expect(openPaths(result)).toEqual([A, B, C])
    expect(result.current.activeTabPath).toBe(C)
  })

  it('activates the existing Tab without re-reading when a Document is opened again', async () => {
    const { result } = await openThree()
    runtime.invoke.mockClear()

    await act(async () => {
      await result.current.openNote(A)
    })

    expect(openPaths(result)).toEqual([A, B, C])
    expect(result.current.activeTabPath).toBe(A)
    expect(runtime.invoke).not.toHaveBeenCalled()
  })

  it('closes a Tab and hands the active spot to the successor', async () => {
    const { result } = await openThree()

    act(() => result.current.activateTab(B))
    act(() => result.current.closeTab(B))

    expect(openPaths(result)).toEqual([A, C])
    expect(result.current.activeTabPath).toBe(C)
  })

  it('moves between Tabs positionally and jumps to Tab N', async () => {
    const { result } = await openThree()

    act(() => result.current.activateAdjacentTab(-1))
    expect(result.current.activeTabPath).toBe(B)

    act(() => result.current.activateAdjacentTab(1))
    expect(result.current.activeTabPath).toBe(C)

    act(() => result.current.activateTabAt(0))
    expect(result.current.activeTabPath).toBe(A)
  })

  it('restores the Session Tabs that still exist and hands a missing active Tab to its successor', async () => {
    seedFiles({ [A]: '# A\n', [C]: '# C\n' })
    const { result } = renderHook(() => useNoteTabs())

    await act(async () => {
      await result.current.restoreOpenEditors(
        [{ path: A, mode: 'rich' }, { path: B, mode: 'rich' }, { path: C, mode: 'rich' }],
        B,
      )
    })

    expect(openPaths(result)).toEqual([A, C])
    expect(result.current.activeTabPath).toBe(C)
    expect(result.current.tabs.map((tab) => tab.content)).toEqual(['# A\n', '# C\n'])
  })

  it('restores each Document in the mode its Session entry names, Rich when it names none', async () => {
    seedFiles({ [A]: '# A\n', [B]: '# B\n', [C]: '# C\n' })
    const { result } = renderHook(() => useNoteTabs())

    await act(async () => {
      await result.current.restoreOpenEditors([{ path: A, mode: 'raw' }, { path: B, mode: 'rich' }, { path: C }], A)
    })

    expect(result.current.tabs.map((tab) => tab.mode)).toEqual(['raw', 'rich', 'rich'])
  })

  it('opens a Document in Rich mode and lets one Tab switch to Raw on its own', async () => {
    const { result } = await openThree()

    act(() => {
      result.current.setTabMode(B, 'raw')
    })

    expect(result.current.tabs.map((tab) => tab.mode)).toEqual(['rich', 'raw', 'rich'])
  })

  it('opens a Document straight into Raw when asked (⌘↵ in Quick Open), and switches one that is already open', async () => {
    seedFiles({ [A]: '# A\n', [B]: '# B\n' })
    const { result } = renderHook(() => useNoteTabs())

    await act(async () => {
      await result.current.openNote(A, 'raw')
      await result.current.openNote(B)
    })
    expect(result.current.tabs.map((tab) => tab.mode)).toEqual(['raw', 'rich'])

    await act(async () => {
      await result.current.openNote(B, 'raw')
    })
    expect(result.current.activeTabPath).toBe(B)
    expect(result.current.tabs.map((tab) => tab.mode)).toEqual(['raw', 'raw'])
    // Opening again without a mode activates and leaves the mode alone.
    await act(async () => {
      await result.current.openNote(A)
    })
    expect(result.current.tabs.map((tab) => tab.mode)).toEqual(['raw', 'raw'])
  })

  it('forces Raw on a Document whose Frontmatter is invalid, on open, on reload and on restore', async () => {
    const invalid = '---\nnot yaml\n---\n# A\n'
    seedFiles({ [A]: invalid, [B]: '# B\n' })
    const { result } = renderHook(() => useNoteTabs())

    await act(async () => {
      await result.current.openNote(A)
      await result.current.openNote(B)
    })
    expect(result.current.tabs.map((tab) => tab.mode)).toEqual(['raw', 'rich'])
    act(() => {
      result.current.setTabMode(A, 'rich')
    })
    expect(result.current.tabs[0].mode).toBe('raw')

    seedFiles({ [A]: invalid, [B]: invalid })
    await act(async () => {
      await result.current.reloadTab(B)
    })
    expect(result.current.tabs[1].mode).toBe('raw')

    const restored = renderHook(() => useNoteTabs())
    await act(async () => {
      await restored.result.current.restoreOpenEditors([{ path: A, mode: 'rich' }], A)
    })
    expect(restored.result.current.tabs[0].mode).toBe('raw')
  })

  it('keeps a Document opened before the restore settled, and keeps it active', async () => {
    seedFiles({ [A]: '# A\n', [B]: '# B\n', [C]: '# C\n' })
    const { result } = renderHook(() => useNoteTabs())

    await act(async () => {
      await result.current.openNote(C)
      await result.current.restoreOpenEditors([{ path: A, mode: 'rich' }, { path: B, mode: 'rich' }], A)
    })

    expect(openPaths(result)).toEqual([A, B, C])
    expect(result.current.activeTabPath).toBe(C)
  })

  it('restores an Image file entry the Folder still lists, without reading it', async () => {
    seedFiles({ [A]: '# A\n' })
    const { result } = renderHook(() => useNoteTabs('/n', (path) => path === COVER))

    await act(async () => {
      await result.current.restoreOpenEditors([{ path: COVER }, { path: A, mode: 'rich' }], COVER)
    })

    expect(openPaths(result)).toEqual([COVER, A])
    expect(result.current.activeTabPath).toBe(COVER)
    expect(runtime.invoke).toHaveBeenCalledTimes(1)
  })

  it('drops an Image file the Folder no longer lists, its successor taking over', async () => {
    seedFiles({ [A]: '# A\n' })
    const { result } = renderHook(() => useNoteTabs('/n', () => false))

    await act(async () => {
      await result.current.restoreOpenEditors([{ path: COVER }, { path: A, mode: 'rich' }], COVER)
    })

    expect(openPaths(result)).toEqual([A])
    expect(result.current.activeTabPath).toBe(A)
  })

  it('tolerates a hand-edited mode on an Image file entry, the extension deciding its kind', async () => {
    const { result } = renderHook(() => useNoteTabs('/n', () => true))

    await act(async () => {
      await result.current.restoreOpenEditors([{ path: COVER, mode: 'raw' }], COVER)
    })

    expect(openPaths(result)).toEqual([COVER])
    expect(runtime.invoke).not.toHaveBeenCalled()
  })

  it('opens an Image file as a Tab without reading a byte of it', async () => {
    const { result } = renderHook(() => useNoteTabs('/n'))

    await act(async () => {
      await result.current.openNote(COVER)
    })

    expect(openPaths(result)).toEqual([COVER])
    expect(result.current.activeTab?.entry.fileKind).toBe('binary')
    expect(result.current.activeTab?.content).toBe('')
    expect(runtime.invoke).not.toHaveBeenCalled()
  })

  it('activates the existing Tab when an Image file is opened again', async () => {
    const { result } = renderHook(() => useNoteTabs('/n'))
    seedFiles({ [A]: '# A\n' })

    await act(async () => {
      await result.current.openNote(COVER)
      await result.current.openNote(A)
      await result.current.openNote(COVER)
    })

    expect(openPaths(result)).toEqual([COVER, A])
    expect(result.current.activeTabPath).toBe(COVER)
  })

  it('reloadTab counts an Image Tab\'s reload rather than reading bytes it has not got', async () => {
    const { result } = renderHook(() => useNoteTabs('/n'))
    await act(async () => { await result.current.openNote(COVER) })
    runtime.invoke.mockClear()

    await act(async () => { await result.current.reloadTab(COVER) })
    await act(async () => { await result.current.reloadTab(COVER) })

    expect(runtime.invoke).not.toHaveBeenCalled()
    expect(result.current.tabs[0].reloads).toBe(2)
  })

  it('reloadTab leaves an Image file that is not open alone', async () => {
    const { result } = renderHook(() => useNoteTabs('/n'))

    await act(async () => { await result.current.reloadTab(COVER) })

    expect(result.current.tabs).toEqual([])
  })

  it('announces the opened content on the note-content bus for the active Document', async () => {
    runtime.invoke.mockResolvedValue('# Welcome\n')
    const events: NoteContentResolvedEvent[] = []
    const unsubscribe = subscribeNoteContentResolved((event) => events.push(event))
    const { result } = renderHook(() => useNoteTabs())

    await act(async () => {
      await result.current.openNote('/n/welcome.md')
    })
    unsubscribe()

    expect(events).toEqual([
      expect.objectContaining({ path: '/n/welcome.md', content: '# Welcome\n', parsedBlockPreload: true }),
    ])
    expect(events[0].entry?.path).toBe('/n/welcome.md')
  })

  it('leaves nothing open when the read fails, and surfaces the error', async () => {
    runtime.invoke.mockRejectedValue(new Error('File does not exist'))
    const { result } = renderHook(() => useNoteTabs())

    await expect(act(() => result.current.openNote('/n/missing.md'))).rejects.toThrow('File does not exist')

    expect(result.current.tabs).toEqual([])
    expect(result.current.activeTabPath).toBeNull()
  })

  it('lets the save hook replace the open Document\'s content through setTabs', async () => {
    runtime.invoke.mockResolvedValue('# A\n')
    const { result } = renderHook(() => useNoteTabs())
    await act(async () => {
      await result.current.openNote('/n/a.md')
    })

    act(() => {
      result.current.setTabs((tabs) => tabs.map((tab) => ({ ...tab, content: '# A\n\nEdited\n' })))
    })

    expect(result.current.activeTab?.content).toBe('# A\n\nEdited\n')
  })

  it('reloadTab replaces a Tab\'s content with the bytes on disk and leaves the other Tabs alone', async () => {
    const { result } = await openThree()
    const files: Record<string, string> = { [A]: '# A\n', [B]: '# B\n', [C]: '# C\n' }
    seedFiles(files)
    act(() => {
      result.current.setTabs((tabs) => tabs.map((tab) => (tab.entry.path === B ? { ...tab, content: '# B\n\nUnsaved\n' } : tab)))
    })
    files[B] = '# B\n\nOn disk\n'

    await act(async () => {
      await result.current.reloadTab(B)
    })

    expect(runtime.invoke).toHaveBeenLastCalledWith('get_note_content', { path: B, vaultPath: '/n' })
    expect(result.current.tabs.map((tab) => tab.content)).toEqual(['# A\n', '# B\n\nOn disk\n', '# C\n'])
    expect(openPaths(result)).toEqual([A, B, C])
    expect(result.current.activeTabPath).toBe(C)
  })

  it('reloadTab is a no-op for a Document that is not open', async () => {
    const { result } = await openThree()
    runtime.invoke.mockClear()

    await act(async () => {
      await result.current.reloadTab('/n/elsewhere.md')
    })

    expect(runtime.invoke).not.toHaveBeenCalled()
  })
})

describe('useNoteTabs: the last open wins', () => {
  beforeEach(() => {
    runtime.invoke.mockReset()
  })

  /** Holds A's read until `finishA` is called; every other path reads at once. */
  function holdReadOf(path: string) {
    let finish!: () => void
    runtime.invoke.mockImplementation(async (_cmd, args) => {
      const target = String(args?.path)
      if (target === path) await new Promise<void>((resolve) => { finish = resolve })
      return `# ${target}\n`
    })
    return () => finish()
  }

  it('keeps the later open active when an earlier, slower read finishes after it, and drops the earlier one', async () => {
    const finishA = holdReadOf(A)
    const { result } = renderHook(() => useNoteTabs())

    let openingA!: Promise<void>
    await act(async () => {
      openingA = result.current.openNote(A)
      await result.current.openNote(B)
    })
    await act(async () => {
      finishA()
      await openingA
    })

    expect(openPaths(result)).toEqual([B])
    expect(result.current.activeTabPath).toBe(B)
  })

  it('keeps an already-open Tab active when it was asked for after a slower read began', async () => {
    seedFiles({ [B]: '# B\n' })
    const { result } = renderHook(() => useNoteTabs())
    await act(async () => { await result.current.openNote(B) })
    const finishA = holdReadOf(A)

    let openingA!: Promise<void>
    await act(async () => {
      openingA = result.current.openNote(A)
      await result.current.openNote(B)
    })
    await act(async () => {
      finishA()
      await openingA
    })

    expect(openPaths(result)).toEqual([B])
    expect(result.current.activeTabPath).toBe(B)
  })
})

it('does not apply an external read when edits become pending while the read is in flight', async () => {
  seedFiles({ [A]: '# Original\n' })
  const { result } = renderHook(() => useNoteTabs('/n'))
  await act(async () => { await result.current.openNote(A) })
  let finish!: (content: string) => void
  runtime.invoke.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  let pending = false
  let reading!: Promise<void>
  await act(async () => { reading = result.current.reloadTab(A, () => !pending) })
  pending = true
  await act(async () => { finish('# Changed outside\n'); await reading })
  expect(result.current.activeTab?.content).toBe('# Original\n')
})

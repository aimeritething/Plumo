import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tab } from '@/types'
import { noteEntryForPath } from '@/folder/note-entry'
import { FolderNotFoundError } from '@/folder/use-folder'
import { useFolderSwitch } from './use-folder-switch'
import { useRecentFolders } from './use-recent-folders'

const { toast } = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('@/editor/toasts', () => ({ showRefusalToast: toast }))

const A = '/Users/x/a'
const B = '/Users/x/b'
const tab = (path: string, mode?: Tab['mode']): Tab => ({ entry: noteEntryForPath(path, ''), content: '', mode })

interface Shell {
  folder: string | null
  tabs: Tab[]
  activeTabPath: string | null
}

/**
 * The hook over a stand-in for the shell: `changeFolder` runs the settle, as
 * `useFolder` does, then moves the Folder; closing and reopening Tabs edit the
 * same stand-in, so a later switch sees what an earlier one left.
 */
function renderSwitch(initial: Shell, options: { missing?: string; refuse?: boolean } = {}) {
  const shell: Shell = { ...initial }
  const changeFolder = vi.fn(async (path: string | null, beforeChange: () => Promise<void>) => {
    if (path !== null && path === options.missing) throw new FolderNotFoundError(path)
    await beforeChange()
    shell.folder = path === null ? null : path.replace(/\/+$/u, '')
    return true
  })
  const settleAndCloseAll = vi.fn(async () => {
    if (options.refuse) throw new Error('Folder change stopped by a Write failure')
    shell.tabs = []
    shell.activeTabPath = null
  })
  const restoreOpenEditors = vi.fn(async (editors: { path: string; mode?: Tab['mode'] }[], activePath: string | null) => {
    shell.tabs = editors.map((editor) => tab(editor.path, editor.mode))
    shell.activeTabPath = activePath
  })
  const hook = renderHook(() => {
    const recent = useRecentFolders()
    return { recent, ...useFolderSwitch({ ...shell, changeFolder, settleAndCloseAll, restoreOpenEditors, recent }) }
  })
  const run = async (action: (current: typeof hook.result.current) => Promise<void>) => {
    await act(async () => { await action(hook.result.current) })
    hook.rerender()
  }
  return { shell, hook, run, changeFolder, restoreOpenEditors }
}

beforeEach(() => { toast.mockClear() })

describe('useFolderSwitch', () => {
  it('lists the Folders opened, the latest first', async () => {
    const { hook, run } = renderSwitch({ folder: null, tabs: [], activeTabPath: null })

    await run((current) => current.switchFolder(A))
    await run((current) => current.switchFolder(`${B}/`))

    expect(hook.result.current.recent.paths).toEqual([B, A])
  })

  it('gives a Folder back its Tabs, each with its mode, and its active Tab, lone Documents included', async () => {
    const lone = '/Users/x/elsewhere/lone.md'
    const { shell, hook, run } = renderSwitch({ folder: null, tabs: [], activeTabPath: null })
    await run((current) => current.switchFolder(A))
    shell.tabs = [tab(`${A}/one.md`), tab(`${A}/two.md`, 'raw'), tab(lone)]
    shell.activeTabPath = `${A}/two.md`
    hook.rerender()

    await run((current) => current.switchFolder(B))
    expect(shell.tabs).toEqual([])
    expect(hook.result.current.recent.tabsByFolder[A]?.activePath).toBe(`${A}/two.md`)

    await run((current) => current.openRecentFolder(A))
    expect(shell.tabs.map((open) => [open.entry.path, open.mode])).toEqual([[`${A}/one.md`, 'rich'], [`${A}/two.md`, 'raw'], [lone, 'rich']])
    expect(shell.activeTabPath).toBe(`${A}/two.md`)
    expect(hook.result.current.recent.tabsByFolder).toEqual({})
  })

  it('keeps the Tabs of a Folder that is closed rather than switched away from', async () => {
    const { shell, hook, run } = renderSwitch({ folder: null, tabs: [], activeTabPath: null })
    await run((current) => current.switchFolder(A))
    shell.tabs = [tab(`${A}/one.md`)]
    shell.activeTabPath = `${A}/one.md`
    hook.rerender()

    await run((current) => current.switchFolder(null))
    expect(shell.folder).toBeNull()
    expect(hook.result.current.recent.paths).toEqual([A])

    await run((current) => current.openRecentFolder(A))
    expect(shell.tabs.map((open) => open.entry.path)).toEqual([`${A}/one.md`])
  })

  it('keeps everything as it was when a Write failure stops the change', async () => {
    const { shell, hook } = renderSwitch({ folder: A, tabs: [tab(`${A}/one.md`)], activeTabPath: `${A}/one.md` }, { refuse: true })

    await act(async () => {
      await expect(hook.result.current.switchFolder(B)).rejects.toThrow('Write failure')
    })
    hook.rerender()

    expect(shell.folder).toBe(A)
    expect(hook.result.current.recent.paths).toEqual([])
    expect(hook.result.current.recent.tabsByFolder).toEqual({})
  })

  it('says so and drops a Recent Folder that will not list', async () => {
    const { shell, hook, run, changeFolder } = renderSwitch({ folder: null, tabs: [], activeTabPath: null }, { missing: B })
    await run((current) => current.switchFolder(A))
    act(() => hook.result.current.recent.remember(B))
    await run((current) => current.switchFolder(A))

    await run((current) => current.openRecentFolder(B))

    expect(changeFolder).toHaveBeenLastCalledWith(B, expect.any(Function), { reportMissing: false })
    expect(toast).toHaveBeenCalledWith('Folder not found')
    expect(hook.result.current.recent.paths).toEqual([A])
    expect(shell.folder).toBe(A)
  })
})

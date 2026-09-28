import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { FolderNotFoundError, useFolder } from './use-folder'

const { invoke, allow } = vi.hoisted(() => ({ invoke: vi.fn(), allow: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke }))
vi.mock('@/platform/tauri', () => ({ isTauri: () => true }))
vi.mock('./vault-asset-scope', () => ({ allowVaultAssets: allow }))
beforeEach(() => { vi.clearAllMocks(); invoke.mockResolvedValue([]); allow.mockResolvedValue(undefined) })

it('waits for saves and Tab closure before changing Folder, and clears on Close Folder', async () => {
  const { result } = renderHook(() => useFolder())
  let finish!: () => void
  const settle = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
  let opening!: Promise<void>
  await act(async () => { opening = result.current.changeFolder('/Notes', settle) })
  expect(result.current.folder).toBeNull()
  await act(async () => { finish(); await opening })
  expect(result.current.folder).toBe('/Notes')
  expect(allow).toHaveBeenCalledExactlyOnceWith('/Notes')
  await act(async () => { await result.current.changeFolder(null, async () => {}) })
  expect(result.current.folder).toBeNull()
  expect(result.current.files).toEqual([])
})

it('keeps the old Folder when a pending save is refused', async () => {
  const { result } = renderHook(() => useFolder())
  await act(async () => { await result.current.changeFolder('/Notes', async () => {}) })
  await act(async () => {
    await expect(result.current.changeFolder('/Other', async () => { throw new Error('Read only') })).rejects.toThrow('Read only')
  })
  expect(result.current.folder).toBe('/Notes')
})

it('says so when a Folder will not list, from Open Folder as well as a restore', async () => {
  const { result } = renderHook(() => useFolder())
  invoke.mockRejectedValueOnce(new Error('Folder not found'))
  await act(async () => {
    await expect(result.current.changeFolder('/Gone', async () => {})).rejects.toThrow('Folder not found')
  })
  expect(result.current.error).toBe('Folder not found: /Gone')
  expect(result.current.folder).toBeNull()

  invoke.mockRejectedValueOnce(new Error('Folder not found'))
  await act(async () => { await result.current.restoreFolder('/Gone') })
  expect(result.current.error).toBe('Folder not found: /Gone')

  await act(async () => { await result.current.changeFolder('/Notes', async () => {}) })
  expect(result.current.error).toBeNull()
})

it('keeps the Explorer quiet when a Write failure stops the Folder change', async () => {
  const { result } = renderHook(() => useFolder())
  await act(async () => {
    await expect(result.current.changeFolder('/Other', async () => { throw new Error('Read only') })).rejects.toThrow('Read only')
  })
  expect(result.current.error).toBeNull()
})

it('ignores a refresh from the previous Folder that finishes after switching', async () => {
  const { result } = renderHook(() => useFolder())
  await act(async () => { await result.current.changeFolder('/Notes', async () => {}) })
  let finish!: (files: unknown[]) => void
  invoke.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  let refreshing!: Promise<void>
  await act(async () => { refreshing = result.current.refresh() })
  await act(async () => { await result.current.changeFolder('/Other', async () => {}) })
  await act(async () => { finish([{ path: '/Notes/stale.md', kind: 'note', fileSize: 1, modifiedAt: 1 }]); await refreshing })
  expect(result.current.folder).toBe('/Other')
  expect(result.current.files).toEqual([])
})

it('lets a second Folder change wait for the one in flight, then reports what it settled on', async () => {
  const { result } = renderHook(() => useFolder())
  invoke.mockResolvedValue([{ path: '/Notes/cover.png', kind: 'image', fileSize: 12, modifiedAt: 3 }])
  let finish!: () => void
  const settle = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
  let opening!: Promise<void>
  let waiting!: Promise<string | null>
  await act(async () => { opening = result.current.changeFolder('/Notes', settle) })

  await act(async () => { waiting = result.current.restoreFolder('/Elsewhere') })
  await act(async () => { finish(); await opening })

  expect(await waiting).toBe('/Notes')
  expect(result.current.listsFile('/Notes/cover.png')).toBe(true)
  expect(result.current.listsFile('/Notes/gone.png')).toBe(false)
})

it('leaves a missing Folder to the caller when asked, with the path on the error', async () => {
  const { result } = renderHook(() => useFolder())
  invoke.mockRejectedValueOnce(new Error('Folder not found'))
  let error: unknown
  await act(async () => {
    await result.current.changeFolder('/Gone/', async () => {}, { reportMissing: false }).catch((caught: unknown) => { error = caught })
  })
  expect(error).toBeInstanceOf(FolderNotFoundError)
  expect((error as FolderNotFoundError).path).toBe('/Gone')
  expect(result.current.error).toBeNull()
})

it('tells the caller whether it made the change or waited on another', async () => {
  const { result } = renderHook(() => useFolder())
  let finish!: () => void
  const settle = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
  let first!: Promise<boolean>
  let second!: Promise<boolean>
  await act(async () => { first = result.current.changeFolder('/Notes', settle) })
  await act(async () => { second = result.current.changeFolder('/Other', async () => {}) })
  await act(async () => { finish(); await first })

  expect(await first).toBe(true)
  expect(await second).toBe(false)
  expect(result.current.folder).toBe('/Notes')
})

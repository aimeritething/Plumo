import { act, renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import { useDocumentWatcher } from './use-document-watcher'

const watch = vi.hoisted(() => ({ options: null as null | { vaultPaths: string[]; onVaultChanged: (paths: string[]) => Promise<void> } }))
vi.mock('./use-vault-watcher', () => ({ useVaultWatcher: (options: typeof watch.options) => { watch.options = options }, normalizeWatchPath: (path: string) => path }))

const FOLDER = '/Notes'

function setup(options: {
  paths: string[]
  listed?: string[]
  isPending?: (path: string) => boolean
  reload?: (path: string, canReload: () => boolean) => Promise<void>
}) {
  const refresh = vi.fn(async () => {})
  const reload = vi.fn(options.reload ?? (async () => {}))
  const retargetTabs = vi.fn()
  const dropTabsUnder = vi.fn()
  const onTabsClosed = vi.fn()
  let listed = options.listed ?? options.paths
  renderHook(() => useDocumentWatcher({
    folder: FOLDER,
    paths: options.paths,
    refresh,
    reload,
    isPending: options.isPending ?? (() => false),
    listedPaths: () => listed,
    retargetTabs,
    dropTabsUnder,
    onTabsClosed,
  }))
  const change = async (changedPaths: string[], afterRefresh?: string[]) => {
    refresh.mockImplementation(async () => { if (afterRefresh) listed = afterRefresh })
    await act(async () => { await watch.options?.onVaultChanged(changedPaths) })
  }
  return { change, refresh, reload, retargetTabs, dropTabsUnder, onTabsClosed }
}

beforeEach(() => { watch.options = null })

it('watches the Folder and outside Documents, refreshes the tree and reloads only clean changed Documents', async () => {
  const { change, refresh, reload } = setup({
    paths: [`${FOLDER}/clean.md`, `${FOLDER}/dirty.md`, '/Other/outside.md'],
    isPending: (path) => path === `${FOLDER}/dirty.md`,
  })

  expect(watch.options?.vaultPaths).toEqual([FOLDER, '/Other'])
  await change([`${FOLDER}/clean.md`, `${FOLDER}/dirty.md`, '/Other/outside.md'])

  expect(refresh).toHaveBeenCalledOnce()
  expect(reload.mock.calls.map(([path]) => path)).toEqual([`${FOLDER}/clean.md`, '/Other/outside.md'])
})

it('closes the Tab of a Document deleted in Finder, dirty or not', async () => {
  const { change, reload, dropTabsUnder } = setup({
    paths: [`${FOLDER}/gone.md`],
    isPending: () => true,
  })

  await change([`${FOLDER}/gone.md`], [])

  expect(dropTabsUnder).toHaveBeenCalledWith(`${FOLDER}/gone.md`)
  expect(reload).not.toHaveBeenCalled()
})

it('retargets the Tab of a Document moved to a sibling folder in Finder', async () => {
  const { change, retargetTabs, dropTabsUnder } = setup({ paths: [`${FOLDER}/a.md`] })

  await change([`${FOLDER}/a.md`, `${FOLDER}/docs/a.md`], [`${FOLDER}/docs`, `${FOLDER}/docs/a.md`])

  expect(retargetTabs).toHaveBeenCalledWith(`${FOLDER}/a.md`, `${FOLDER}/docs/a.md`)
  expect(dropTabsUnder).not.toHaveBeenCalled()
})

it('retargets every Tab under a folder renamed in Finder', async () => {
  const { change, retargetTabs } = setup({ paths: [`${FOLDER}/old/a.md`, `${FOLDER}/old/b.md`] })

  await change([`${FOLDER}/old`, `${FOLDER}/new`], [`${FOLDER}/new`, `${FOLDER}/new/a.md`, `${FOLDER}/new/b.md`])

  expect(retargetTabs.mock.calls).toEqual([
    [`${FOLDER}/old/a.md`, `${FOLDER}/new/a.md`],
    [`${FOLDER}/old/b.md`, `${FOLDER}/new/b.md`],
  ])
})

it('closes the Tab of an outside Document whose read says it is gone', async () => {
  const { change, dropTabsUnder } = setup({
    paths: ['/Other/outside.md'],
    reload: async () => { throw new Error('File does not exist: /Other/outside.md') },
  })

  await change(['/Other/outside.md'])

  expect(dropTabsUnder).toHaveBeenCalledWith('/Other/outside.md')
})

it('keeps a Tab whose reload failed for any other reason', async () => {
  const { change, dropTabsUnder } = setup({
    paths: ['/Other/outside.md'],
    reload: async () => { throw new Error('Permission denied (os error 13)') },
  })

  await change(['/Other/outside.md'])

  expect(dropTabsUnder).not.toHaveBeenCalled()
})

it('reports the Tab it closed for a file deleted or renamed in Finder, once', async () => {
  const { change, onTabsClosed } = setup({ paths: [`${FOLDER}/Plan.md`, `${FOLDER}/kept.md`] })

  await change([`${FOLDER}/Plan.md`], [`${FOLDER}/kept.md`])

  expect(onTabsClosed).toHaveBeenCalledOnce()
  expect(onTabsClosed).toHaveBeenCalledWith([`${FOLDER}/Plan.md`])
})

it('reports every Tab one event closed together, an outside Document whose read says it is gone among them', async () => {
  const { change, onTabsClosed } = setup({
    paths: [`${FOLDER}/a.md`, `${FOLDER}/b.png`, '/Other/outside.md'],
    reload: async () => { throw new Error('File does not exist: /Other/outside.md') },
  })

  await change([`${FOLDER}/a.md`, `${FOLDER}/b.png`, '/Other/outside.md'], [])

  expect(onTabsClosed).toHaveBeenCalledOnce()
  expect(onTabsClosed).toHaveBeenCalledWith([`${FOLDER}/a.md`, `${FOLDER}/b.png`, '/Other/outside.md'])
})

it('reports nothing when the Tabs followed a move, or were only reloaded', async () => {
  const { change, onTabsClosed } = setup({ paths: [`${FOLDER}/a.md`, `${FOLDER}/b.md`] })

  await change([`${FOLDER}/a.md`, `${FOLDER}/docs/a.md`, `${FOLDER}/b.md`], [`${FOLDER}/docs`, `${FOLDER}/docs/a.md`, `${FOLDER}/b.md`])

  expect(onTabsClosed).not.toHaveBeenCalled()
})

it('reports nothing for a file trashed in Plumo, whose Tab was already closed when the event arrives', async () => {
  const { change, dropTabsUnder, onTabsClosed } = setup({ paths: [`${FOLDER}/kept.md`], listed: [`${FOLDER}/kept.md`, `${FOLDER}/trashed.md`] })

  await change([`${FOLDER}/trashed.md`], [`${FOLDER}/kept.md`])

  expect(dropTabsUnder).not.toHaveBeenCalled()
  expect(onTabsClosed).not.toHaveBeenCalled()
})

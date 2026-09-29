import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tab } from '@/types'
import { buildExplorerTree, type ListedFile } from './explorer'
import { useDuplicateFile } from './use-duplicate-file'

vi.mock('./explorer-commands', () => ({
  duplicateFile: vi.fn(async () => {}),
}))

const commands = await import('./explorer-commands')
const duplicateFile = vi.mocked(commands.duplicateFile)

const FOLDER = '/Notes'

function listed(relativePath: string, kind: ListedFile['kind']): ListedFile {
  return { path: `${FOLDER}/${relativePath}`, kind, modifiedAt: null, fileSize: 0 }
}

const FILES = [
  listed('Plan.md', 'note'),
  listed('Projects', 'folder'),
  listed('Projects/Roadmap.md', 'note'),
  listed('Projects/Roadmap copy.md', 'note'),
  listed('Projects/lake.png', 'image'),
]

function tab(path: string, mode?: Tab['mode']): Tab {
  return { entry: { path } as Tab['entry'], content: '', mode }
}

function setup({ tabs = [] as Tab[], unsaved = undefined as string | undefined } = {}) {
  const order: string[] = []
  const settle = vi.fn(async (path: string) => { order.push(`settle ${path}`) })
  const unsavedContent = vi.fn(() => unsaved)
  const refresh = vi.fn(async () => { order.push('refresh') })
  const open = vi.fn((path: string) => { order.push(`open ${path}`) })
  const showToast = vi.fn()
  duplicateFile.mockImplementation(async ({ newPath }) => { order.push(`write ${newPath}`) })
  const { result } = renderHook(() => useDuplicateFile({
    folder: FOLDER,
    tree: buildExplorerTree(FOLDER, FILES),
    tabs,
    settle,
    unsavedContent,
    refresh,
    open,
    showToast,
  }))
  return { duplicate: result.current, order, settle, open, showToast }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('useDuplicateFile', () => {
  it('settles the file, copies it beside itself as <name> copy, then opens the copy', async () => {
    const { duplicate, order, open } = setup({ tabs: [tab(`${FOLDER}/Plan.md`, 'raw')] })

    act(() => duplicate(`${FOLDER}/Plan.md`))

    await waitFor(() => expect(open).toHaveBeenCalledWith(`${FOLDER}/Plan copy.md`, 'raw'))
    expect(order).toEqual([`settle ${FOLDER}/Plan.md`, `write ${FOLDER}/Plan copy.md`, 'refresh', `open ${FOLDER}/Plan copy.md`])
    expect(duplicateFile).toHaveBeenCalledWith({
      root: FOLDER,
      path: `${FOLDER}/Plan.md`,
      newPath: `${FOLDER}/Plan copy.md`,
      content: undefined,
    })
  })

  it('skips a copy name the listing already holds', async () => {
    const { duplicate, open } = setup()

    act(() => duplicate(`${FOLDER}/Projects/Roadmap.md`))

    await waitFor(() => expect(open).toHaveBeenCalledWith(`${FOLDER}/Projects/Roadmap copy 2.md`, undefined))
  })

  it('duplicates an Image file byte for byte, keeping its extension', async () => {
    const { duplicate, open } = setup()

    act(() => duplicate(`${FOLDER}/Projects/lake.png`))

    await waitFor(() => expect(open).toHaveBeenCalledWith(`${FOLDER}/Projects/lake copy.png`, undefined))
    expect(duplicateFile).toHaveBeenCalledWith(expect.objectContaining({ content: undefined }))
  })

  it('writes the unsaved edits as the copy when disk does not hold what the Tab shows', async () => {
    const { duplicate, open } = setup({ tabs: [tab(`${FOLDER}/Plan.md`)], unsaved: '# Plan\n\nNot on disk yet.\n' })

    act(() => duplicate(`${FOLDER}/Plan.md`))

    await waitFor(() => expect(open).toHaveBeenCalled())
    expect(duplicateFile).toHaveBeenCalledWith(expect.objectContaining({ content: '# Plan\n\nNot on disk yet.\n' }))
  })

  it('moves on to the next name when one is taken between the listing and the write', async () => {
    const { duplicate, open, showToast } = setup()
    duplicateFile.mockRejectedValueOnce(new Error(`File already exists: ${FOLDER}/Plan copy.md`))

    act(() => duplicate(`${FOLDER}/Plan.md`))

    await waitFor(() => expect(open).toHaveBeenCalledWith(`${FOLDER}/Plan copy 2.md`, undefined))
    expect(showToast).not.toHaveBeenCalled()
  })

  it('shows any other refusal as a toast and opens nothing', async () => {
    const { duplicate, open, showToast } = setup()
    duplicateFile.mockRejectedValueOnce('Failed to duplicate /Notes/Plan.md: Permission denied (os error 13)')

    act(() => duplicate(`${FOLDER}/Plan.md`))

    await waitFor(() => expect(showToast).toHaveBeenCalledWith(
      "Couldn't duplicate Plan.md: Failed to duplicate /Notes/Plan.md: Permission denied (os error 13)",
    ))
    expect(open).not.toHaveBeenCalled()
  })

  it('duplicates a Document outside the Folder beside it, inside its own directory', async () => {
    const { duplicate, open } = setup()

    act(() => duplicate('/Elsewhere/Loose.md'))

    await waitFor(() => expect(open).toHaveBeenCalledWith('/Elsewhere/Loose copy.md', undefined))
    expect(duplicateFile).toHaveBeenCalledWith(expect.objectContaining({ root: '/Elsewhere' }))
  })
})

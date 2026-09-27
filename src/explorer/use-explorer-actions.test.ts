import { useCallback, useState } from 'react'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildExplorerTree, type ListedFile } from '@/folder/explorer'
import { isWithinPrefix, replaceFolderPrefix } from '@/folder/folder-action-utils'
import { useExplorerActions } from './use-explorer-actions'

vi.mock('@/folder/explorer-commands', () => ({
  createDocumentFile: vi.fn(async () => {}),
  createFolderDirectory: vi.fn(async () => 'New Folder'),
  renameFile: vi.fn(async () => ''),
  renameFolderDirectory: vi.fn(async () => ''),
  moveFileToFolder: vi.fn(async () => ''),
  moveFileToTrash: vi.fn(async () => ''),
  moveFolderToTrash: vi.fn(async () => ''),
  revealPath: vi.fn(async () => {}),
  copyPathToClipboard: vi.fn(async () => {}),
}))

const commands = await import('@/folder/explorer-commands')
const createDocumentFile = vi.mocked(commands.createDocumentFile)
const createFolderDirectory = vi.mocked(commands.createFolderDirectory)
const renameFile = vi.mocked(commands.renameFile)
const renameFolderDirectory = vi.mocked(commands.renameFolderDirectory)
const moveFileToFolder = vi.mocked(commands.moveFileToFolder)
const moveFileToTrash = vi.mocked(commands.moveFileToTrash)
const moveFolderToTrash = vi.mocked(commands.moveFolderToTrash)

const FOLDER = '/Notes'

function listed(relativePath: string, kind: ListedFile['kind']): ListedFile {
  return { path: `${FOLDER}/${relativePath}`, kind, modifiedAt: null, fileSize: 0 }
}

const FILES = [
  listed('Welcome.md', 'note'),
  listed('Projects', 'folder'),
  listed('Projects/Plumo.md', 'note'),
  listed('Projects/Notes.md', 'note'),
  listed('Projects/lake.png', 'image'),
]

/**
 * The hook as App wires it: App owns the active Tab's path, and its
 * `retargetTabs` moves that path in the same batch as the Explorer's own
 * state, so the harness does the same rather than stubbing it flat.
 */
function setup(files: ListedFile[] = FILES, initialActiveTabPath: string | null = null) {
  const refresh = vi.fn(async () => {})
  const openNote = vi.fn()
  const focusEditor = vi.fn()
  const retargetTabs = vi.fn()
  const settleActiveDocument = vi.fn(async () => {})
  const settleTabsUnder = vi.fn(async () => {})
  const dropTabsUnder = vi.fn()
  const showToast = vi.fn()
  const order: string[] = []
  settleTabsUnder.mockImplementation(async () => { order.push('settle') })
  dropTabsUnder.mockImplementation(() => { order.push('drop') })
  const tree = buildExplorerTree(FOLDER, files)
  const hook = renderHook(() => {
    const [activeTabPath, setActiveTabPath] = useState(initialActiveTabPath)
    const retarget = useCallback((oldPath: string, newPath: string) => {
      retargetTabs(oldPath, newPath)
      setActiveTabPath((current) => (
        current && isWithinPrefix({ path: current, prefix: oldPath })
          ? replaceFolderPrefix({ path: current, oldPrefix: oldPath, newPrefix: newPath })
          : current
      ))
    }, [])
    return useExplorerActions({
      folder: FOLDER,
      tree,
      activeTabPath,
      refresh,
      openNote,
      focusEditor,
      settleActiveDocument,
      retargetTabs: retarget,
      settleTabsUnder,
      dropTabsUnder,
      showToast,
    })
  })
  return { ...hook, refresh, openNote, focusEditor, retargetTabs, settleActiveDocument, settleTabsUnder, dropTabsUnder, showToast, order }
}

beforeEach(() => {
  vi.clearAllMocks()
  createDocumentFile.mockImplementation(async () => {})
  createFolderDirectory.mockImplementation(async () => 'New Folder')
  moveFileToTrash.mockImplementation(async (params) => params.path)
  moveFolderToTrash.mockImplementation(async (params) => params.path)
})

describe('creating a Document', () => {
  it('lands it inside the selected folder, opens its Tab and starts the rename', async () => {
    const { result, openNote, focusEditor } = setup()

    act(() => { result.current.select(`${FOLDER}/Projects`) })
    act(() => { result.current.createDocument() })

    await waitFor(() => expect(result.current.editing).not.toBeNull())
    expect(createDocumentFile).toHaveBeenCalledWith({ folder: FOLDER, path: `${FOLDER}/Projects/Untitled.md` })
    expect(openNote).toHaveBeenCalledWith(`${FOLDER}/Projects/Untitled.md`)
    expect(result.current.editing).toEqual({
      path: `${FOLDER}/Projects/Untitled.md`,
      kind: 'note',
      stem: 'Untitled',
      extension: '.md',
      created: true,
    })
    expect(result.current.selected).toBe(`${FOLDER}/Projects/Untitled.md`)
    // The rename input takes focus; the editor's turn comes when the name is in.
    expect(focusEditor).not.toHaveBeenCalled()
  })

  it('with the sidebar collapsed keeps the Untitled name, opens its Tab and hands the editor focus (AIM-463)', async () => {
    const { result, openNote, focusEditor } = setup()

    act(() => { result.current.createDocument({ rename: false }) })

    await waitFor(() => expect(openNote).toHaveBeenCalledWith(`${FOLDER}/Untitled.md`))
    expect(focusEditor).toHaveBeenCalledWith(`${FOLDER}/Untitled.md`)
    expect(result.current.editing).toBeNull()
  })

  it('lands it in the parent of a selected Document', async () => {
    const { result } = setup()

    act(() => { result.current.select(`${FOLDER}/Projects/Plumo.md`) })
    act(() => { result.current.createDocument() })

    await waitFor(() => expect(createDocumentFile).toHaveBeenCalledWith({
      folder: FOLDER,
      path: `${FOLDER}/Projects/Untitled.md`,
    }))
  })

  it('lands it at the Folder root with nothing selected', async () => {
    const { result } = setup()

    act(() => { result.current.createDocument() })

    await waitFor(() => expect(createDocumentFile).toHaveBeenCalledWith({
      folder: FOLDER,
      path: `${FOLDER}/Untitled.md`,
    }))
  })

  it('suffixes around the names the listing already holds', async () => {
    const { result } = setup([...FILES, listed('Untitled.md', 'note'), listed('Untitled 2.md', 'note')])

    act(() => { result.current.createDocument() })

    await waitFor(() => expect(createDocumentFile).toHaveBeenCalledWith({
      folder: FOLDER,
      path: `${FOLDER}/Untitled 3.md`,
    }))
  })

  it('suffixes again when the write is refused, so creation never errors', async () => {
    createDocumentFile.mockRejectedValueOnce('File already exists')
    const { result } = setup()

    act(() => { result.current.createDocument() })

    await waitFor(() => expect(result.current.editing?.path).toBe(`${FOLDER}/Untitled 2.md`))
    expect(createDocumentFile).toHaveBeenCalledTimes(2)
    expect(result.current.error).toBeNull()
  })
})

describe('creating a folder', () => {
  it('creates it without opening a Tab and starts the rename', async () => {
    const { result, openNote } = setup()

    act(() => { result.current.createFolderIn(`${FOLDER}/Projects`) })

    await waitFor(() => expect(result.current.editing).not.toBeNull())
    expect(createFolderDirectory).toHaveBeenCalledWith({
      folder: FOLDER,
      parentPath: `${FOLDER}/Projects`,
      name: 'New Folder',
    })
    expect(openNote).not.toHaveBeenCalled()
    expect(result.current.editing).toEqual({
      path: `${FOLDER}/Projects/New Folder`,
      kind: 'folder',
      stem: 'New Folder',
      extension: '',
      created: false,
    })
  })

  it('suffixes a second folder', async () => {
    const { result } = setup([...FILES, listed('New Folder', 'folder')])

    act(() => { result.current.createFolderIn(FOLDER) })

    await waitFor(() => expect(createFolderDirectory).toHaveBeenCalledWith({
      folder: FOLDER,
      parentPath: FOLDER,
      name: 'New Folder 2',
    }))
  })
})

describe('renaming', () => {
  it('renames a Document, retargets its Tab and keeps the row selected', async () => {
    renameFile.mockResolvedValue(`${FOLDER}/Projects/Plumo v2.md`)
    const { result, retargetTabs, refresh, settleActiveDocument } = setup()

    act(() => { result.current.startRename(`${FOLDER}/Projects/Plumo.md`, 'note') })
    expect(result.current.editing?.created).toBe(false)
    await act(async () => { await result.current.commitRename('Plumo v2') })

    expect(renameFile).toHaveBeenCalledWith({
      folder: FOLDER,
      path: `${FOLDER}/Projects/Plumo.md`,
      stem: 'Plumo v2',
    })
    expect(retargetTabs).toHaveBeenCalledWith(`${FOLDER}/Projects/Plumo.md`, `${FOLDER}/Projects/Plumo v2.md`)
    expect(settleActiveDocument).toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
    expect(result.current.selected).toBe(`${FOLDER}/Projects/Plumo v2.md`)
    expect(result.current.editing).toBeNull()
  })

  it('renames a folder through the folder command', async () => {
    renameFolderDirectory.mockResolvedValue(`${FOLDER}/Work`)
    const { result, retargetTabs } = setup()

    act(() => { result.current.startRename(`${FOLDER}/Projects`, 'folder') })
    await act(async () => { await result.current.commitRename('Work') })

    expect(renameFolderDirectory).toHaveBeenCalledWith({ folder: FOLDER, path: `${FOLDER}/Projects`, name: 'Work' })
    expect(retargetTabs).toHaveBeenCalledWith(`${FOLDER}/Projects`, `${FOLDER}/Work`)
  })

  it('renames even when the pending write was refused; the error bar owns that', async () => {
    renameFile.mockResolvedValue(`${FOLDER}/Readme.md`)
    const { result, settleActiveDocument } = setup()
    settleActiveDocument.mockRejectedValue(new Error('Write failure'))

    act(() => { result.current.startRename(`${FOLDER}/Welcome.md`, 'note') })
    await act(async () => { await result.current.commitRename('Readme') })

    expect(renameFile).toHaveBeenCalled()
    expect(result.current.error).toBeNull()
  })

  it('reports a collision inline and leaves the file alone', async () => {
    const { result } = setup()

    act(() => { result.current.startRename(`${FOLDER}/Projects/Plumo.md`, 'note') })
    let committed = true
    await act(async () => { committed = await result.current.commitRename('Notes') })

    expect(committed).toBe(false)
    expect(result.current.error).toBe('A Document named Notes.md already exists')
    expect(renameFile).not.toHaveBeenCalled()
    expect(result.current.editing).not.toBeNull()
  })

  // The Tab under a renamed folder moves with it, which changes the active
  // Tab's path; the folder row is what the user renamed, so it stays selected.
  it('keeps the renamed folder selected when a Document under it is the active Tab', async () => {
    renameFolderDirectory.mockResolvedValue(`${FOLDER}/Work`)
    const { result } = setup(FILES, `${FOLDER}/Projects/Plumo.md`)

    act(() => { result.current.startRename(`${FOLDER}/Projects`, 'folder') })
    await act(async () => { await result.current.commitRename('Work') })

    expect(result.current.selected).toBe(`${FOLDER}/Work`)
  })

  it('reports a trailing space, which the Rust side would otherwise trim away', async () => {
    const { result } = setup()

    act(() => { result.current.startRename(`${FOLDER}/Welcome.md`, 'note') })
    await act(async () => { await result.current.commitRename('Draft ') })

    expect(result.current.error).toBe('A name cannot end with a space or a dot')
    expect(renameFile).not.toHaveBeenCalled()
    expect(result.current.editing).not.toBeNull()
  })

  it('reports a name the filesystem will not take', async () => {
    const { result } = setup()

    act(() => { result.current.startRename(`${FOLDER}/Welcome.md`, 'note') })
    await act(async () => { await result.current.commitRename('Draft.') })

    expect(result.current.error).toBe('A name cannot end with a space or a dot')
    expect(renameFile).not.toHaveBeenCalled()
  })

  it('reports what the Rust side refused', async () => {
    renameFile.mockRejectedValue('A file with that name already exists')
    const { result } = setup()

    act(() => { result.current.startRename(`${FOLDER}/Welcome.md`, 'note') })
    await act(async () => { await result.current.commitRename('Readme') })

    expect(result.current.error).toBe('A file with that name already exists')
    expect(result.current.editing).not.toBeNull()
  })

  it('cancels silently on an unchanged name', async () => {
    const { result } = setup()

    act(() => { result.current.startRename(`${FOLDER}/Welcome.md`, 'note') })
    await act(async () => { await result.current.commitRename('Welcome') })

    expect(renameFile).not.toHaveBeenCalled()
    expect(result.current.editing).toBeNull()
    expect(result.current.error).toBeNull()
  })

  it('cancels silently on an empty name', async () => {
    const { result } = setup()

    act(() => { result.current.startRename(`${FOLDER}/Welcome.md`, 'note') })
    await act(async () => { await result.current.commitRename('   ') })

    expect(renameFile).not.toHaveBeenCalled()
    expect(result.current.editing).toBeNull()
  })

  it('drops the input and the message on Escape', () => {
    const { result } = setup()

    act(() => { result.current.startRename(`${FOLDER}/Welcome.md`, 'note') })
    act(() => { result.current.cancelRename() })

    expect(result.current.editing).toBeNull()
    expect(result.current.error).toBeNull()
  })
})

describe('Move to Trash', () => {
  it('flushes the open Document, trashes the file, then closes its Tab', async () => {
    const { result, order, settleTabsUnder, dropTabsUnder, refresh } = setup()

    await act(async () => { result.current.trash(`${FOLDER}/Welcome.md`, 'note') })

    await waitFor(() => expect(moveFileToTrash).toHaveBeenCalledWith({ folder: FOLDER, path: `${FOLDER}/Welcome.md` }))
    expect(settleTabsUnder).toHaveBeenCalledWith(`${FOLDER}/Welcome.md`)
    expect(dropTabsUnder).toHaveBeenCalledWith(`${FOLDER}/Welcome.md`)
    expect(order).toEqual(['settle', 'drop'])
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('trashes a folder whole, so every Tab under it closes', async () => {
    const { result, dropTabsUnder } = setup()

    await act(async () => { result.current.trash(`${FOLDER}/Projects`, 'folder') })

    await waitFor(() => expect(moveFolderToTrash).toHaveBeenCalledWith({ folder: FOLDER, path: `${FOLDER}/Projects` }))
    expect(moveFileToTrash).not.toHaveBeenCalled()
    expect(dropTabsUnder).toHaveBeenCalledWith(`${FOLDER}/Projects`)
  })

  it('leaves the Tabs open and says so when the Trash refuses the file', async () => {
    moveFileToTrash.mockRejectedValue(new Error('Failed to move to the Trash'))
    const { result, dropTabsUnder, showToast } = setup()

    await act(async () => { result.current.trash(`${FOLDER}/Welcome.md`, 'note') })

    await waitFor(() => expect(showToast).toHaveBeenCalledWith('Failed to move to the Trash'))
    expect(dropTabsUnder).not.toHaveBeenCalled()
  })

  it('drops the selection when the trashed row held it', async () => {
    const { result } = setup()
    act(() => { result.current.select(`${FOLDER}/Projects/Plumo.md`) })

    await act(async () => { result.current.trash(`${FOLDER}/Projects`, 'folder') })

    await waitFor(() => expect(result.current.selected).toBeNull())
  })
})

describe('a drag-and-drop move', () => {
  it('moves the file, retargets its Tab and leaves the row selected', async () => {
    moveFileToFolder.mockResolvedValue(`${FOLDER}/Projects/Welcome.md`)
    const { result, retargetTabs, refresh } = setup()

    await act(async () => { result.current.moveInto(`${FOLDER}/Welcome.md`, `${FOLDER}/Projects`) })

    await waitFor(() => expect(moveFileToFolder).toHaveBeenCalledWith({
      folder: FOLDER, path: `${FOLDER}/Welcome.md`, destination: `${FOLDER}/Projects`,
    }))
    expect(retargetTabs).toHaveBeenCalledWith(`${FOLDER}/Welcome.md`, `${FOLDER}/Projects/Welcome.md`)
    expect(result.current.selected).toBe(`${FOLDER}/Projects/Welcome.md`)
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it('writes the Document\'s pending edits before the move', async () => {
    moveFileToFolder.mockResolvedValue(`${FOLDER}/Projects/Welcome.md`)
    const { result, settleActiveDocument } = setup()

    await act(async () => { result.current.moveInto(`${FOLDER}/Welcome.md`, `${FOLDER}/Projects`) })

    await waitFor(() => expect(settleActiveDocument).toHaveBeenCalled())
  })

  it('moves an Image file up to the Folder root like a Document', async () => {
    moveFileToFolder.mockResolvedValue(`${FOLDER}/lake.png`)
    const { result, retargetTabs } = setup()

    await act(async () => { result.current.moveInto(`${FOLDER}/Projects/lake.png`, FOLDER) })

    await waitFor(() => expect(moveFileToFolder).toHaveBeenCalledWith({
      folder: FOLDER, path: `${FOLDER}/Projects/lake.png`, destination: FOLDER,
    }))
    expect(retargetTabs).toHaveBeenCalledWith(`${FOLDER}/Projects/lake.png`, `${FOLDER}/lake.png`)
  })

  it('names the destination folder in the collision toast', async () => {
    const { result, showToast } = setup([
      listed('Welcome.md', 'note'),
      listed('docs', 'folder'),
      listed('docs/adr', 'folder'),
      listed('docs/adr/Welcome.md', 'note'),
    ])

    await act(async () => { result.current.moveInto(`${FOLDER}/Welcome.md`, `${FOLDER}/docs/adr`) })

    expect(showToast).toHaveBeenCalledWith('docs/adr already has Welcome.md')
    expect(moveFileToFolder).not.toHaveBeenCalled()
  })

  it('says nothing and does nothing when the file is dropped on the folder it is already in', async () => {
    const { result, showToast } = setup()

    await act(async () => { result.current.moveInto(`${FOLDER}/Projects/Plumo.md`, `${FOLDER}/Projects`) })

    expect(moveFileToFolder).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })
})

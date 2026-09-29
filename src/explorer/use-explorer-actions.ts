import { useCallback, useMemo, useState } from 'react'
import type { ExplorerNode } from '@/folder/explorer'
import {
  creationParentPath,
  isNameTaken,
  lockedExtension,
  nameCommitError,
  nextAvailableName,
  siblingNames,
  type ExplorerRowKind,
} from '@/folder/explorer-names'
import {
  copyPathToClipboard,
  createDocumentFile,
  createFolderDirectory,
  moveFileToFolder,
  moveFileToTrash,
  moveFolderToTrash,
  renameFile,
  renameFolderDirectory,
  revealPath,
} from '@/folder/explorer-commands'
import { notePathFilename } from '@/lib/note-path-identity'
import { isPathInsideVaultRoot } from '@/lib/vault-path-containment'
import { isWithinPrefix, replaceFolderPrefix } from '@/folder/folder-action-utils'
import { canMoveInto } from './note-drag-drop'

/**
 * The Explorer's write operations and the state behind them:
 * the selected row, the row in inline rename, and the inline error.
 *
 * Creation writes to disk before anything is named: `Untitled.md` lands, its
 * Tab opens, and the new row enters rename with the stem selected. Rename is a
 * single `fs::rename` on the Rust side, with the name checked here first so
 * the reason shows under the row rather than as a thrown string. A move is the
 * same single `fs::rename` into another folder, and Move to Trash hands the
 * file to the macOS Trash with nothing to confirm.
 *
 * What the Tabs do about all this is App's: this hook says which paths moved
 * and which went away, and the Tab rules are applied there.
 */

export interface ExplorerEditing {
  path: string
  kind: ExplorerRowKind
  /** The stem the row arrived with; a commit that matches it cancels silently. */
  stem: string
  /** Dim static text beside the input, never editable. */
  extension: string
  /** The row is a Document just created: naming it from the keyboard hands focus to the editor, not back to the row. */
  created: boolean
}

export interface CreateDocumentOptions {
  /**
   * Whether the new row enters rename, the default. With the sidebar
   * collapsed there is no row to name it in, so the Document keeps its
   * Untitled name and the editor takes focus instead (AIM-463).
   */
  rename?: boolean
}

export interface ExplorerActions {
  selected: string | null
  select: (path: string) => void
  editing: ExplorerEditing | null
  error: string | null
  /** ⌘N and the header "+": a Document where the selection points. */
  createDocument: (options?: CreateDocumentOptions) => void
  /** The header "…" and a folder's menu: a folder where the selection points. */
  createFolder: () => void
  createDocumentIn: (folderPath: string, options?: CreateDocumentOptions) => void
  createFolderIn: (folderPath: string) => void
  startRename: (path: string, kind: ExplorerRowKind) => void
  commitRename: (stem: string) => Promise<boolean>
  cancelRename: () => void
  /** The name in rename was changed after a refusal: the message goes until the next commit. */
  clearError: () => void
  /** Move to Trash: no confirmation, and every Tab at or under the row closes. */
  trash: (path: string, kind: ExplorerRowKind) => void
  /** A dragged Document or Image file dropped on a folder row, a file row (its folder), or the header or empty area (the Folder's top level). */
  moveInto: (path: string, destination: string) => void
  /** Duplicate a Document or an Image file: the copy lands beside it and opens as the active Tab. */
  duplicate: (path: string) => void
  reveal: (path: string) => void
  copyPath: (path: string) => void
}

interface Options {
  folder: string | null
  /** The Explorer tree, or null with no Folder open. */
  tree: ExplorerNode | null
  activeTabPath: string | null
  refresh: () => Promise<void>
  openNote: (path: string) => void
  /** The editor takes focus once the Document's Tab is showing: a Document created with no row to name it in. */
  focusEditor: (path: string) => void
  /**
   * Write the active Document's pending edits before a rename moves it, so the
   * save buffer is not left holding bytes for a path that no longer exists. A
   * refusal is the error bar's to report, and does not stop the rename.
   */
  settleActiveDocument: () => Promise<void>
  /** Move an open Tab, and every Tab under a renamed folder, to the new path. */
  retargetTabs: (oldPath: string, newPath: string) => void
  /**
   * Write the pending edits of every open Document at or under a path, so a
   * Document about to be trashed reaches the Trash holding its last edit.
   */
  settleTabsUnder: (prefix: string) => Promise<void>
  /**
   * Cancel the pending Autosave of every Tab at or under a path and close
   * them. Plumo never recreates a removed file, so the cancellation is the
   * point: the Tab's buffered edits go with it.
   */
  dropTabsUnder: (prefix: string) => void
  /** A toast saying a move or a Trash was refused. */
  showToast: (message: string) => void
  /** Duplicate, which the Pinned list and the active Tab's menus run too, so it is App's. */
  duplicate: (path: string) => void
}

/** How many suffixes to try before giving up; creation never errors, so it gives up quietly. */
const CREATE_ATTEMPTS = 25

function failureMessage(cause: unknown): string {
  if (typeof cause === 'string') return cause
  if (cause instanceof Error) return cause.message
  return 'That name could not be used'
}

/**
 * Take the first name the filesystem accepts. The listing says which names are
 * taken, but it can be a moment stale, so a refused write suffixes and tries
 * again rather than reporting anything: creation never errors.
 */
async function createWithFreeName(
  taken: readonly string[],
  base: string,
  extension: string,
  write: (name: string) => Promise<unknown>,
): Promise<string | null> {
  const held = [...taken]
  for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt += 1) {
    const name = nextAvailableName(held, base, extension)
    try {
      await write(name)
      return name
    } catch {
      held.push(name)
    }
  }
  return null
}

/** The selected row follows the active Tab, and drops when that Tab is outside the Folder. */
function useSelectionFollowingActiveTab(activeTabPath: string | null, folder: string | null) {
  const [selected, setSelected] = useState<string | null>(null)
  const [followed, setFollowed] = useState<string | null>(null)
  if (followed !== activeTabPath) {
    setFollowed(activeTabPath)
    setSelected(activeTabPath && folder && isPathInsideVaultRoot(activeTabPath, folder) ? activeTabPath : null)
  }

  /**
   * A rename moved the row, and with it the active Tab. The Tab it follows is
   * carried across by hand so the next render sees no change and leaves the
   * selection alone: renaming a folder keeps the *folder* row selected, not
   * the Document that happens to be open beneath it.
   */
  const selectThroughRename = useCallback((oldPath: string, newPath: string) => {
    setFollowed((current) => (
      current && isWithinPrefix({ path: current, prefix: oldPath })
        ? replaceFolderPrefix({ path: current, oldPrefix: oldPath, newPrefix: newPath })
        : current
    ))
    setSelected(newPath)
  }, [])

  return { selected, setSelected, selectThroughRename }
}

/** How a folder is named in a toast: its path under the Folder, or the Folder's own name. */
function destinationLabel(folder: string, destination: string): string {
  const root = folder.replace(/\/+$/u, '')
  return destination === root ? notePathFilename(root) || root : destination.slice(root.length + 1)
}

export function useExplorerActions(options: Options): ExplorerActions {
  const {
    folder, tree, activeTabPath, refresh, openNote, focusEditor, settleActiveDocument, retargetTabs,
    settleTabsUnder, dropTabsUnder, showToast, duplicate,
  } = options
  const { selected, setSelected, selectThroughRename } = useSelectionFollowingActiveTab(activeTabPath, folder)
  const [editing, setEditing] = useState<ExplorerEditing | null>(null)
  const [error, setError] = useState<string | null>(null)

  const startRenameOf = useCallback((path: string, kind: ExplorerRowKind, created: boolean) => {
    const { stem, extension } = kind === 'folder'
      ? { stem: notePathFilename(path), extension: '' }
      : lockedExtension(notePathFilename(path))
    setSelected(path)
    setError(null)
    setEditing({ path, kind, stem, extension, created })
  }, [setSelected])

  const startRename = useCallback((path: string, kind: ExplorerRowKind) => {
    startRenameOf(path, kind, false)
  }, [startRenameOf])

  const cancelRename = useCallback(() => {
    setEditing(null)
    setError(null)
  }, [])

  const clearError = useCallback(() => setError(null), [])

  const createDocumentIn = useCallback((folderPath: string, { rename = true }: CreateDocumentOptions = {}) => {
    void (async () => {
      if (!folder || !tree) return
      const name = await createWithFreeName(
        siblingNames(tree, folderPath, { of: 'children' }),
        'Untitled',
        '.md',
        (candidate) => createDocumentFile({ folder, path: `${folderPath}/${candidate}` }),
      )
      if (!name) return
      const path = `${folderPath}/${name}`
      await refresh()
      openNote(path)
      if (rename) startRenameOf(path, 'note', true)
      else focusEditor(path)
    })().catch((cause: unknown) => console.warn('Could not create a Document:', cause))
  }, [focusEditor, folder, openNote, refresh, startRenameOf, tree])

  const createFolderIn = useCallback((folderPath: string) => {
    void (async () => {
      if (!folder || !tree) return
      const name = await createWithFreeName(
        siblingNames(tree, folderPath, { of: 'children' }),
        'New Folder',
        '',
        (candidate) => createFolderDirectory({ folder, parentPath: folderPath, name: candidate }),
      )
      if (!name) return
      await refresh()
      startRename(`${folderPath}/${name}`, 'folder')
    })().catch((cause: unknown) => console.warn('Could not create a folder:', cause))
  }, [folder, refresh, startRename, tree])

  // One placement rule for ⌘N, the header "+" and the context menu: a folder
  // (or the Folder itself) takes it inside, a file row takes it into its parent, and
  // nothing selected means the Folder root.
  const createDocument = useCallback((options?: CreateDocumentOptions) => {
    if (tree) createDocumentIn(creationParentPath(tree, selected), options)
  }, [createDocumentIn, selected, tree])

  const createFolder = useCallback(() => {
    if (tree) createFolderIn(creationParentPath(tree, selected))
  }, [createFolderIn, selected, tree])

  const commitRename = useCallback(async (typed: string): Promise<boolean> => {
    if (!editing || !folder || !tree) return true
    const stem = typed.trim()
    // Blur commits a changed name; unchanged or empty cancels without a word.
    if (!stem || stem === editing.stem) {
      cancelRename()
      return true
    }

    // The typed value, untrimmed: a trailing space is one of the names the
    // Explorer refuses, and the Rust side would quietly trim it away.
    const refusal = nameCommitError({
      kind: editing.kind,
      stem: typed,
      extension: editing.extension,
      siblings: siblingNames(tree, editing.path),
    })
    if (refusal) {
      setError(refusal)
      return false
    }

    await settleActiveDocument().catch(() => {})
    try {
      const path = editing.kind === 'folder'
        ? await renameFolderDirectory({ folder, path: editing.path, name: stem })
        : await renameFile({ folder, path: editing.path, stem })
      retargetTabs(editing.path, path)
      selectThroughRename(editing.path, path)
      setEditing(null)
      setError(null)
      await refresh()
      return true
    } catch (cause: unknown) {
      setError(failureMessage(cause))
      return false
    }
  }, [cancelRename, editing, folder, refresh, retargetTabs, selectThroughRename, settleActiveDocument, tree])

  /**
   * Move to Trash: no confirmation, and no going back through
   * Plumo. The order is what the rules ask for — the open Documents write their
   * pending edits while the file is still there, the file leaves, and only
   * then do the Tabs close with their Autosave cancelled. A refusal leaves
   * every Tab where it was.
   */
  const trash = useCallback((path: string, kind: ExplorerRowKind) => {
    void (async () => {
      if (!folder) return
      await settleTabsUnder(path)
      if (kind === 'folder') await moveFolderToTrash({ folder, path })
      else await moveFileToTrash({ folder, path })
      dropTabsUnder(path)
      setSelected((current) => (current && isWithinPrefix({ path: current, prefix: path }) ? null : current))
      await refresh()
    })().catch((cause: unknown) => showToast(failureMessage(cause)))
  }, [dropTabsUnder, folder, refresh, setSelected, settleTabsUnder, showToast])

  /**
   * A drag-and-drop move: one `fs::rename` into the folder
   * the row was dropped on. A name the destination already holds refuses the
   * move with a toast rather than suffixing, so nothing is silently renamed;
   * the listing answers that, and the Rust side is the backstop.
   */
  const moveInto = useCallback((path: string, destination: string) => {
    void (async () => {
      if (!folder || !tree) return
      if (!canMoveInto(path, destination)) return
      const filename = notePathFilename(path)
      if (isNameTaken(siblingNames(tree, destination, { of: 'children' }), filename)) {
        showToast(`${destinationLabel(folder, destination)} already has ${filename}`)
        return
      }
      await settleActiveDocument().catch(() => {})
      const newPath = await moveFileToFolder({ folder, path, destination })
      retargetTabs(path, newPath)
      selectThroughRename(path, newPath)
      await refresh()
    })().catch((cause: unknown) => showToast(failureMessage(cause)))
  }, [folder, refresh, retargetTabs, selectThroughRename, settleActiveDocument, showToast, tree])

  const reveal = useCallback((path: string) => {
    revealPath(path).catch((cause: unknown) => console.warn('Could not reveal the path:', cause))
  }, [])

  const copyPath = useCallback((path: string) => {
    copyPathToClipboard(path).catch((cause: unknown) => console.warn('Could not copy the path:', cause))
  }, [])

  return useMemo(() => ({
    selected,
    select: setSelected,
    editing,
    error,
    createDocument,
    createFolder,
    createDocumentIn,
    createFolderIn,
    startRename,
    commitRename,
    cancelRename,
    clearError,
    trash,
    moveInto,
    duplicate,
    reveal,
    copyPath,
  }), [
    cancelRename, clearError, commitRename, copyPath, createDocument, createDocumentIn, createFolder,
    createFolderIn, duplicate, editing, error, moveInto, reveal, selected, setSelected, startRename, trash,
  ])
}

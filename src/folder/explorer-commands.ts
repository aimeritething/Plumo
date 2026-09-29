import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '@/platform/tauri'
import { noteRootForPath } from './note-entry'

/**
 * The Tauri commands behind the Explorer's write operations. Everything the
 * Explorer does to disk goes through here, which is the one seam the mock
 * Folder fixture stands in for.
 */

function command<T>(name: string, args: Record<string, unknown>): Promise<T> {
  return (isTauri() ? invoke : mockInvoke)<T>(name, args)
}

/**
 * A command whose Rust signature is one `args` struct rather than loose
 * parameters (the kernel's shape for rename and move). Tauri deserializes it from
 * an `args` key; the Folder fixture reads the fields flat, as every other
 * command hands them over.
 */
function structuredCommand<T>(name: string, args: Record<string, unknown>): Promise<T> {
  return isTauri() ? invoke<T>(name, { args }) : mockInvoke<T>(name, args)
}

function folderRoot(folder: string): string {
  return folder.replace(/\/+$/u, '')
}

/** A Folder-relative path, which is what the folder commands take. */
function folderRelativePath(folder: string, path: string): string {
  const root = folderRoot(folder)
  return path === root ? '' : path.slice(root.length + 1)
}

/** Write a new, empty Document. Fails when the name is taken, so the caller suffixes and retries. */
export function createDocumentFile(params: { folder: string; path: string }): Promise<void> {
  return command<void>('create_note_content', {
    path: params.path,
    content: '',
    vaultPath: params.folder,
  })
}

/**
 * Duplicate: a new file at `newPath`, beside `path`, inside `root` (the
 * file's boundary root). With `content`, a Document's unsaved edits are
 * written in place of the bytes on disk. Fails when the name is taken, so the
 * caller suffixes and retries.
 */
export function duplicateFile(params: {
  root: string
  path: string
  newPath: string
  content?: string
}): Promise<void> {
  if (params.content !== undefined) {
    return command<void>('create_note_content', {
      path: params.newPath,
      content: params.content,
      vaultPath: params.root,
    })
  }
  return command<void>('duplicate_vault_file', {
    path: params.path,
    newPath: params.newPath,
    vaultPath: params.root,
  })
}

/** Create a folder. Fails when the name is taken, so the caller suffixes and retries. */
export function createFolderDirectory(params: {
  folder: string
  parentPath: string
  name: string
}): Promise<string> {
  return command<string>('create_vault_folder', {
    vaultPath: params.folder,
    folderName: params.name,
    parentPath: folderRelativePath(params.folder, params.parentPath),
  })
}

/** Rename a Document or an Image file, keeping its folder and its extension. */
export async function renameFile(params: {
  folder: string
  path: string
  stem: string
}): Promise<string> {
  const result = await structuredCommand<{ new_path: string }>('rename_vault_file', {
    vaultPath: params.folder,
    oldPath: params.path,
    newStem: params.stem,
  })
  return result.new_path
}

/**
 * A drag-and-drop move: one `fs::rename` into another folder, keeping the file
 * name. The Rust side refuses a name the destination already holds rather than
 * replacing it; the Explorer catches the collision first, from the listing.
 */
export async function moveFileToFolder(params: {
  folder: string
  path: string
  destination: string
}): Promise<string> {
  const result = await structuredCommand<{ new_path: string }>('move_note_to_folder', {
    vaultPath: params.folder,
    oldPath: params.path,
    folderPath: folderRelativePath(params.folder, params.destination),
  })
  return result.new_path
}

/** Move a Document or an Image file to the macOS Trash. */
export function moveFileToTrash(params: { folder: string; path: string }): Promise<string> {
  return command<string>('delete_note', { path: params.path, vaultPath: params.folder })
}

/** Move a folder, and everything under it, to the macOS Trash. */
export function moveFolderToTrash(params: { folder: string; path: string }): Promise<string> {
  return command<string>('delete_vault_folder', {
    vaultPath: params.folder,
    folderPath: folderRelativePath(params.folder, params.path),
  })
}

/** Rename a folder. The Rust side answers in Folder-relative paths. */
export async function renameFolderDirectory(params: {
  folder: string
  path: string
  name: string
}): Promise<string> {
  const result = await command<{ new_path: string }>('rename_vault_folder', {
    vaultPath: params.folder,
    folderPath: folderRelativePath(params.folder, params.path),
    newName: params.name,
  })
  return result.new_path
    ? `${folderRoot(params.folder)}/${result.new_path}`
    : noteRootForPath(params.path)
}

/** Reveal in Finder: the Explorer's context menu on a row, and the File menu's command on the active Tab. */
export function revealPath(path: string): Promise<void> {
  return command<void>('reveal_path_in_file_manager', { path })
}

/**
 * Open in Default App: the file handed to the app macOS opens it with. The
 * Rust side refuses a path outside `root`, the Tab's boundary root (its
 * Folder, or a lone Document's own directory).
 */
export function openPathInDefaultApp(path: string, root: string): Promise<void> {
  return command<void>('open_vault_file_external', { path, vaultPath: root })
}

/** Copy Path: the absolute path, onto the system clipboard. */
export function copyPathToClipboard(path: string): Promise<void> {
  return command<void>('copy_text_to_clipboard', { text: path })
}

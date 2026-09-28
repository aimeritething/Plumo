import { useCallback, useRef, useState } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { getMockVault, isTauri, mockInvoke } from '@/platform/tauri'
import type { ListedFile } from './explorer'
import { findByNotePath } from '@/lib/note-path-identity'
import { allowVaultAssets } from './vault-asset-scope'

async function listFiles(vaultPath: string): Promise<ListedFile[]> {
  const command = isTauri() ? invoke : mockInvoke
  return command<ListedFile[]>('list_files', { vaultPath })
}

/** The path a Folder is known by: no trailing slash, except the root's own. */
export function normalizeFolderPath(path: string): string {
  return path.replace(/\/+$/u, '') || '/'
}

/** A Folder that would not list: gone, or not a directory any more. */
export class FolderNotFoundError extends Error {
  readonly path: string

  constructor(path: string, options?: ErrorOptions) {
    super(`Folder not found: ${path}`, options)
    this.name = 'FolderNotFoundError'
    this.path = path
  }
}

export interface ChangeFolderOptions {
  /**
   * Whether a Folder that will not list is named in the sidebar (the default).
   * A Recent Folder chosen from the list says so in a toast instead.
   */
  reportMissing?: boolean
}

export async function pickFolderToOpen(): Promise<string | null> {
  if (!isTauri()) return getMockVault().takeDialogSelection()
  const { open } = await import('@tauri-apps/plugin-dialog')
  const selection = await open({ title: 'Open Folder', directory: true, multiple: false })
  return typeof selection === 'string' ? selection : null
}

export function useFolder() {
  const [folder, setFolder] = useState<string | null>(null)
  const [files, setFiles] = useState<ListedFile[]>([])
  const [error, setError] = useState<string | null>(null)
  const folderRef = useRef<string | null>(null)
  const filesRef = useRef<ListedFile[]>([])
  const generation = useRef(0)
  const changing = useRef<Promise<void> | null>(null)

  const applyFolderChange = useCallback(async (path: string | null, beforeChange: () => Promise<void>, { reportMissing = true }: ChangeFolderOptions) => {
    const next = path ? normalizeFolderPath(path) : null
    // A Folder that will not list is the reader's problem, so the Explorer
    // says so; a Write failure in `beforeChange` is not,
    // and keeps the Folder it already has without a message.
    let listed: ListedFile[] = []
    if (next) {
      try {
        listed = await listFiles(next)
      } catch (error) {
        const missing = new FolderNotFoundError(next, { cause: error })
        if (reportMissing) setError(missing.message)
        throw missing
      }
    }
    if (next) await allowVaultAssets(next)
    await beforeChange()
    generation.current += 1
    folderRef.current = next
    filesRef.current = listed
    setFolder(next)
    setFiles(listed)
    setError(null)
  }, [])

  /**
   * The change already under way wins, and a second request waits for it
   * rather than racing it: a caller that reads the Folder or its listing after
   * the call sees them settled either way. The Session restore relies on that
   * — it asks the listing whether an Image file's Tab still has a file. It
   * resolves to whether this call made the change, so a caller that goes on
   * from the new Folder knows it is the one in place.
   */
  const changeFolder = useCallback(async (path: string | null, beforeChange: () => Promise<void>, options: ChangeFolderOptions = {}): Promise<boolean> => {
    if (changing.current) {
      await changing.current.catch(() => {})
      return false
    }
    const change = applyFolderChange(path, beforeChange, options)
    changing.current = change
    try {
      await change
      return true
    } finally {
      changing.current = null
    }
  }, [applyFolderChange])

  const restoreFolder = useCallback(async (path: string | null) => {
    await changeFolder(path, async () => {}).catch(() => {})
    return folderRef.current
  }, [changeFolder])

  const refresh = useCallback(async () => {
    const path = folderRef.current
    if (!path) return
    const request = ++generation.current
    const listed = await listFiles(path)
    if (request !== generation.current || path !== folderRef.current) return
    filesRef.current = listed
    setFiles(listed)
  }, [])

  /**
   * Whether the Folder holds a file, as of now rather than as of the last
   * render. The Session restore asks this about an Image file entry the
   * moment the Folder is back, before `files` has reached React's state.
   */
  const listsFile = useCallback((path: string) => findByNotePath(filesRef.current, path) !== undefined, [])

  /**
   * Every path the Folder holds, as of now. The watcher reads it straight
   * after its refresh, before the listing has reached React's state, to decide
   * whether an open Tab's file is still there.
   */
  const listedPaths = useCallback(() => filesRef.current.map((file) => file.path), [])

  return { folder, files, error, changeFolder, restoreFolder, refresh, listsFile, listedPaths }
}

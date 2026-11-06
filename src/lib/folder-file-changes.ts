/**
 * The paths the Folder watcher reported in one event, broadcast after Plumo
 * has acted on them, so that what shows a file (an Image block whose picture
 * failed to load) can look again. An empty list means the watcher could not
 * say which paths changed.
 */

export const FOLDER_FILES_CHANGED_EVENT = 'plumo:folder-files-changed'

export function dispatchFolderFilesChanged(paths: string[]): void {
  window.dispatchEvent(new CustomEvent<string[]>(FOLDER_FILES_CHANGED_EVENT, { detail: paths }))
}

export function subscribeFolderFilesChanged(listener: (paths: string[]) => void): () => void {
  const handle = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail
    listener(Array.isArray(detail) ? detail.filter((path): path is string => typeof path === 'string') : [])
  }
  window.addEventListener(FOLDER_FILES_CHANGED_EVENT, handle)
  return () => window.removeEventListener(FOLDER_FILES_CHANGED_EVENT, handle)
}

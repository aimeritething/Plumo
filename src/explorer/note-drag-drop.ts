import { isWithinPrefix } from '@/folder/folder-action-utils'
import { noteRootForPath } from '@/folder/note-entry'

export const NOTE_DRAG_MIME_TYPE = 'application/x-plumo-note-path'

let activeDraggedNotePath: string | null = null

export function writeNoteDragData(dataTransfer: DataTransfer, notePath: string) {
  activeDraggedNotePath = notePath
  dataTransfer.effectAllowed = 'move'
  dataTransfer.setData(NOTE_DRAG_MIME_TYPE, notePath)
  dataTransfer.setData('text/plain', notePath)
}

export function clearDraggedNotePath(): void {
  activeDraggedNotePath = null
}

export function readDraggedNotePath(dataTransfer: DataTransfer | null): string | null {
  const rawNotePath = dataTransfer?.getData(NOTE_DRAG_MIME_TYPE)
  const notePath = typeof rawNotePath === 'string' ? rawNotePath.trim() : ''
  return notePath || activeDraggedNotePath
}

/**
 * Whether dropping `path` into `destination` moves anything: never into the
 * folder it is already in, and never a folder into itself or below itself.
 * Anywhere else is offered as a drop; these are not even marked.
 */
export function canMoveInto(path: string, destination: string): boolean {
  return noteRootForPath(path) !== destination && !isWithinPrefix({ path: destination, prefix: path })
}

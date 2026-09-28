import { Copy, WarningCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { copyLocalPath } from '@/platform/url'
import { notePathFilename } from '@/lib/note-path-identity'
import { isImageFilePath } from '@/tabs/image-file'
import type { ImageImportError } from './use-image-drop'

/**
 * What Plumo says through Sonner: a refused Explorer operation, Copy path
 * landing or failing, a file that could not be opened, Tabs closed because
 * their files went away outside Plumo, and an image that did not become an
 * Attachment. Each says what happened and goes away on its own;
 * nothing here is ever answered, which is why a Write failure is a different
 * thing entirely. A toast's id names the event, so the same event again
 * replaces its toast and restarts the clock rather than stacking a copy.
 */

const COPY_PATH_TOAST_ID = 'copy-path'

function warningIcon() {
  return <WarningCircle size={16} className="text-text-secondary" aria-hidden="true" />
}

/** A refused move or Trash, in the Explorer's words. */
export function showRefusalToast(message: string): void {
  toast(message, { id: message, icon: warningIcon() })
}

/** Copy path (⌘⇧,, Edit menu, the tab bar's link button): the absolute path onto the clipboard. */
export function copyPathWithToast(path: string): void {
  copyLocalPath(path).then(
    () => toast('Copied path to clipboard', { id: COPY_PATH_TOAST_ID, icon: <Copy size={16} aria-hidden="true" /> }),
    (error: unknown) => {
      console.warn(`Could not copy ${path} to the clipboard:`, error)
      toast("Couldn't copy path", { id: COPY_PATH_TOAST_ID, icon: warningIcon() })
    },
  )
}

/** A Document that could not be read on open: unreadable, or gone before the Explorer caught up. */
export function showOpenFailureToast(path: string): void {
  toast(`Couldn't open ${notePathFilename(path)}`, { id: `open:${path}`, icon: warningIcon() })
}

/** What the Tabs one change closed held: Documents, Image files, or files when they are both. */
function closedFilesNoun(paths: readonly string[]): string {
  const images = paths.filter(isImageFilePath).length
  if (images === 0) return 'Documents'
  return images === paths.length ? 'Image files' : 'files'
}

/**
 * Tabs the watcher closed because their files were deleted or renamed in
 * Finder (or another app): one toast per change, naming the file when it is
 * one, counting them when there are several.
 */
export function showClosedOutsideToast(paths: readonly string[]): void {
  const message = paths.length === 1
    ? `${notePathFilename(paths[0])} was deleted or renamed outside Plumo`
    : `${paths.length} ${closedFilesNoun(paths)} were deleted or renamed outside Plumo`
  toast(message, { id: `closed-outside:${paths.join('\n')}`, icon: warningIcon() })
}

function imageImportMessage(error: ImageImportError): string {
  switch (error.kind) {
    case 'unsupported-heic':
      return `Couldn't add ${error.fileName}: ${error.format} images aren't supported`
    case 'copy-failed':
      return `Couldn't copy ${error.fileName} into attachments/`
    case 'remote-download':
      return `Couldn't download ${error.failedCount} of ${error.totalCount} images`
  }
}

/** An image pasted or dropped into a Document that did not become an Attachment, and why. */
export function showImageImportErrorToast(error: ImageImportError): void {
  const message = imageImportMessage(error)
  toast(message, { id: message, icon: warningIcon() })
}

import { Copy, WarningCircle } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { copyLocalPath } from '@/platform/url'
import { notePathFilename } from '@/lib/note-path-identity'

/**
 * What Plumo says through Sonner: a refused Explorer operation, Copy path
 * landing or failing, and a file that could not be opened. Each says what happened and goes away on its own;
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

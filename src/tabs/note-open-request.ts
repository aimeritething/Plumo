import { showOpenFailureToast } from '@/editor/toasts'

type NoteOpenRequest = {
  /** Opens a Document, or activates its Tab when it is already open. */
  openNote: (path: string) => Promise<void>
  paths: string[]
  /** Writes the active Document's pending edits before the Tab changes. */
  settleActiveNote: () => Promise<void>
}

/**
 * Open Documents the way File → Open Document… does, which is also the way a
 * `.md` dropped on the window does: the active Document's pending edits reach
 * disk first, then each path opens in turn.
 *
 * A refused write is recorded against its own Tab, so opening goes ahead; a
 * Document that cannot be read is named in a toast and the rest still open.
 */
export async function openNotesSettled({
  openNote,
  paths,
  settleActiveNote,
}: NoteOpenRequest): Promise<void> {
  if (paths.length === 0) return

  await settleActiveNote().catch(() => {})
  for (const path of paths) {
    try {
      await openNote(path)
    } catch (error) {
      console.error(`Failed to open ${path}:`, error)
      showOpenFailureToast(path)
    }
  }
}

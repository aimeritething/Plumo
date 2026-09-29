import { useCallback, useRef, useLayoutEffect } from 'react'
import type { EditorMode, Tab } from '@/types'
import { notePathFilename } from '@/lib/note-path-identity'
import { isPathInsideVaultRoot } from '@/lib/vault-path-containment'
import { documentRoot, type ExplorerNode } from './explorer'
import { duplicateFile } from './explorer-commands'
import { duplicateName, siblingNames } from './explorer-names'
import { noteRootForPath } from './note-entry'

/**
 * Duplicate (CONTEXT.md): a copy of a Document or an Image file, beside it,
 * named `<name> copy`. One operation for the Explorer's and Pinned's menus
 * (the row) and for File ▸ Duplicate, the Command Menu and the tab bar's "…"
 * (the active Tab).
 *
 * The copy holds what the user sees. An open Document writes its pending
 * edits first, so the bytes on disk are copied as they are, Frontmatter and
 * all; when that write is refused (a Write failure), the unsaved edits are
 * written as the copy instead. A copy never replaces a file: a name taken
 * since the listing was read moves on to the next `copy N`, and any other
 * refusal is a toast, with no Tab opened.
 */

interface Options {
  folder: string | null
  /** The Explorer tree, whose listing says which names are taken; null with no Folder open. */
  tree: ExplorerNode | null
  tabs: readonly Tab[]
  /** Write the file's pending edits, if its Tab has any. A refusal is the error bar's, and does not stop the copy. */
  settle: (path: string) => Promise<void>
  /** The Document's edits that are not on disk, after `settle`; undefined when disk holds what the Tab shows. */
  unsavedContent: (path: string) => string | undefined
  refresh: () => Promise<void>
  /** Open the copy as the active Tab, a Document in the mode its original's Tab was in. */
  open: (path: string, mode: EditorMode | undefined) => void
  showToast: (message: string) => void
}

/** How many `copy N` names to try when each is taken between the listing and the write. */
const DUPLICATE_ATTEMPTS = 25

const NAME_TAKEN = 'File already exists'

function failureMessage(cause: unknown): string {
  if (typeof cause === 'string') return cause
  if (cause instanceof Error) return cause.message
  return 'The file could not be copied'
}

function isNameTaken(cause: unknown): boolean {
  return failureMessage(cause).startsWith(NAME_TAKEN)
}

/** The names beside `path` that a copy must avoid, as the Explorer lists them. */
function takenNames(path: string, folder: string | null, tree: ExplorerNode | null): string[] {
  if (!folder || !tree || !isPathInsideVaultRoot(path, folder)) return [notePathFilename(path)]
  return siblingNames(tree, noteRootForPath(path), { of: 'children' })
}

export function useDuplicateFile(options: Options): (path: string) => void {
  const optionsRef = useRef(options)
  useLayoutEffect(() => {
    optionsRef.current = options
  })

  return useCallback((path: string) => {
    const { folder, tree, tabs, settle, unsavedContent, refresh, open, showToast } = optionsRef.current
    const filename = notePathFilename(path)
    const mode = tabs.find((tab) => tab.entry.path === path)?.mode
    void (async () => {
      await settle(path)
      const content = unsavedContent(path)
      const directory = noteRootForPath(path)
      const root = documentRoot(path, folder)
      const held = takenNames(path, folder, tree)
      for (let attempt = 0; attempt < DUPLICATE_ATTEMPTS; attempt += 1) {
        const newPath = `${directory}/${duplicateName(held, filename)}`
        try {
          await duplicateFile({ root, path, newPath, content })
        } catch (cause: unknown) {
          if (!isNameTaken(cause)) throw cause
          held.push(notePathFilename(newPath))
          continue
        }
        await refresh()
        open(newPath, mode)
        return
      }
      throw new Error('Every name for the copy is taken')
    })().catch((cause: unknown) => showToast(`Couldn't duplicate ${filename}: ${failureMessage(cause)}`))
  }, [])
}

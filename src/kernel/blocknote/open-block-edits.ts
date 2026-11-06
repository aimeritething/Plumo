/**
 * An edit a Block holds outside the Document until it ends, such as an Image
 * block's caption being typed: it reaches the Document once, when it ends, so
 * it makes one undo step and one Autosave. Before the editor's pending change
 * is flushed (a Tab switch, ⌘S, Raw mode, quitting) every open edit is ended,
 * so what was typed is in the content that gets written.
 */

type EndEdit = () => void

const openEdits = new WeakMap<object, Set<EndEdit>>()

/** Registers an open edit on an editor; the returned function unregisters it. */
export function registerOpenBlockEdit(editor: object, end: EndEdit): () => void {
  let edits = openEdits.get(editor)
  if (!edits) {
    edits = new Set()
    openEdits.set(editor, edits)
  }
  edits.add(end)
  return () => {
    edits.delete(end)
  }
}

/** Whether a Block on an editor holds an edit the Document does not have yet. */
export function hasOpenBlockEdits(editor: object): boolean {
  return (openEdits.get(editor)?.size ?? 0) > 0
}

/** Ends every open edit on an editor, each writing what it holds. */
export function endOpenBlockEdits(editor: object): void {
  const edits = openEdits.get(editor)
  if (!edits || edits.size === 0) return
  for (const end of [...edits]) end()
}

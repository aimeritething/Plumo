/** Undo and Redo on whichever surface shows the active Document: BlockNote's history in Rich mode, CodeMirror's in Raw mode. */
export interface EditorHistory {
  undo: () => void
  redo: () => void
}

/**
 * Edit → Undo or Redo reached from the menu bar while a rename field or a
 * find bar holds the caret: that field's history is the browser's own, and
 * the Document's is left alone. The Command Menu's input does not count; its
 * rows are picked from there, and the caret goes back where it was.
 */
export function nativeTextFieldHasFocus(): boolean {
  const active = document.activeElement
  if (!(active instanceof HTMLElement)) return false
  if (active.tagName !== 'INPUT' && active.tagName !== 'TEXTAREA') return false
  return active.closest('[data-command-palette="true"]') === null
}

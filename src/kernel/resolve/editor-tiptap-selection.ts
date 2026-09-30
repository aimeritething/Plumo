import type { Node as ProsemirrorNode } from '@tiptap/pm/model'
import { Selection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'

type TiptapEditorBridge = {
  state?: {
    doc?: { content?: { size?: unknown } }
  }
  commands?: {
    setTextSelection?: (position: number) => unknown
  }
}

function getTiptapEditorBridge(editor: unknown): TiptapEditorBridge | null {
  const editorWithBridge = editor as { _tiptapEditor?: TiptapEditorBridge }
  return editorWithBridge._tiptapEditor ?? null
}

function getSafeTextSelectionPosition(tiptapEditor: TiptapEditorBridge): number {
  const size = tiptapEditor.state?.doc?.content?.size
  if (typeof size !== 'number' || !Number.isFinite(size)) return 0
  return size > 0 ? Math.min(1, size) : 0
}

export function resetTextSelectionBeforeContentSwap(editor: unknown): void {
  const tiptapEditor = getTiptapEditorBridge(editor)
  const setTextSelection = tiptapEditor?.commands?.setTextSelection
  if (!tiptapEditor || typeof setTextSelection !== 'function') return

  try {
    setTextSelection(getSafeTextSelectionPosition(tiptapEditor))
  } catch (err) {
    console.warn('Failed to reset editor selection before content swap:', err)
  }
}

/**
 * A Tab's caret (or text selection), kept with the Tab like its scroll
 * position so the two come back together. Each end is held by the Block it is
 * in and its offset inside that Block, since mounting a large Document in
 * chunks can shift every position after a chunk.
 */
export type EditorSelectionPoint = { blockId: string; offset: number }
export type EditorSelectionSnapshot = { anchor: EditorSelectionPoint; head: EditorSelectionPoint }

type ProsemirrorViewBridge = {
  state?: EditorState
  dispatch?: (transaction: Transaction) => void
}

function getProsemirrorViewBridge(editor: unknown): ProsemirrorViewBridge | null {
  try {
    return (editor as { prosemirrorView?: ProsemirrorViewBridge }).prosemirrorView ?? null
  } catch {
    return null
  }
}

function pointAt(doc: ProsemirrorNode, position: number): EditorSelectionPoint | null {
  const $position = doc.resolve(position)
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    const node = $position.node(depth)
    if (node.type.name === 'blockContainer' && typeof node.attrs.id === 'string') {
      return { blockId: node.attrs.id, offset: position - $position.before(depth) }
    }
  }
  return null
}

export function readEditorSelection(editor: unknown): EditorSelectionSnapshot | undefined {
  const state = getProsemirrorViewBridge(editor)?.state
  if (!state?.doc || !state.selection) return undefined

  try {
    const anchor = pointAt(state.doc, state.selection.anchor)
    const head = pointAt(state.doc, state.selection.head)
    return anchor && head ? { anchor, head } : undefined
  } catch {
    return undefined
  }
}

function positionOf(doc: ProsemirrorNode, point: EditorSelectionPoint): number | null {
  let position: number | null = null
  doc.descendants((node, nodePosition) => {
    if (position !== null) return false
    if (node.type.name !== 'blockContainer' || node.attrs.id !== point.blockId) return true
    position = nodePosition + Math.min(Math.max(point.offset, 0), node.nodeSize)
    return false
  })
  return position
}

function selectionForSnapshot(doc: ProsemirrorNode, snapshot: EditorSelectionSnapshot | undefined): Selection {
  const anchor = snapshot ? positionOf(doc, snapshot.anchor) : null
  const head = snapshot ? positionOf(doc, snapshot.head) : null
  if (anchor === null || head === null) return Selection.atStart(doc)
  return TextSelection.between(doc.resolve(anchor), doc.resolve(head))
}

/**
 * Replacing every Block pushes the caret to the end of the new content, and
 * whatever focuses the editor next shows it there: a key pressed then scrolled
 * a Tab shown at its top, or where it was left, to its bottom. The caret goes
 * back to where the Tab was left, or to the start of a Document shown for the
 * first time. It is placed without scrolling; the swap restores the scroll.
 */
export function placeSelectionAfterContentSwap(editor: unknown, snapshot?: EditorSelectionSnapshot): void {
  const view = getProsemirrorViewBridge(editor)
  if (!view?.state?.doc || typeof view.dispatch !== 'function') return

  try {
    const selection = selectionForSnapshot(view.state.doc, snapshot)
    view.dispatch(view.state.tr.setSelection(selection).setMeta('addToHistory', false))
  } catch (err) {
    console.warn('Failed to place the caret after a content swap:', err)
  }
}

import type { EditorState } from '@tiptap/pm/state'

// Text in a code block or inline code is literal: Markdown input rules (inline
// math, arrow ligatures, ==highlight==) must leave it alone. A node counts as
// code when its spec says so or it is BlockNote's code block; a mark counts
// when it is inline code.
const CODE_BLOCK_NODE_TYPE = 'codeBlock'
const CODE_MARK_TYPE = 'code'

type TypeLike = { name?: string; spec?: { code?: boolean } } | undefined
type MarkLike = { type: TypeLike }
type NodeLike = { isText?: boolean; marks?: readonly MarkLike[]; type?: TypeLike }

function isCodeNodeType(type: TypeLike): boolean {
  return Boolean(type?.spec?.code) || type?.name === CODE_BLOCK_NODE_TYPE
}

function hasCodeMark(marks: readonly MarkLike[] | null | undefined): boolean {
  return Boolean(marks?.some(mark => mark.type?.name === CODE_MARK_TYPE || mark.type?.spec?.code))
}

function nodeIsCode(node: NodeLike): boolean {
  return isCodeNodeType(node.type) || Boolean(node.isText && hasCodeMark(node.marks))
}

/**
 * Whether text typed at the selection's start lands in code: inside a code
 * node, or carrying inline code (the stored marks when set, else the marks at
 * the caret).
 */
export function caretIsInCode(state: EditorState): boolean {
  const { $from } = state.selection
  for (let depth = $from.depth; depth >= 0; depth--) {
    if (isCodeNodeType($from.node(depth).type)) return true
  }

  return hasCodeMark(state.storedMarks ?? $from.marks())
}

/** Whether any part of `from`–`to` is code: a code node around or in it, or inline code text. */
export function rangeIsInCode(state: EditorState, from: number, to: number): boolean {
  let containsCode = false
  state.doc.nodesBetween(from, to, (node: NodeLike) => {
    if (containsCode) return false
    containsCode = nodeIsCode(node)
    return !containsCode
  })
  return containsCode
}

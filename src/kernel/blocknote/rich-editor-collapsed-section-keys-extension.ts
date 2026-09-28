import { createExtension } from '@blocknote/core'
import type { Node as ProsemirrorNode, ResolvedPos } from '@tiptap/pm/model'
import { TextSelection, type Transaction } from '@tiptap/pm/state'
import type { RichEditor } from './block-note-dom'
import {
  collapsedSectionHiddenBlockIds,
  collapsedSectionHiding,
  endCollapsedSectionAfter,
  expandSectionsHidingBlock,
  isCollapsedBlock,
} from './collapsed-sections'
import { collapsedSectionBlockIds, documentBlockIds } from './rich-editor-block-selection-document'
import { richEditorBlockSelectionPluginKey } from './rich-editor-block-selection-extension'
import type { RichEditorBlockSelectionEditor } from './rich-editor-block-selection-types'
import {
  consumeKeyboardEvent,
  createCaptureKeydownMount,
  isComposingKeyboardEvent,
  type RichEditorView,
} from './rich-editor-keyboard'

// A top-level block's content: doc > blockGroup > blockContainer > content.
const TOP_LEVEL_CONTENT_DEPTH = 3

function isPlainKey(event: KeyboardEvent, key: string): boolean {
  return event.key === key && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
}

function blockIdOf(node: ProsemirrorNode): string | null {
  const id: unknown = node.attrs.id
  return typeof id === 'string' && id.length > 0 ? id : null
}

/** Where a block placed after the block `blockId` (and its children) goes. */
function blockContainerEnd(doc: ProsemirrorNode, blockId: string): number | null {
  let end: number | null = null
  doc.descendants((node, pos) => {
    if (end !== null) return false
    if (node.type.name !== 'blockContainer' || blockIdOf(node) !== blockId) return true

    end = pos + node.nodeSize
    return false
  })
  return end
}

/** The collapsed heading the text selection sits in, when it stays inside the heading's text. */
function collapsedHeadingAt(editor: RichEditor, $from: ResolvedPos, $to: ResolvedPos): string | null {
  if (!$from.sameParent($to) || $from.parent.type.name !== 'heading' || $from.depth < 1) return null

  const headingId = blockIdOf($from.node(-1))
  return headingId && isCollapsedBlock(editor, headingId) ? headingId : null
}

// Enter at the start of the heading's text: an empty block of the same kind
// above it, as BlockNote does, but the heading keeps its id and so its
// collapsed section. BlockNote's own split would leave the id, and the
// collapse, on the empty block above.
function insertEmptyHeadingAbove(tr: Transaction): true {
  const { $from } = tr.selection
  const heading = $from.parent
  const { blockContainer } = tr.doc.type.schema.nodes
  tr.insert($from.before(-1), blockContainer.create(null, heading.type.create(heading.attrs)))
  return true
}

// Anywhere else: the text after the cursor goes into a new paragraph after
// the whole collapsed section, where the cursor follows it.
function moveTailPastSection(tr: Transaction, sectionEnd: number): true {
  if (!tr.selection.empty) tr.deleteSelection()

  const { $from } = tr.selection
  const tail = tr.doc.slice($from.pos, $from.end()).content
  tr.delete($from.pos, $from.end())

  const insertAt = tr.mapping.map(sectionEnd)
  const { blockContainer, paragraph } = tr.doc.type.schema.nodes
  tr.insert(insertAt, blockContainer.create(null, paragraph.create(null, tail)))
  // Past the new block's container and paragraph openings.
  tr.setSelection(TextSelection.create(tr.doc, insertAt + 2))
  tr.scrollIntoView()
  return true
}

/**
 * Enter in a collapsed heading never puts a block, or the cursor, inside the
 * section it hides: the new block goes after the section, which stays
 * collapsed and now ends before it.
 */
function enterInCollapsedHeading(editor: RichEditor, view: RichEditorView): boolean {
  const { selection } = view.state
  if (!(selection instanceof TextSelection)) return false

  const headingId = collapsedHeadingAt(editor, selection.$from, selection.$to)
  if (!headingId) return false

  if (selection.empty && selection.$from.parentOffset === 0 && selection.$from.parent.childCount > 0) {
    return editor.transact(insertEmptyHeadingAbove)
  }

  const sectionBlockIds = collapsedSectionBlockIds(editor as unknown as RichEditorBlockSelectionEditor, headingId)
  const lastBlockId = sectionBlockIds.at(-1) ?? headingId
  const sectionEnd = blockContainerEnd(view.state.doc, lastBlockId)
  if (sectionEnd === null) return false

  editor.transact((tr) => moveTailPastSection(tr, sectionEnd))
  endCollapsedSectionAfter(editor, headingId, lastBlockId)
  return true
}

/**
 * Backspace at the start of the block after a collapsed section would merge
 * it into the section's last, hidden block. An empty block is removed and the
 * cursor goes to the end of the collapsed heading, which stays shut; a block
 * with text opens the section first, so the merge happens in view.
 */
function backspaceAfterCollapsedSection(editor: RichEditor, view: RichEditorView): boolean {
  const { selection } = view.state
  if (!(selection instanceof TextSelection) || !selection.empty) return false

  const { $from } = selection
  const isMergingStart = $from.parentOffset === 0
    && $from.parent.type.name === 'paragraph'
    && $from.depth === TOP_LEVEL_CONTENT_DEPTH
  const blockId = isMergingStart ? blockIdOf($from.node(-1)) : null
  if (!blockId) return false

  const blockIds = documentBlockIds(editor.document)
  const previousBlockId = blockIds.at(blockIds.indexOf(blockId) - 1)
  if (blockIds.indexOf(blockId) < 1 || !previousBlockId) return false
  if (!collapsedSectionHiddenBlockIds(editor).has(previousBlockId)) return false

  if ($from.parent.childCount > 0) {
    expandSectionsHidingBlock(editor, previousBlockId)
    return false
  }

  const hiderId = collapsedSectionHiding(editor, previousBlockId)
  if (!hiderId) return false

  editor.transact(() => {
    editor.removeBlocks([blockId])
    editor.setTextCursorPosition(hiderId, 'end')
  })
  return true
}

function handleCollapsedSectionKey(editor: RichEditor, event: KeyboardEvent, view: RichEditorView): boolean {
  if (editor.isEditable === false || isComposingKeyboardEvent(event, view)) return false
  // A block selection has its own Enter and Backspace.
  if (richEditorBlockSelectionPluginKey.getState(view.state)) return false

  if (isPlainKey(event, 'Enter')) return enterInCollapsedHeading(editor, view)
  if (isPlainKey(event, 'Backspace')) return backspaceAfterCollapsedSection(editor, view)
  return false
}

/** Enter and Backspace around a collapsed section keep the cursor out of the blocks it hides. */
export const createRichEditorCollapsedSectionKeysExtension = createExtension(({ editor }) => {
  const richEditor = editor as unknown as RichEditor

  return {
    key: 'richEditorCollapsedSectionKeys',
    mount: createCaptureKeydownMount(richEditor, (event, view) => {
      if (view && handleCollapsedSectionKey(richEditor, event, view)) consumeKeyboardEvent(event)
    }),
  } as const
})

import type { RichEditor } from './block-note-dom'
import {
  collapseCopiedBlocks,
  endCollapsedSectionAfter,
  isCollapsedBlock,
  keepBlockOutOfCollapsedSections,
} from './collapsed-sections'
import { blocksWithoutIds } from './rich-editor-block-selection-clipboard'
import {
  collapsedContentOperationBlockIds,
  collapsedSectionBlockIds,
  findDocumentBlock,
  selectedDocumentBlocks,
} from './rich-editor-block-selection-document'
import { readRichEditorBlockSelection, selectRichEditorBlocks } from './rich-editor-block-selection-extension'
import {
  isBlockLike,
  isRecord,
  uniqueBlockIds,
  type BlockLike,
  type RichEditorBlockSelectionEditor,
} from './rich-editor-block-selection-types'

/**
 * Duplicate (CONTEXT.md, Block and Section): the handle's menu, ⌘D, Edit ▸
 * Duplicate Block and /duplicate all come here.
 */

function selectionEditor(editor: RichEditor) {
  return editor as unknown as RichEditorBlockSelectionEditor
}

function blockTreeIds(block: BlockLike): string[] {
  const children = Array.isArray(block.children) ? block.children.filter(isBlockLike) : []
  return [block.id, ...children.flatMap(blockTreeIds)]
}

/** Each original block id, nested ones included, to its copy's: the two trees have the same shape. */
function copiedBlockIds(originals: readonly unknown[], copies: readonly unknown[]): Map<string, string> {
  const originalIds = originals.filter(isBlockLike).flatMap(blockTreeIds)
  const copyIds = copies.filter(isBlockLike).flatMap(blockTreeIds)
  if (originalIds.length !== copyIds.length) return new Map()
  return new Map(originalIds.map((id, index) => [id, copyIds[index]]))
}

function isHeading(editor: RichEditor, blockId: string) {
  return findDocumentBlock(editor.document, blockId)?.type === 'heading'
}

/**
 * Copies `blockIds`, each with the content folded under it (a folded heading's
 * Section, a folded list item's children), and puts the copies right after
 * the last of them in one transaction, so one Undo takes them away. A copy is
 * folded when its original is, and a copied folded heading hides its copied
 * Section and nothing past it. An image's copy links the same Attachment.
 * Returns the copies of `blockIds` themselves.
 */
export function duplicateBlocks(editor: RichEditor, blockIds: readonly string[]): string[] {
  const operationBlockIds = collapsedContentOperationBlockIds(selectionEditor(editor), blockIds)
  const originals = selectedDocumentBlocks(editor.document, operationBlockIds)
  const referenceBlockId = operationBlockIds.at(-1)
  if (!referenceBlockId || originals.length === 0) return []

  const foldedHeadingEnds = operationBlockIds
    .filter((blockId) => isCollapsedBlock(editor, blockId) && isHeading(editor, blockId))
    .map((headingId) => [headingId, collapsedSectionBlockIds(selectionEditor(editor), headingId).at(-1) ?? headingId] as const)

  const copies = editor.transact(() => editor.insertBlocks(
    blocksWithoutIds(originals) as Parameters<RichEditor['insertBlocks']>[0],
    referenceBlockId,
    'after',
  ))
  const copyIds = copiedBlockIds(originals, copies)

  collapseCopiedBlocks(editor, copyIds)
  foldedHeadingEnds.forEach(([headingId, lastBlockId]) => {
    const headingCopyId = copyIds.get(headingId)
    const lastCopyId = copyIds.get(lastBlockId)
    if (headingCopyId && lastCopyId) endCollapsedSectionAfter(editor, headingCopyId, lastCopyId)
  })
  const firstCopyId = copyIds.get(operationBlockIds[0])
  if (firstCopyId) keepBlockOutOfCollapsedSections(editor, firstCopyId)

  return uniqueBlockIds(blockIds.flatMap((blockId) => copyIds.get(blockId) ?? []))
}

/** Duplicates `blockIds` and moves the block selection onto the copies. False when nothing was copied. */
export function duplicateBlocksAndSelect(editor: RichEditor, blockIds: readonly string[]): boolean {
  const copyIds = duplicateBlocks(editor, blockIds)
  if (copyIds.length === 0) return false

  editor.focus()
  const view = editor.prosemirrorView
  if (view) selectRichEditorBlocks(view, copyIds)
  return true
}

function textSelectionBlockIds(editor: RichEditor): string[] {
  const selection: unknown = editor.getSelection()
  if (isRecord(selection) && Array.isArray(selection.blocks)) {
    const blockIds = selection.blocks.filter(isBlockLike).map((block) => block.id)
    if (blockIds.length > 0) return blockIds
  }
  return [editor.getTextCursorPosition().block.id]
}

/**
 * What ⌘D and Edit ▸ Duplicate Block copy: the block selection, or else the
 * Blocks the text selection touches, or the caret's Block.
 */
export function duplicateSelectedBlocks(editor: RichEditor): boolean {
  const view = editor.prosemirrorView
  const blockIds = (view && readRichEditorBlockSelection(view)) ?? textSelectionBlockIds(editor)
  return duplicateBlocksAndSelect(editor, blockIds)
}

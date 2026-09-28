import type { useCreateBlockNote } from '@blocknote/react'
import {
  blockElementById,
  blockElementFromPoint,
  blockIdFromElement,
  dropPlacementForPoint,
  editorBlockElement,
  type DropPlacement,
} from '@/kernel/blocknote/block-note-dom'
import {
  isStaleBlockReferenceError,
  reportRecoveredEditorTransformError,
} from '@/kernel/blocknote/rich-editor-transform-error-recovery-extension'
import type { ClientPoint } from '@/platform/use-tauri-drag-drop-event'

type Editor = ReturnType<typeof useCreateBlockNote>

/** The block a drop lands beside, and on which side of it. */
export type ImageDropTarget = {
  blockId: string
  placement: DropPlacement
}

// Below the last block, or in a gap no block covers: the top-level block the
// point is under, or the first one when it is above them all.
function nearestTopLevelBlockElement(editor: Editor, editorElement: HTMLElement, y: number): HTMLElement | null {
  let nearest: HTMLElement | null = null
  for (const block of editor.document) {
    const element = blockElementById(editorElement, block.id)
    if (!element) continue
    if (nearest && element.getBoundingClientRect().top > y) break
    nearest = element
  }
  return nearest
}

/**
 * Where images dropped at a point go: beside the block under the pointer,
 * before it in its upper half and after it in its lower half, the rule the
 * block drag handle's drop indicator follows.
 */
export function imageDropTargetAt(editor: Editor, point: ClientPoint): ImageDropTarget | null {
  const editorElement = editorBlockElement(editor)
  if (!editorElement) return null

  const blockElement = blockElementFromPoint({
    editorElement,
    ownerDocument: editorElement.ownerDocument,
    x: point.x,
    y: point.y,
  }) ?? nearestTopLevelBlockElement(editor, editorElement, point.y)
  const blockId = blockElement && blockIdFromElement(blockElement)
  if (!blockElement || !blockId) return null

  return { blockId, placement: dropPlacementForPoint(blockElement, point.y) }
}

/**
 * Insert one image block per URL, consecutively and in order, at the drop
 * target. The copies take a moment, and the one editor serves every Tab: a
 * target block gone by then (deleted, or its Document's Tab left) takes
 * nothing, rather than putting the images into whatever is showing now.
 */
export function insertImageBlocksAtDropTarget(
  editor: Editor,
  urls: string[],
  target: ImageDropTarget,
): boolean {
  try {
    const blocks = urls.map((url) => ({ type: 'image' as const, props: { url } }))
    const targetBlock = editor.getBlock(target.blockId)
    if (!targetBlock) return false

    editor.insertBlocks(blocks, targetBlock, target.placement)
    return true
  } catch (error) {
    if (!isStaleBlockReferenceError(error)) throw error

    reportRecoveredEditorTransformError('stale_block_reference', error)
    return false
  }
}

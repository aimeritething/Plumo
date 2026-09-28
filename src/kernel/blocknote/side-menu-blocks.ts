import { isStaleBlockReferenceError } from './rich-editor-transform-error-recovery-extension'
import type { CollapsibleBlock } from './collapsed-sections'
import type { DropPlacement, RichEditor } from './block-note-dom'
import { collapsedSectionBlockIds, moveKeepingCollapsedSections } from './rich-editor-block-selection-document'
import type { RichEditorBlockSelectionEditor } from './rich-editor-block-selection-types'

export type Block = NonNullable<ReturnType<RichEditor['getBlock']>>
export type SideMenuBlock = {
  children?: CollapsibleBlock[]
  content?: unknown
  id: string
  props?: Record<string, unknown>
  type: string
}

type BlockTree = {
  children: readonly BlockTree[]
  id: string
}

export function liveSideMenuBlock(
  editor: RichEditor,
  block: { id: string } | undefined,
) {
  if (!block) return undefined
  try {
    return editor.getBlock(block.id)
  } catch (error) {
    if (isStaleBlockReferenceError(error)) {
      console.warn('[editor] Ignored stale block side-menu lookup:', error)
      return undefined
    }
    throw error
  }
}

export function runSideMenuAction(action: () => void) {
  try {
    action()
  } catch (error) {
    if (isStaleBlockReferenceError(error)) {
      console.warn('[editor] Ignored stale block side-menu action:', error)
      return
    }
    throw error
  }
}

export function hasChildBlock(block: BlockTree, blockId: string): boolean {
  for (const child of block.children) {
    if (child.id === blockId || hasChildBlock(child, blockId)) return true
  }

  return false
}

function selectionEditor(editor: RichEditor) {
  return editor as unknown as RichEditorBlockSelectionEditor
}

/**
 * The live blocks the side menu's drag and Delete act on for `blockId`: the
 * block, and a collapsed heading's section with it, the unit block selection
 * uses. Empty once any of them is gone.
 */
export function liveSideMenuSection(editor: RichEditor, blockId: string): Block[] {
  const blocks: Block[] = []
  for (const sectionBlockId of collapsedSectionBlockIds(selectionEditor(editor), blockId)) {
    const block = liveSideMenuBlock(editor, { id: sectionBlockId })
    if (!block) return []
    blocks.push(block)
  }
  return blocks
}

function sectionHasBlock(section: readonly Block[], blockId: string) {
  return section.some((block) => block.id === blockId || hasChildBlock(block, blockId))
}

/** A section can be dropped at any live block outside it, never into itself. */
export function canDropSideMenuSection(editor: RichEditor, draggedBlockId: string, targetBlockId: string) {
  const section = liveSideMenuSection(editor, draggedBlockId)
  return section.length > 0
    && Boolean(liveSideMenuBlock(editor, { id: targetBlockId }))
    && !sectionHasBlock(section, targetBlockId)
}

/**
 * Moves the dragged block, with its section when it is a collapsed heading,
 * before or after the target. Dropped after a collapsed heading, it goes after
 * that heading's whole section. One transaction, so one undo step.
 */
export function moveSideMenuSection(
  editor: RichEditor,
  draggedBlockId: string,
  targetBlockId: string,
  placement: DropPlacement,
): boolean {
  if (!canDropSideMenuSection(editor, draggedBlockId, targetBlockId)) return false

  const sectionBlockIds = liveSideMenuSection(editor, draggedBlockId).map((block) => block.id)
  let moved = false
  moveKeepingCollapsedSections(selectionEditor(editor), sectionBlockIds, () => {
    editor.transact(() => {
      if (!canDropSideMenuSection(editor, draggedBlockId, targetBlockId)) return

      const section = liveSideMenuSection(editor, draggedBlockId)
      const referenceBlockId = placement === 'after'
        ? collapsedSectionBlockIds(selectionEditor(editor), targetBlockId).at(-1) ?? targetBlockId
        : targetBlockId
      editor.removeBlocks(section.map((block) => block.id))
      editor.insertBlocks(section, referenceBlockId, placement)
      moved = true
    })
    return moved
  })
  return moved
}

/** Deletes the block, with its section when it is a collapsed heading: one transaction, so one undo step. */
export function removeSideMenuSection(editor: RichEditor, block: { id: string } | undefined) {
  const liveBlock = liveSideMenuBlock(editor, block)
  if (!liveBlock) return

  editor.removeBlocks(collapsedSectionBlockIds(selectionEditor(editor), liveBlock.id))
}

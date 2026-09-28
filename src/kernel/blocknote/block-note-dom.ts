import type {
  BlockNoteEditor,
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core'

export type RichEditor = BlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>
export type DropPlacement = 'before' | 'after'

export const BLOCK_CONTAINER_SELECTOR = '[data-node-type="blockContainer"][data-id]'
// The kernel's code block language control (code-block-language-controls.tsx), keyed by block id.
export const CODE_BLOCK_LANGUAGE_CONTROL_ATTRIBUTE = 'data-code-block-id'
export const BLOCK_OUTER_SELECTOR = '[data-node-type="blockOuter"][data-id], .bn-block-outer[data-id]'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function editorBlockElement(editor: RichEditor): HTMLElement | null {
  const element = editor.domElement
  if (!(element instanceof HTMLElement)) return null
  return element.matches('.bn-editor')
    ? element
    : element.querySelector('.bn-editor')
}

// The text column: the editor's box less its side padding, which holds the
// side menu and no block, so a hit there finds nothing.
function textColumnBounds(editorElement: HTMLElement, editorRect: DOMRect): { left: number; right: number } {
  const style = editorElement.ownerDocument.defaultView?.getComputedStyle(editorElement)
  const paddingLeft = Number.parseFloat(style?.paddingLeft ?? '') || 0
  const paddingRight = Number.parseFloat(style?.paddingRight ?? '') || 0
  return { left: editorRect.left + paddingLeft, right: editorRect.right - paddingRight }
}

/**
 * The block at a point, read as if the point were moved sideways onto the
 * nearest part of the text column: a pointer out in the editor's padding or
 * the pane's margins beside it finds the block at the same height, the way
 * the block drag handle's drop indicator and an image drop both read it.
 */
export function blockElementFromPoint({
  editorElement,
  ownerDocument,
  x,
  y,
}: {
  editorElement: HTMLElement
  ownerDocument: Document
  x: number
  y: number
}): HTMLElement | null {
  if (typeof ownerDocument.elementsFromPoint !== 'function') return null

  const editorRect = editorElement.getBoundingClientRect()
  if (editorRect.width <= 0 || editorRect.height <= 0) return null

  const column = textColumnBounds(editorElement, editorRect)
  const hitX = clamp(x, column.left + 10, column.right - 10)
  const hitY = clamp(y, editorRect.top + 1, editorRect.bottom - 1)

  for (const element of ownerDocument.elementsFromPoint(hitX, hitY)) {
    if (!editorElement.contains(element)) continue

    const blockElement = element.closest(BLOCK_CONTAINER_SELECTOR)
    if (blockElement instanceof HTMLElement && editorElement.contains(blockElement)) {
      return blockElement
    }
  }

  return null
}

export function dropPlacementForPoint(blockElement: HTMLElement, y: number): DropPlacement {
  const rect = blockElement.getBoundingClientRect()
  return y < rect.top + rect.height / 2 ? 'before' : 'after'
}

export function blockIdFromElement(blockElement: HTMLElement): string | null {
  return blockElement.dataset.id ?? null
}

export function blockElementById(editorElement: HTMLElement, blockId: string): HTMLElement | null {
  for (const element of editorElement.querySelectorAll(BLOCK_CONTAINER_SELECTOR)) {
    if (element instanceof HTMLElement && element.dataset.id === blockId) return element
  }

  return null
}

export function renderedSectionBlockElements(editorElement: HTMLElement): HTMLElement[] {
  const outerBlocks = Array.from(editorElement.querySelectorAll(BLOCK_OUTER_SELECTOR))
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
  if (outerBlocks.length > 0) return outerBlocks

  return Array.from(editorElement.querySelectorAll(BLOCK_CONTAINER_SELECTOR))
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
}

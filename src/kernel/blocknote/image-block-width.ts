/**
 * An Image block's width rules. The picture is always centred, so a resize
 * handle moves both edges: the width changes by twice the pointer's travel.
 * The width runs from 64px to the text column, and may pass the picture's
 * natural size. What is stored follows ADR 0011.
 */

export const IMAGE_MIN_WIDTH = 64

/** Below this width the Image toolbar does not fit inside the picture and sits above it. */
export const IMAGE_TOOLBAR_INSIDE_MIN_WIDTH = 160

export type ImageResizeHandle = 'left' | 'right'

export interface ImageResizeStart {
  handle: ImageResizeHandle
  startWidth: number
  startX: number
}

export function resizedImageWidth(start: ImageResizeStart, x: number, column: number | undefined): number {
  const travel = start.handle === 'right' ? x - start.startX : start.startX - x
  const width = start.startWidth + travel * 2
  const max = column && column > 0 ? column : Number.POSITIVE_INFINITY
  return Math.min(Math.max(width, IMAGE_MIN_WIDTH), Math.max(max, IMAGE_MIN_WIDTH))
}

/**
 * The width kept in the Document: whole pixels, and none for a picture that
 * fills the text column. A picture whose natural size is narrower than the
 * column keeps its width even there, or it would shrink back on reopen.
 */
export function storedImageWidth(width: number, column: number | undefined, natural: number): number | undefined {
  if (column && width >= column && natural >= column) return undefined
  return Math.round(width)
}

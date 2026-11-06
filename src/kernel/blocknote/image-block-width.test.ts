import { describe, expect, it } from 'vitest'
import { IMAGE_MIN_WIDTH, resizedImageWidth, storedImageWidth } from './image-block-width'

describe('an Image block resize', () => {
  it('moves both edges: the width changes by twice the pointer travel, from either handle', () => {
    expect(resizedImageWidth({ handle: 'right', startWidth: 300, startX: 500 }, 520, 700)).toBe(340)
    expect(resizedImageWidth({ handle: 'left', startWidth: 300, startX: 200 }, 180, 700)).toBe(340)
    expect(resizedImageWidth({ handle: 'left', startWidth: 300, startX: 200 }, 230, 700)).toBe(240)
  })

  it('stops at 64px and at the text column, and may pass the natural size', () => {
    expect(resizedImageWidth({ handle: 'right', startWidth: 100, startX: 0 }, -400, 700)).toBe(IMAGE_MIN_WIDTH)
    expect(resizedImageWidth({ handle: 'right', startWidth: 300, startX: 0 }, 900, 700)).toBe(700)
    expect(resizedImageWidth({ handle: 'right', startWidth: 300, startX: 0 }, 900, undefined)).toBe(2100)
  })
})

describe('the width an Image block keeps (ADR 0011)', () => {
  it('keeps whole pixels', () => {
    expect(storedImageWidth(412.6, 700, 1200)).toBe(413)
  })

  it('keeps none for a picture that fills the text column', () => {
    expect(storedImageWidth(700, 700, 1200)).toBeUndefined()
  })

  it('keeps the width of a picture widened past its natural size to the column, or it would shrink back', () => {
    expect(storedImageWidth(700, 700, 200)).toBe(700)
  })
})

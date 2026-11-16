import { describe, expect, it } from 'vitest'
import { dropIndex, shiftFor } from './use-tab-reorder'

// Four Tabs of 180px with the strip's 4px gap. Carrying one along the row is
// covered in tab-bar.test.tsx; these are the two sums it rests on.
const LEFTS = [0, 184, 368, 552]

describe('dropIndex', () => {
  it('keeps the place until the Tab has come half a place over its neighbour, going either way', () => {
    expect(dropIndex(LEFTS, 1, 0)).toBe(1)
    expect(dropIndex(LEFTS, 1, 91)).toBe(1)
    expect(dropIndex(LEFTS, 1, 93)).toBe(2)
    expect(dropIndex(LEFTS, 1, -91)).toBe(1)
    expect(dropIndex(LEFTS, 1, -93)).toBe(0)
  })

  it('passes several Tabs in one carry and stops at either end', () => {
    expect(dropIndex(LEFTS, 0, 400)).toBe(2)
    expect(dropIndex(LEFTS, 0, 5000)).toBe(3)
    expect(dropIndex(LEFTS, 3, -5000)).toBe(0)
  })

  it('has nowhere to go with one Tab, or with Tabs that were never laid out', () => {
    expect(dropIndex([0], 0, 300)).toBe(0)
    expect(dropIndex([0, 0, 0], 1, 300)).toBe(1)
  })
})

describe('shiftFor', () => {
  it('steps the Tabs that were passed one place towards where the carried one left, and no other', () => {
    // From the first place to the third: the second and third step back.
    expect([0, 1, 2, 3].map((index) => shiftFor(index, 0, 2, 184))).toEqual([0, -184, -184, 0])
    // From the last place to the second: the second and third step forward.
    expect([0, 1, 2, 3].map((index) => shiftFor(index, 3, 1, 184))).toEqual([0, 184, 184, 0])
    expect([0, 1, 2, 3].map((index) => shiftFor(index, 2, 2, 184))).toEqual([0, 0, 0, 0])
  })
})

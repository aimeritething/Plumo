import { describe, expect, it, vi } from 'vitest'
import { endOpenBlockEdits, hasOpenBlockEdits, registerOpenBlockEdit } from './open-block-edits'

describe('open Block edits', () => {
  it('ends every edit open on an editor, and only on that editor', () => {
    const editor = {}
    const other = {}
    const end = vi.fn()
    const otherEnd = vi.fn()
    registerOpenBlockEdit(editor, end)
    registerOpenBlockEdit(other, otherEnd)

    expect(hasOpenBlockEdits(editor)).toBe(true)
    endOpenBlockEdits(editor)

    expect(end).toHaveBeenCalledTimes(1)
    expect(otherEnd).not.toHaveBeenCalled()
  })

  it('forgets an edit once it is unregistered', () => {
    const editor = {}
    const end = vi.fn()
    const unregister = registerOpenBlockEdit(editor, end)
    unregister()

    expect(hasOpenBlockEdits(editor)).toBe(false)
    endOpenBlockEdits(editor)
    expect(end).not.toHaveBeenCalled()
  })

  it('lets an edit unregister itself while it ends', () => {
    const editor = {}
    const second = vi.fn()
    const unregisterFirst = registerOpenBlockEdit(editor, () => unregisterFirst())
    registerOpenBlockEdit(editor, second)

    endOpenBlockEdits(editor)

    expect(second).toHaveBeenCalledTimes(1)
  })
})

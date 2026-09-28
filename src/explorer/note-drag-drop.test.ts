import { afterEach, describe, expect, it, vi } from 'vitest'
import { canMoveInto, clearDraggedNotePath, NOTE_DRAG_MIME_TYPE, readDraggedNotePath, writeNoteDragData } from './note-drag-drop'

function dataTransferWithGetData(getData: (type: string) => unknown): DataTransfer {
  return { getData } as DataTransfer
}

describe('note drag/drop data', () => {
  afterEach(() => clearDraggedNotePath())

  it('writes the note path and plain text drag payloads', () => {
    const setData = vi.fn()
    const dataTransfer = { setData } as unknown as DataTransfer

    writeNoteDragData(dataTransfer, '/vault/notes/alpha.md')

    expect(dataTransfer.effectAllowed).toBe('move')
    expect(setData).toHaveBeenCalledWith(NOTE_DRAG_MIME_TYPE, '/vault/notes/alpha.md')
    expect(setData).toHaveBeenCalledWith('text/plain', '/vault/notes/alpha.md')
  })

  it('trims valid dragged note paths', () => {
    const dataTransfer = dataTransferWithGetData(() => '  /vault/notes/alpha.md  ')

    expect(readDraggedNotePath(dataTransfer)).toBe('/vault/notes/alpha.md')
  })

  it('ignores null drag payloads without crashing', () => {
    const dataTransfer = dataTransferWithGetData(() => null)

    expect(readDraggedNotePath(dataTransfer)).toBeNull()
  })
})

describe('where a dragged path can land (AIM-474)', () => {
  it('lands in any folder but the one it is already in', () => {
    expect(canMoveInto('/vault/notes/alpha.md', '/vault')).toBe(true)
    expect(canMoveInto('/vault/notes/alpha.md', '/vault/other')).toBe(true)
    expect(canMoveInto('/vault/notes/alpha.md', '/vault/notes')).toBe(false)
  })

  it('never takes a folder into itself or below itself', () => {
    expect(canMoveInto('/vault/notes', '/vault/notes')).toBe(false)
    expect(canMoveInto('/vault/notes', '/vault/notes/deep')).toBe(false)
    expect(canMoveInto('/vault/notes', '/vault/notes-archive')).toBe(true)
  })
})

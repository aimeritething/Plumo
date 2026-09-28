import { beforeEach, describe, expect, it, vi } from 'vitest'
import { openNotesSettled } from './note-open-request'

const runtime = vi.hoisted(() => ({ toast: vi.fn() }))

vi.mock('sonner', () => ({ toast: runtime.toast }))

describe('openNotesSettled', () => {
  beforeEach(() => {
    runtime.toast.mockReset()
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('says which file could not be opened, and still opens the rest', async () => {
    const openNote = vi.fn(async (path: string) => {
      if (path === '/n/Gone.md') throw new Error('File does not exist')
    })

    await openNotesSettled({ openNote, paths: ['/n/Gone.md', '/n/Here.md'], settleActiveNote: async () => {} })

    expect(runtime.toast).toHaveBeenCalledTimes(1)
    expect(runtime.toast).toHaveBeenCalledWith("Couldn't open Gone.md", expect.objectContaining({ id: 'open:/n/Gone.md' }))
    expect(openNote).toHaveBeenCalledWith('/n/Here.md')
  })

  it('says nothing when every file opens', async () => {
    await openNotesSettled({ openNote: async () => {}, paths: ['/n/Here.md'], settleActiveNote: async () => {} })

    expect(runtime.toast).not.toHaveBeenCalled()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadEditorImage } from './editor-image-upload'

const runtime = vi.hoisted(() => ({
  invoke: vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>(),
}))

vi.mock('@/platform/tauri', () => ({
  isTauri: () => true,
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (cmd: string, args?: Record<string, unknown>) => runtime.invoke(cmd, args),
  convertFileSrc: (path: string) => `asset://localhost${path}`,
}))

describe('uploadEditorImage', () => {
  beforeEach(() => {
    runtime.invoke.mockReset()
  })

  it('writes a pasted image beside the Document and points the block at it', async () => {
    runtime.invoke.mockResolvedValue('/Users/plumo/Notes/attachments/1700-image.png')
    const file = new File([new Uint8Array([0x89, 0x50])], 'image.png', { type: 'image/png' })

    const result = await uploadEditorImage(file, '/Users/plumo/Notes')

    expect(runtime.invoke).toHaveBeenCalledWith('save_image', {
      vaultPath: '/Users/plumo/Notes',
      filename: 'image.png',
      data: expect.any(String),
    })
    expect(result).toBe('asset://localhost/Users/plumo/Notes/attachments/1700-image.png')
  })

  it('leaves an unsupported format empty rather than failing the paste, and says why', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const onImageImportError = vi.fn()
    const file = new File(['heic-data'], 'iphone.HEIC', { type: 'image/heic' })

    try {
      await expect(uploadEditorImage(file, '/Users/plumo/Notes', onImageImportError)).resolves.toEqual({
        props: { name: 'iphone.HEIC', url: '' },
      })
      expect(runtime.invoke).not.toHaveBeenCalled()
      expect(warn).toHaveBeenCalled()
      expect(onImageImportError).toHaveBeenCalledWith(expect.objectContaining({ kind: 'unsupported-heic', fileName: 'iphone.HEIC' }))
    } finally {
      warn.mockRestore()
    }
  })

  it('lets a failure that is not an unsupported format surface, and says the copy failed', async () => {
    runtime.invoke.mockRejectedValue('Path must stay inside the active vault')
    const onImageImportError = vi.fn()
    const file = new File(['data'], 'shot.png', { type: 'image/png' })

    await expect(uploadEditorImage(file, '/Users/plumo/Notes', onImageImportError)).rejects.toBe(
      'Path must stay inside the active vault',
    )
    expect(onImageImportError).toHaveBeenCalledWith({ kind: 'copy-failed', fileName: 'shot.png' })
  })

  it('says the copy failed when the file could not be read, leaving the block empty', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    runtime.invoke.mockRejectedValue(new Error('The file could not be read'))
    const onImageImportError = vi.fn()
    const file = new File(['data'], 'shot.png', { type: 'image/png' })

    try {
      await expect(uploadEditorImage(file, '/Users/plumo/Notes', onImageImportError)).resolves.toEqual({
        props: { name: 'shot.png', url: '' },
      })
      expect(onImageImportError).toHaveBeenCalledWith({ kind: 'copy-failed', fileName: 'shot.png' })
    } finally {
      warn.mockRestore()
    }
  })
})

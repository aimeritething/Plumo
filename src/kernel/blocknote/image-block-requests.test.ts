import { describe, expect, it, vi } from 'vitest'
import {
  isRemoteImageUrl,
  requestImageOpen,
  requestImagePreview,
  subscribeImageOpenRequests,
  subscribeImagePreviewRequests,
} from './image-block-requests'

describe('what an Image block asks the editing surface', () => {
  it('bubbles a preview request from the block to the surface', () => {
    const surface = document.createElement('div')
    const block = document.createElement('div')
    surface.appendChild(block)
    const listener = vi.fn()
    const unsubscribe = subscribeImagePreviewRequests(surface, listener)

    requestImagePreview(block, { src: 'asset://localhost/a.png', alt: 'A chart' })

    expect(listener).toHaveBeenCalledWith({ src: 'asset://localhost/a.png', alt: 'A chart' })
    unsubscribe()
  })

  it('bubbles an open request from the block to the surface', () => {
    const surface = document.createElement('div')
    const block = document.createElement('div')
    surface.appendChild(block)
    const listener = vi.fn()
    const unsubscribe = subscribeImageOpenRequests(surface, listener)

    requestImageOpen(block, { url: 'https://example.com/a.png' })
    unsubscribe()
    requestImageOpen(block, { url: 'https://example.com/b.png' })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ url: 'https://example.com/a.png' })
  })

  it('opens a picture fetched over the web in the browser, any other in the default app', () => {
    expect(isRemoteImageUrl('https://example.com/a.png')).toBe(true)
    expect(isRemoteImageUrl('HTTP://example.com/a.png')).toBe(true)
    expect(isRemoteImageUrl('asset://localhost/%2Fvault%2Fa.png')).toBe(false)
    expect(isRemoteImageUrl('attachments/a.png')).toBe(false)
  })
})

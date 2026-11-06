import { act, fireEvent, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createRef } from 'react'
import { requestImagePreview } from '@/kernel/blocknote/image-block-requests'
import { useImagePreview } from './use-image-preview'

const { trackImagePreviewOpenedMock } = vi.hoisted(() => ({
  trackImagePreviewOpenedMock: vi.fn(),
}))

vi.mock('@/lib/product-analytics', () => ({
  trackImagePreviewOpened: trackImagePreviewOpenedMock,
}))

function createHookTarget() {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const ref = createRef<HTMLDivElement>()
  ref.current = container
  const view = renderHook(() => useImagePreview({ containerRef: ref }))

  return { container, view }
}

function appendImage(container: HTMLElement, src = 'https://example.com/photo.png') {
  const img = document.createElement('img')
  img.src = src
  img.alt = 'Preview target'
  container.appendChild(img)
  return img
}

beforeEach(() => {
  document.body.replaceChildren()
  trackImagePreviewOpenedMock.mockClear()
})

describe('useImagePreview', () => {
  it('opens the Image preview that Preview image on the Image toolbar asks for', () => {
    const { container, view } = createHookTarget()
    const block = document.createElement('div')
    container.appendChild(block)

    act(() => requestImagePreview(block, { src: 'asset://localhost/a.png', alt: ' A chart ' }))

    expect(view.result.current.image).toEqual({ src: 'asset://localhost/a.png', alt: 'A chart' })
    expect(trackImagePreviewOpenedMock).toHaveBeenCalledTimes(1)
  })

  it('opens the Image preview on image double-click', () => {
    const { container, view } = createHookTarget()
    const img = appendImage(container)

    fireEvent.doubleClick(img)

    expect(view.result.current.image).toEqual({
      src: 'https://example.com/photo.png',
      alt: 'Preview target',
    })
    expect(trackImagePreviewOpenedMock).toHaveBeenCalledTimes(1)
  })

  it('opens before BlockNote can stop the double-click from bubbling', () => {
    const { container, view } = createHookTarget()
    const img = appendImage(container)
    img.addEventListener('dblclick', (event) => event.stopPropagation())

    fireEvent.doubleClick(img)

    expect(view.result.current.image?.src).toBe('https://example.com/photo.png')
    expect(trackImagePreviewOpenedMock).toHaveBeenCalledTimes(1)
  })

  it('leaves single-click image selection alone', () => {
    const { container, view } = createHookTarget()
    const img = appendImage(container)

    fireEvent.click(img)

    expect(view.result.current.image).toBeNull()
    expect(trackImagePreviewOpenedMock).not.toHaveBeenCalled()
  })

  it('ignores double-clicks on non-image targets', () => {
    const { container, view } = createHookTarget()
    const text = document.createElement('span')
    container.appendChild(text)

    fireEvent.doubleClick(text)

    expect(view.result.current.image).toBeNull()
    expect(trackImagePreviewOpenedMock).not.toHaveBeenCalled()
  })

  it('closes the current Image preview', () => {
    const { container, view } = createHookTarget()
    const img = appendImage(container)

    fireEvent.doubleClick(img)
    act(() => {
      view.result.current.close()
    })

    expect(view.result.current.image).toBeNull()
  })
})

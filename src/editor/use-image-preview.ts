import { useCallback, useEffect, useState, type RefObject } from 'react'
import { trackImagePreviewOpened } from '@/lib/product-analytics'
import { subscribeImagePreviewRequests } from '@/kernel/blocknote/image-block-requests'
import { getDoubleClickedImageTarget, type ImagePreviewTarget } from './image-preview-target'

type UseImagePreviewArgs = {
  containerRef: RefObject<HTMLDivElement | null>
}

type UseImagePreviewResult = {
  image: ImagePreviewTarget | null
  close: () => void
}

export function useImagePreview({ containerRef }: UseImagePreviewArgs): UseImagePreviewResult {
  const [image, setImage] = useState<ImagePreviewTarget | null>(null)
  const close = useCallback(() => setImage(null), [])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const onDoubleClick = (event: MouseEvent) => {
      const nextImage = getDoubleClickedImageTarget(event.target)
      if (!nextImage) return

      event.preventDefault()
      setImage(nextImage)
      trackImagePreviewOpened()
    }

    container.addEventListener('dblclick', onDoubleClick, true)
    // Preview image on the Image toolbar asks for the same view.
    const unsubscribe = subscribeImagePreviewRequests(container, (request) => {
      setImage({ src: request.src, alt: request.alt.trim() })
      trackImagePreviewOpened()
    })
    return () => {
      container.removeEventListener('dblclick', onDoubleClick, true)
      unsubscribe()
    }
  }, [containerRef])

  return { image, close }
}

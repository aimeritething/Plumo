/**
 * What an Image block asks the editing surface to do, as DOM events that
 * bubble from the block: the block only asks; showing the Image preview and
 * handing a file to another app are the surface's (CONTEXT.md, Kernel).
 */

export const IMAGE_PREVIEW_REQUEST_EVENT = 'plumo:image-preview-request'
export const IMAGE_OPEN_REQUEST_EVENT = 'plumo:image-open-request'

export interface ImagePreviewRequest {
  src: string
  alt: string
}

export interface ImageOpenRequest {
  url: string
}

function dispatchRequest<T>(target: EventTarget, type: string, detail: T): void {
  target.dispatchEvent(new CustomEvent<T>(type, { bubbles: true, composed: true, detail }))
}

export function requestImagePreview(target: EventTarget, request: ImagePreviewRequest): void {
  dispatchRequest(target, IMAGE_PREVIEW_REQUEST_EVENT, request)
}

export function requestImageOpen(target: EventTarget, request: ImageOpenRequest): void {
  dispatchRequest(target, IMAGE_OPEN_REQUEST_EVENT, request)
}

function readDetail<T>(event: Event, isDetail: (detail: unknown) => detail is T): T | null {
  const detail = (event as CustomEvent<unknown>).detail
  return isDetail(detail) ? detail : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isPreviewRequest(detail: unknown): detail is ImagePreviewRequest {
  return isRecord(detail) && typeof detail.src === 'string' && typeof detail.alt === 'string'
}

function isOpenRequest(detail: unknown): detail is ImageOpenRequest {
  return isRecord(detail) && typeof detail.url === 'string'
}

export function subscribeImagePreviewRequests(
  target: EventTarget,
  listener: (request: ImagePreviewRequest) => void,
): () => void {
  const handle = (event: Event) => {
    const request = readDetail(event, isPreviewRequest)
    if (request) listener(request)
  }
  target.addEventListener(IMAGE_PREVIEW_REQUEST_EVENT, handle)
  return () => target.removeEventListener(IMAGE_PREVIEW_REQUEST_EVENT, handle)
}

export function subscribeImageOpenRequests(
  target: EventTarget,
  listener: (request: ImageOpenRequest) => void,
): () => void {
  const handle = (event: Event) => {
    const request = readDetail(event, isOpenRequest)
    if (request) listener(request)
  }
  target.addEventListener(IMAGE_OPEN_REQUEST_EVENT, handle)
  return () => target.removeEventListener(IMAGE_OPEN_REQUEST_EVENT, handle)
}

const REMOTE_URL_PATTERN = /^https?:\/\//iu

/** A picture fetched over the web opens in the browser; any other in the default app. */
export function isRemoteImageUrl(url: string): boolean {
  return REMOTE_URL_PATTERN.test(url.trim())
}

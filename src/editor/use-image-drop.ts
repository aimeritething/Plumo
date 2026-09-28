import { useEffect, useRef, useState, type RefObject } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/platform/tauri'
import { isImageFilePath } from '@/tabs/image-file'
import { attachmentAssetUrlFromPath } from '@/kernel/markdown/vault-attachments'
import { useTauriDragDropEvent, type TauriDragDropEvent } from '@/platform/use-tauri-drag-drop-event'

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
const UNSUPPORTED_HEIC_EXTENSIONS = ['heic', 'heif']
const UNSUPPORTED_HEIC_MIME_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']

type ImageUrlHandler = (url: string) => void
type UnsupportedImageImportError = {
  fileName: string
  format: 'HEIC'
  kind: 'unsupported-heic'
}
export type ImageImportError = UnsupportedImageImportError | {
  failedCount: number
  kind: 'remote-download'
  totalCount: number
} | {
  /** The file could not be read, or written into `attachments/` (a read-only directory, say). */
  fileName: string
  kind: 'copy-failed'
}
export type ImageImportErrorHandler = (error: ImageImportError) => void
export type UploadImageFileResult = string | { props: { name: string; url: string } }
type CopyImageToVaultRequest = {
  sourcePath: string
  vaultPath: string
}
type DroppedImagesRequest = {
  imagePaths: string[]
  onImageImportError: ImageImportErrorHandler | undefined
  vaultPath: string | undefined
  onImageUrl: ImageUrlHandler | undefined
}
type HtmlDroppedImagesRequest = {
  files: File[]
  onImageImportError: ImageImportErrorHandler | undefined
  onImageUrl: ImageUrlHandler
  vaultPath: string | undefined
}
type NativeDropEventRequest = {
  event: TauriDragDropEvent
  onImageImportError: ImageImportErrorHandler | undefined
  onImageUrl: ImageUrlHandler | undefined
  setIsDragOver: (isDragOver: boolean) => void
  vaultPath: string | undefined
}

export class UnsupportedImageFormatError extends Error implements UnsupportedImageImportError {
  readonly fileName: string
  readonly format = 'HEIC'
  readonly kind = 'unsupported-heic'

  constructor(fileName: string) {
    super('HEIC and HEIF images are not supported by image import yet.')
    this.name = 'UnsupportedImageFormatError'
    this.fileName = fileName
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function filenameFromPath(path: string): string {
  return path.split(/[\\/]/u).pop() || path
}

function extensionFromFilename(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? ''
}

function isUnsupportedHeicFilename(filename: string): boolean {
  return UNSUPPORTED_HEIC_EXTENSIONS.includes(extensionFromFilename(filename))
}

function unsupportedHeicImportError(fileName: string): ImageImportError {
  return {
    kind: 'unsupported-heic',
    fileName,
    format: 'HEIC',
  }
}

function isUnsupportedHeicFile(file: File): boolean {
  return isUnsupportedHeicFilename(file.name) || UNSUPPORTED_HEIC_MIME_TYPES.includes(file.type.toLowerCase())
}

export function isUnsupportedImageFormatError(error: unknown): error is UnsupportedImageFormatError {
  return error instanceof UnsupportedImageFormatError
    || (
      isRecord(error)
      && Reflect.get(error, 'name') === 'UnsupportedImageFormatError'
      && Reflect.get(error, 'kind') === 'unsupported-heic'
      && Reflect.get(error, 'format') === 'HEIC'
      && typeof Reflect.get(error, 'fileName') === 'string'
    )
}

function hasImageFiles(dt: DataTransfer): boolean {
  for (let i = 0; i < dt.items.length; i++) {
    const item = Reflect.get(dt.items, i) as DataTransferItem | undefined
    if (item?.kind === 'file' && IMAGE_MIME_TYPES.includes(item.type)) return true
  }
  return Array.from(dt.files).some(isDroppedImageFile)
}

function isDroppedImageFile(file: File): boolean {
  return IMAGE_MIME_TYPES.includes(file.type.toLowerCase())
    || isImageFilePath(file.name)
    || isUnsupportedHeicFile(file)
}

function isUnsupportedHeicPath(path: string): boolean {
  return isUnsupportedHeicFilename(filenameFromPath(path))
}

export function imageUrlFromUploadResult(result: UploadImageFileResult): string {
  return typeof result === 'string' ? result : result.props.url
}

export function emptyImageUploadResult(file: File): UploadImageFileResult {
  return { props: { name: file.name, url: '' } }
}

function uploadErrorText(error: unknown): string {
  if (error instanceof Error) return [error.name, error.message].filter(Boolean).join(': ')
  if (typeof error === 'string') return error
  if (!isRecord(error)) return ''

  const name = Reflect.get(error, 'name')
  const message = Reflect.get(error, 'message')
  return [
    typeof name === 'string' ? name : undefined,
    typeof message === 'string' ? message : undefined,
  ].filter(Boolean).join(': ')
}

function isUnreadableFileUploadError(error: unknown): boolean {
  const text = uploadErrorText(error)
  return text.includes('NotReadableError') || text.includes('could not be read')
}

function handleUploadFailure(file: File, error: unknown): UploadImageFileResult {
  if (!isUnreadableFileUploadError(error)) throw error

  console.warn('[image-upload] Skipped unreadable file upload:', error)
  return emptyImageUploadResult(file)
}

function uploadedImageAssetUrl(file: File, path: string): UploadImageFileResult {
  try {
    return attachmentAssetUrlFromPath({ path })
  } catch (error) {
    console.warn('[image-upload] Failed to prepare uploaded image asset URL:', error)
    return emptyImageUploadResult(file)
  }
}

function readBrowserImageFile(file: File): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

/** Upload an image file — saves to vault/attachments in Tauri, returns data URL in browser */
export async function uploadImageFile(file: File, vaultPath?: string): Promise<UploadImageFileResult> {
  if (isUnsupportedHeicFile(file)) throw new UnsupportedImageFormatError(file.name)

  try {
    if (isTauri() && vaultPath) {
      const buf = await file.arrayBuffer()
      const bytes = new Uint8Array(buf)
      let binary = ''
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes.at(i) ?? 0)
      const base64 = btoa(binary)
      const savedPath = await invoke<string>('save_image', {
        vaultPath,
        filename: file.name,
        data: base64,
      })
      return uploadedImageAssetUrl(file, savedPath)
    }
    return await readBrowserImageFile(file)
  } catch (error) {
    return handleUploadFailure(file, error)
  }
}

/** Copy a dropped file (by OS path) into vault/attachments and return its asset URL. */
async function copyImageToVault({
  sourcePath,
  vaultPath,
}: CopyImageToVaultRequest): Promise<string> {
  const savedPath = await invoke<string>('copy_image_to_vault', { vaultPath, sourcePath })
  return attachmentAssetUrlFromPath({ path: savedPath })
}

function logDroppedImageCopyFailure(error: unknown): void {
  console.warn('[image-drop] Failed to copy dropped image into vault:', error)
}

export function copyFailedImportError(fileName: string): ImageImportError {
  return { kind: 'copy-failed', fileName }
}

function reportDroppedImageCopyFailure(
  fileName: string,
  onImageImportError: ImageImportErrorHandler | undefined,
): (error: unknown) => void {
  return (error) => {
    logDroppedImageCopyFailure(error)
    onImageImportError?.(copyFailedImportError(fileName))
  }
}

function insertHtmlDroppedImages({
  files,
  onImageImportError,
  onImageUrl,
  vaultPath,
}: HtmlDroppedImagesRequest): void {
  for (const file of files) {
    if (isUnsupportedHeicFile(file)) {
      onImageImportError?.(unsupportedHeicImportError(file.name))
      continue
    }
    // An unreadable file comes back as an empty result rather than a rejection.
    void uploadImageFile(file, vaultPath).then((result) => {
      const url = imageUrlFromUploadResult(result)
      if (url) onImageUrl(url)
      else onImageImportError?.(copyFailedImportError(file.name))
    }, reportDroppedImageCopyFailure(file.name, onImageImportError))
  }
}

function reportUnsupportedDroppedImages(
  imagePaths: string[],
  onImageImportError: ImageImportErrorHandler | undefined,
): void {
  const unsupportedPath = imagePaths.find(isUnsupportedHeicPath)
  if (!unsupportedPath) return

  onImageImportError?.(unsupportedHeicImportError(filenameFromPath(unsupportedPath)))
}

function insertDroppedImages({
  imagePaths,
  onImageImportError,
  vaultPath,
  onImageUrl,
}: DroppedImagesRequest): void {
  if (imagePaths.length === 0) return
  reportUnsupportedDroppedImages(imagePaths, onImageImportError)
  if (!vaultPath || !onImageUrl) return

  for (const sourcePath of imagePaths.filter(isImageFilePath)) {
    void copyImageToVault({ sourcePath, vaultPath }).then(
      onImageUrl,
      reportDroppedImageCopyFailure(filenameFromPath(sourcePath), onImageImportError),
    )
  }
}

function handleNativeDropEvent({
  event,
  onImageImportError,
  onImageUrl,
  setIsDragOver,
  vaultPath,
}: NativeDropEventRequest): void {
  const { payload } = event
  // Native drag-drop is on, so the HTML5 `dragover` that used to raise the
  // affordance never fires for a file from Finder; the enter event does, and
  // it names the paths, so a `.md` being dragged past does not claim to be one.
  // The over event repeats for every pointer move and names nothing, so it is
  // left alone rather than taking the affordance back down each time.
  if (payload.type === 'over') return
  if (payload.type === 'enter') {
    setIsDragOver(payload.paths.some(isImageFilePath))
    return
  }
  if (payload.type === 'drop') {
    setIsDragOver(false)
    insertDroppedImages({
      imagePaths: payload.paths,
      onImageImportError,
      vaultPath,
      onImageUrl,
    })
    return
  }
  setIsDragOver(false)
}

interface UseImageDropOptions {
  containerRef: RefObject<HTMLDivElement | null>
  /** Called when an image-like file is not supported, or could not be copied into `attachments/`. */
  onImageImportError?: ImageImportErrorHandler
  /** Called with an asset URL for each image dropped via Tauri native drag-drop. */
  onImageUrl?: (url: string) => void
  vaultPath?: string
}

export function useImageDrop({ containerRef, onImageImportError, onImageUrl, vaultPath }: UseImageDropOptions) {
  const [isDragOver, setIsDragOver] = useState(false)
  const onImageImportErrorRef = useRef(onImageImportError)
  useEffect(() => { onImageImportErrorRef.current = onImageImportError }, [onImageImportError])
  const onImageUrlRef = useRef(onImageUrl)
  useEffect(() => { onImageUrlRef.current = onImageUrl }, [onImageUrl])
  const vaultPathRef = useRef(vaultPath)
  useEffect(() => { vaultPathRef.current = vaultPath }, [vaultPath])

  // HTML5 DnD handles OS image files while allowing internal editor drags
  // through. Under Tauri nothing external reaches it — the drop is the native
  // branch's below — so this is the browser's path, and the editor's own drags.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const handleDragOver = (e: DragEvent) => {
      if (!e.dataTransfer || !hasImageFiles(e.dataTransfer)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }

    const handleDragLeave = (e: DragEvent) => {
      if (!container.contains(e.relatedTarget as Node)) {
        setIsDragOver(false)
      }
    }

    const handleDrop = (event: DragEvent) => {
      setIsDragOver(false)
      if (!event.dataTransfer) return
      const files = Array.from(event.dataTransfer.files).filter(isDroppedImageFile)
      const currentOnImageUrl = onImageUrlRef.current
      if (files.length === 0 || !currentOnImageUrl) return

      event.preventDefault()
      event.stopImmediatePropagation()
      insertHtmlDroppedImages({
        files,
        onImageImportError: onImageImportErrorRef.current,
        onImageUrl: currentOnImageUrl,
        vaultPath: vaultPathRef.current,
      })
    }

    container.addEventListener('dragover', handleDragOver)
    container.addEventListener('dragleave', handleDragLeave)
    container.addEventListener('drop', handleDrop, true)

    return () => {
      container.removeEventListener('dragover', handleDragOver)
      container.removeEventListener('dragleave', handleDragLeave)
      container.removeEventListener('drop', handleDrop, true)
    }
  }, [containerRef])

  /**
   * Native drag-drop is where an OS file drop actually lands: `dragDropEnabled`
   * is on, so WKWebView keeps such a drop away from the page and no HTML5 `drop`
   * follows. The raw `tauri://drag-*` payloads carry only paths and a position,
   * so the intake hook is the one that names the kind of drag.
   */
  useTauriDragDropEvent((event: TauriDragDropEvent) => {
    handleNativeDropEvent({
      event,
      onImageImportError: onImageImportErrorRef.current,
      onImageUrl: onImageUrlRef.current,
      setIsDragOver,
      vaultPath: vaultPathRef.current,
    })
  })

  return { isDragOver }
}

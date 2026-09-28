import { useEffect, useRef, useState, type RefObject } from 'react'
import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/platform/tauri'
import { isImageFilePath } from '@/tabs/image-file'
import { attachmentAssetUrlFromPath } from '@/kernel/markdown/vault-attachments'
import {
  dragDropClientPoint,
  useTauriDragDropEvent,
  type ClientPoint,
  type TauriDragDropEvent,
} from '@/platform/use-tauri-drag-drop-event'

const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
const UNSUPPORTED_HEIC_EXTENSIONS = ['heic', 'heif']
const UNSUPPORTED_HEIC_MIME_TYPES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence']

/** Receives the asset URL of every image of one drop that became an Attachment, in the order they were dropped. */
type ImagesDroppedHandler<Target> = (urls: string[], target: Target) => void
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
type DroppedImagesRequest<Target> = {
  imagePaths: string[]
  onImageImportError: ImageImportErrorHandler | undefined
  onImagesDropped: ImagesDroppedHandler<Target>
  target: Target
  vaultPath: string
}
type HtmlDroppedImagesRequest<Target> = {
  files: File[]
  onImageImportError: ImageImportErrorHandler | undefined
  onImagesDropped: ImagesDroppedHandler<Target>
  target: Target
  vaultPath: string | undefined
}
type NativeDropEventRequest<Target> = {
  container: HTMLElement | null
  dropTargetAt: ((point: ClientPoint) => Target | null) | undefined
  event: TauriDragDropEvent
  imageDragRef: { current: boolean }
  onImageImportError: ImageImportErrorHandler | undefined
  onImagesDropped: ImagesDroppedHandler<Target> | undefined
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
  return Array.from(dt.files).some(isImageLikeFile)
}

/** An Image file, or an image format the import says it cannot take (HEIC), by type or by name. */
export function isImageLikeFile(file: File): boolean {
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

/**
 * The copies run side by side and finish in any order; the images go in once
 * every one has settled, in the order they were dropped, so three files land as
 * three consecutive images rather than in whichever order the disk answered.
 */
function insertInDropOrder<Target>(
  copies: Promise<string | null>[],
  onImagesDropped: ImagesDroppedHandler<Target>,
  target: Target,
): void {
  void Promise.all(copies).then((urls) => {
    const landed = urls.filter((url): url is string => Boolean(url))
    if (landed.length > 0) onImagesDropped(landed, target)
  })
}

function insertHtmlDroppedImages<Target>({
  files,
  onImageImportError,
  onImagesDropped,
  target,
  vaultPath,
}: HtmlDroppedImagesRequest<Target>): void {
  const copies = files.flatMap((file) => {
    if (isUnsupportedHeicFile(file)) {
      onImageImportError?.(unsupportedHeicImportError(file.name))
      return []
    }
    const reportFailure = reportDroppedImageCopyFailure(file.name, onImageImportError)
    // An unreadable file comes back as an empty result rather than a rejection.
    return [uploadImageFile(file, vaultPath).then((result) => {
      const url = imageUrlFromUploadResult(result)
      if (!url) onImageImportError?.(copyFailedImportError(file.name))
      return url || null
    }, (error: unknown) => {
      reportFailure(error)
      return null
    })]
  })
  insertInDropOrder(copies, onImagesDropped, target)
}

function reportUnsupportedDroppedImages(
  imagePaths: string[],
  onImageImportError: ImageImportErrorHandler | undefined,
): void {
  const unsupportedPath = imagePaths.find(isUnsupportedHeicPath)
  if (!unsupportedPath) return

  onImageImportError?.(unsupportedHeicImportError(filenameFromPath(unsupportedPath)))
}

function insertDroppedImages<Target>({
  imagePaths,
  onImageImportError,
  onImagesDropped,
  target,
  vaultPath,
}: DroppedImagesRequest<Target>): void {
  const copies = imagePaths.filter(isImageFilePath).map((sourcePath) => {
    const reportFailure = reportDroppedImageCopyFailure(filenameFromPath(sourcePath), onImageImportError)
    return copyImageToVault({ sourcePath, vaultPath }).then(
      (url): string | null => url,
      (error: unknown) => {
        reportFailure(error)
        return null
      },
    )
  })
  insertInDropOrder(copies, onImagesDropped, target)
}

/**
 * The editor pane's document area around an editor, Rich or Raw: the scroll
 * area it sits in, the empty margins beside a centred text column included.
 * An editor mounted anywhere else is its own area.
 */
function editorDropArea(editor: HTMLElement): HTMLElement {
  const area = editor.closest('.editor-scroll-area')
  return area instanceof HTMLElement ? area : editor
}

/**
 * Whether an element under the pointer is the editor or the empty ground
 * around it in its document area (the area itself, the column that centres
 * the editor), rather than the find bar above it or anything laid over it
 * (a dialog, a menu). The drop affordance is `pointer-events: none`, so it
 * is never what is under the pointer.
 */
function isEditorOrItsMargin(editor: HTMLElement, element: Node | null): boolean {
  if (!element) return false

  const area = editorDropArea(editor)
  return editor.contains(element) || (area.contains(element) && element.contains(editor))
}

/**
 * BlockNote's side menu re-dispatches a drag event that lands within 250px of
 * its editor into the editor, as a `synthetic` copy with the point pulled
 * inside. The real event has already crossed the document area and been read
 * by the rule above, so a copy carrying an image is stopped: neither this
 * hook nor the editor takes it a second time, or from over the find bar.
 */
function stopBlockNoteSyntheticCopy(event: DragEvent): boolean {
  if (Reflect.get(event, 'synthetic') !== true) return false

  event.stopImmediatePropagation()
  return true
}

/** Whether a point in the window is over the editor or the margins of its document area. */
function isPointOverEditor(editor: HTMLElement | null, point: ClientPoint): boolean {
  if (!editor) return false

  const rect = editorDropArea(editor).getBoundingClientRect()
  const inside = point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom
  if (!inside) return false

  const { ownerDocument } = editor
  if (typeof ownerDocument.elementFromPoint !== 'function') return true
  return isEditorOrItsMargin(editor, ownerDocument.elementFromPoint(point.x, point.y))
}

function dropNativeImages<Target>(
  request: NativeDropEventRequest<Target>,
  paths: string[],
  point: ClientPoint,
): void {
  const { container, dropTargetAt, onImageImportError, onImagesDropped, vaultPath } = request
  const imagePaths = paths.filter((path) => isImageFilePath(path) || isUnsupportedHeicPath(path))
  if (imagePaths.length === 0 || !dropTargetAt || !onImagesDropped) return
  if (!isPointOverEditor(container, point)) return

  const target = dropTargetAt(point)
  if (target === null) return
  reportUnsupportedDroppedImages(imagePaths, onImageImportError)
  if (vaultPath) insertDroppedImages({ imagePaths, onImageImportError, onImagesDropped, target, vaultPath })
}

function handleNativeDropEvent<Target>(request: NativeDropEventRequest<Target>): void {
  const { container, event, imageDragRef, setIsDragOver } = request
  const { payload } = event
  // Native drag-drop is on, so the HTML5 `dragover` that used to raise the
  // affordance never fires for a file from Finder; the enter event does, and
  // it names the paths, so a `.md` being dragged past does not claim to be one.
  // The over event names nothing, so what enter found is kept for it; it only
  // says where the pointer is, and the affordance shows while that is the editor.
  if (payload.type === 'enter') {
    imageDragRef.current = payload.paths.some(isImageFilePath)
    setIsDragOver(imageDragRef.current && isPointOverEditor(container, dragDropClientPoint(payload.position)))
    return
  }
  if (payload.type === 'over') {
    if (imageDragRef.current) setIsDragOver(isPointOverEditor(container, dragDropClientPoint(payload.position)))
    return
  }
  imageDragRef.current = false
  setIsDragOver(false)
  if (payload.type === 'drop') dropNativeImages(request, payload.paths, dragDropClientPoint(payload.position))
}

interface UseImageDropOptions<Target> {
  /**
   * The editor: a drop is taken only when it is released over it, or over the
   * empty margins of the document area it sits in (its `.editor-scroll-area`).
   */
  containerRef: RefObject<HTMLDivElement | null>
  /**
   * Where images released at this point go, read the moment they are dropped,
   * before any copy has started; null takes nothing from the drop.
   */
  dropTargetAt?: (point: ClientPoint) => Target | null
  /** Called when an image-like file is not supported, or could not be copied into `attachments/`. */
  onImageImportError?: ImageImportErrorHandler
  /** Called once a drop's copies have settled, with the asset URL of each that landed, in the order they were dropped. */
  onImagesDropped?: ImagesDroppedHandler<Target>
  vaultPath?: string
}

export function useImageDrop<Target>({
  containerRef,
  dropTargetAt,
  onImageImportError,
  onImagesDropped,
  vaultPath,
}: UseImageDropOptions<Target>) {
  const [isDragOver, setIsDragOver] = useState(false)
  const imageDragRef = useRef(false)
  const dropTargetAtRef = useRef(dropTargetAt)
  useEffect(() => { dropTargetAtRef.current = dropTargetAt }, [dropTargetAt])
  const onImageImportErrorRef = useRef(onImageImportError)
  useEffect(() => { onImageImportErrorRef.current = onImageImportError }, [onImageImportError])
  const onImagesDroppedRef = useRef(onImagesDropped)
  useEffect(() => { onImagesDroppedRef.current = onImagesDropped }, [onImagesDropped])
  const vaultPathRef = useRef(vaultPath)
  useEffect(() => { vaultPathRef.current = vaultPath }, [vaultPath])

  // HTML5 DnD handles OS image files while allowing internal editor drags
  // through. Under Tauri nothing external reaches it — the drop is the native
  // branch's below — so this is the browser's path, and the editor's own drags.
  // It listens on the whole document area; an event's target is what is under
  // the pointer, so it is read by the native branch's rule without a hit test.
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const area = editorDropArea(container)
    const isOverEditor = (event: DragEvent) => isEditorOrItsMargin(container, event.target as Node | null)

    const handleDragOver = (e: DragEvent) => {
      if (!e.dataTransfer || !hasImageFiles(e.dataTransfer)) return
      if (stopBlockNoteSyntheticCopy(e)) return
      if (!isOverEditor(e)) {
        setIsDragOver(false)
        return
      }
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setIsDragOver(true)
    }

    const handleDragLeave = (e: DragEvent) => {
      if (!area.contains(e.relatedTarget as Node)) {
        setIsDragOver(false)
      }
    }

    const handleDrop = (event: DragEvent) => {
      setIsDragOver(false)
      if (!event.dataTransfer) return
      const files = Array.from(event.dataTransfer.files).filter(isImageLikeFile)
      const currentDropTargetAt = dropTargetAtRef.current
      const currentOnImagesDropped = onImagesDroppedRef.current
      if (files.length === 0 || !currentDropTargetAt || !currentOnImagesDropped) return
      if (stopBlockNoteSyntheticCopy(event) || !isOverEditor(event)) return

      // Taken even when it finds no place, so the editor underneath never
      // inserts the file its own way (CodeMirror would insert its bytes as text).
      event.preventDefault()
      event.stopImmediatePropagation()
      const target = currentDropTargetAt({ x: event.clientX, y: event.clientY })
      if (target === null) return
      insertHtmlDroppedImages({
        files,
        onImageImportError: onImageImportErrorRef.current,
        onImagesDropped: currentOnImagesDropped,
        target,
        vaultPath: vaultPathRef.current,
      })
    }

    // Captured, so a synthetic copy is stopped before the editor inside sees it.
    area.addEventListener('dragover', handleDragOver, true)
    area.addEventListener('dragleave', handleDragLeave)
    area.addEventListener('drop', handleDrop, true)

    return () => {
      area.removeEventListener('dragover', handleDragOver, true)
      area.removeEventListener('dragleave', handleDragLeave)
      area.removeEventListener('drop', handleDrop, true)
    }
  }, [containerRef])

  /**
   * Native drag-drop is where an OS file drop actually lands: `dragDropEnabled`
   * is on, so WKWebView keeps such a drop away from the page and no HTML5 `drop`
   * follows. The event is the window's, so its position is what says whether
   * the release was over this editor, and where in it (ADR-0006).
   */
  useTauriDragDropEvent((event: TauriDragDropEvent) => {
    handleNativeDropEvent({
      container: containerRef.current,
      dropTargetAt: dropTargetAtRef.current,
      event,
      imageDragRef,
      onImageImportError: onImageImportErrorRef.current,
      onImagesDropped: onImagesDroppedRef.current,
      setIsDragOver,
      vaultPath: vaultPathRef.current,
    })
  })

  return { isDragOver }
}

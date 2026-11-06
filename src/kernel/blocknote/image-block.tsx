/* eslint-disable react-refresh/only-export-components -- the block spec and its helpers sit next to the view */
import { createImageBlockConfig, imageParse } from '@blocknote/core'
import { FilePanelExtension } from '@blocknote/core/extensions'
import {
  createReactBlockSpec,
  ImageToExternalHTML,
  useExtension,
  useUploadLoading,
  type ReactCustomBlockRenderProps,
} from '@blocknote/react'
import { Image as ImageIcon, ImageBroken } from '@phosphor-icons/react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react'
import { cn } from '@/lib/cn'
import { subscribeFolderFilesChanged } from '@/lib/folder-file-changes'
import { filesystemPathFromAssetUrl, isTauriAssetUrl } from '@/kernel/markdown/vault-attachments'
import { AddFileButton, FileBlockLoading } from './add-file-button'
import {
  selectFileBlock,
  updateFileBlockProps,
  useFileBlockCaptionEdit,
  useFileBlockSelected,
  useHover,
} from './file-block-edits'
import { ImageCaption } from './image-caption'
import { isRemoteImageUrl, requestImageOpen, requestImagePreview } from './image-block-requests'
import {
  IMAGE_TOOLBAR_INSIDE_MIN_WIDTH,
  resizedImageWidth,
  storedImageWidth,
  type ImageResizeHandle,
  type ImageResizeStart,
} from './image-block-width'
import { ImageToolbar } from './image-toolbar'

// Plumo's Image block, in place of BlockNote's (AIM-531): the picture centred,
// resized from both edges at once, with the Image toolbar in its corner, the
// caption typed in place under it, and a placeholder when it fails to load.
// The empty block is Plumo's empty slot (add-file-button.tsx), which opens
// the File panel.

type ImageBlockConfig = ReturnType<typeof createImageBlockConfig>
type ImageBlockProps = Omit<
  ReactCustomBlockRenderProps<ImageBlockConfig['type'], ImageBlockConfig['propSchema'], ImageBlockConfig['content']>,
  'contentRef'
>
type ImageBlockEditor = ImageBlockProps['editor']
type ImageBlockData = ImageBlockProps['block']
type LoadState = 'loading' | 'loaded' | 'error'

export { isBlockNodeSelected } from './file-block-edits'

/** The file name a placeholder shows: the last part of the URL's path, else the alt text. */
export function imageFileName(url: string, name: string): string {
  const path = url.split(/[?#]/u)[0] ?? ''
  let decoded = path
  try {
    decoded = decodeURIComponent(path)
  } catch {
    // A malformed escape: the path as written.
  }
  const segment = decoded.slice(Math.max(decoded.lastIndexOf('/'), decoded.lastIndexOf('\\')) + 1)
  return segment || name
}

function normalizedPath(path: string): string {
  return path.replace(/\\/gu, '/').replace(/\/+$/u, '')
}

/** Whether a watcher event may have brought back the file at `path`: it names it or a folder above it. */
export function folderChangeTouches(path: string, changed: string[]): boolean {
  if (changed.length === 0) return true
  const target = normalizedPath(path)
  return changed.some((candidate) => {
    const changedPath = normalizedPath(candidate)
    return target === changedPath || target.startsWith(`${changedPath}/`)
  })
}

function reloadSource(url: string, attempt: number): string {
  if (attempt === 0 || !isTauriAssetUrl({ url })) return url
  return `${url}${url.includes('?') ? '&' : '?'}plumo-reload=${attempt}`
}

/**
 * The picture's load state. A picture that failed to load is tried again when
 * the Folder watcher reports its file (or a folder above it) changed.
 */
function useImageLoad(url: string) {
  const [attempt, setAttempt] = useState(0)
  const key = `${attempt}:${url}`
  const [status, setStatus] = useState<{ key: string; state: LoadState }>({ key, state: 'loading' })
  const state: LoadState = status.key === key ? status.state : 'loading'
  const localPath = filesystemPathFromAssetUrl({ url })

  useEffect(() => {
    if (state !== 'error' || !localPath) return
    return subscribeFolderFilesChanged((paths) => {
      if (folderChangeTouches(localPath, paths)) setAttempt((current) => current + 1)
    })
  }, [localPath, state])

  return {
    attempt,
    src: reloadSource(url, attempt),
    state,
    onLoad: () => setStatus({ key, state: 'loaded' }),
    onError: () => setStatus({ key, state: 'error' }),
  }
}

function useElementWidth(ref: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const element = ref.current
    if (!element || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return width
}

function columnWidth(editor: ImageBlockEditor): number | undefined {
  return editor.domElement?.firstElementChild?.clientWidth || undefined
}

/** Resizing from either edge: the width follows the pointer twice over, and is stored on release. */
function useImageResize(options: {
  block: ImageBlockData
  editor: ImageBlockEditor
  frameRef: RefObject<HTMLDivElement | null>
  imageRef: RefObject<HTMLImageElement | null>
}) {
  const { block, editor, frameRef, imageRef } = options
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => () => stopRef.current?.(), [])

  const startResize = useCallback((handle: ImageResizeHandle) => (event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const frame = frameRef.current
    if (!frame || !editor.isEditable) return

    const start: ImageResizeStart = { handle, startWidth: frame.getBoundingClientRect().width, startX: event.clientX }
    let width = start.startWidth
    setDragWidth(width)

    const move = (moveEvent: MouseEvent) => {
      width = resizedImageWidth(start, moveEvent.clientX, columnWidth(editor))
      setDragWidth(width)
    }
    const stop = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', release)
      stopRef.current = null
    }
    const release = () => {
      stop()
      setDragWidth(null)
      const stored = storedImageWidth(width, columnWidth(editor), imageRef.current?.naturalWidth ?? 0)
      if (stored !== block.props.previewWidth) updateFileBlockProps(editor, block.id, { previewWidth: stored })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', release)
    stopRef.current = stop
  }, [block.id, block.props.previewWidth, editor, frameRef, imageRef])

  return { dragWidth, resizing: dragWidth !== null, startResize }
}

function ResizeHandle({ shown, side, onMouseDown }: {
  shown: boolean
  side: ImageResizeHandle
  onMouseDown: (event: ReactMouseEvent) => void
}) {
  return (
    <button
      aria-hidden="true"
      className={cn('bn-resize-handle', !shown && 'invisible')}
      data-image-resize-handle={side}
      style={side === 'left' ? { left: '4px' } : { right: '4px' }}
      tabIndex={-1}
      type="button"
      onMouseDown={onMouseDown}
    />
  )
}

function ImagePlaceholder({ fileName }: { fileName: string }) {
  return (
    <div
      className="flex h-24 w-full items-center justify-center gap-2 rounded-sm border-hairline border-border-default bg-surface-card px-3 text-sm text-text-muted"
      data-testid="image-placeholder"
      role="img"
      aria-label={fileName}
    >
      <ImageBroken aria-hidden="true" className="size-5 shrink-0" />
      <span className="truncate">{fileName}</span>
    </div>
  )
}

function ImageFigure({ block, editor }: { block: ImageBlockData; editor: ImageBlockEditor }) {
  const url = block.props.url
  const frameRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const filePanel = useExtension(FilePanelExtension)
  const editable = editor.isEditable
  const selected = useFileBlockSelected(editor, block.id)
  const hover = useHover()
  const [popupOpen, setPopupOpen] = useState(false)
  const load = useImageLoad(url)
  const failed = load.state === 'error'
  const resize = useImageResize({ block, editor, frameRef, imageRef })
  const caption = useFileBlockCaptionEdit(editor, block.id, block.props.caption)
  const frameWidth = useElementWidth(frameRef)
  const shownWidth = resize.dragWidth ?? frameWidth
  const placement = shownWidth > 0 && shownWidth < IMAGE_TOOLBAR_INSIDE_MIN_WIDTH ? 'above' : 'inside'
  const width = resize.dragWidth ?? block.props.previewWidth
  const toolbarShown = editable && !resize.resizing && (hover.hovered || selected || popupOpen)
  const handlesShown = editable && !failed && (hover.hovered || resize.resizing)
  const returnFocus = () => selectFileBlock(editor, block.id)

  return (
    <div
      className="bn-file-block-content-wrapper"
      data-image-state={load.state}
      style={{ width: width ? `${width}px` : failed ? '100%' : 'fit-content' }}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      <div className="bn-visual-media-wrapper" ref={frameRef}>
        {failed ? <ImagePlaceholder fileName={imageFileName(url, block.props.name)} /> : (
          <img
            key={load.attempt}
            ref={imageRef}
            alt={block.props.name || block.props.caption || ''}
            className="bn-visual-media"
            contentEditable={false}
            draggable={false}
            src={load.src}
            onError={load.onError}
            onLoad={load.onLoad}
          />
        )}
        <ResizeHandle shown={handlesShown} side="left" onMouseDown={resize.startResize('left')} />
        <ResizeHandle shown={handlesShown} side="right" onMouseDown={resize.startResize('right')} />
        {/* Keeps the pointer's moves on the page while resizing, over whatever the picture is. */}
        <div className={cn('absolute inset-0', !resize.resizing && 'hidden')} aria-hidden="true" />
        <ImageToolbar
          alt={block.props.name}
          placement={placement}
          previewDisabled={failed}
          remote={isRemoteImageUrl(url)}
          shown={toolbarShown}
          onAltChange={(name) => updateFileBlockProps(editor, block.id, { name })}
          onCaption={caption.start}
          onDelete={() => {
            editor.removeBlocks([block.id])
            editor.focus()
          }}
          onOpen={() => {
            if (frameRef.current) requestImageOpen(frameRef.current, { url })
            returnFocus()
          }}
          onPopupOpenChange={setPopupOpen}
          onPreview={() => {
            const image = imageRef.current
            if (!image || !frameRef.current) return
            requestImagePreview(frameRef.current, { src: image.currentSrc || image.src, alt: image.alt })
          }}
          onReplace={() => editor.transact(() => filePanel.showMenu(block.id))}
          onReturnFocus={returnFocus}
        />
      </div>
      <ImageCaption
        caption={block.props.caption}
        draft={caption.draft}
        editable={editable}
        editing={caption.editing}
        onDraftChange={caption.setDraft}
        onEnd={caption.end}
        onStart={caption.start}
      />
    </div>
  )
}

export function ImageBlock(props: ImageBlockProps) {
  const uploading = useUploadLoading(props.block.id)

  if (uploading) {
    return (
      <div className="bn-file-block-content-wrapper">
        <FileBlockLoading />
      </div>
    )
  }

  if (!props.block.props.url) {
    return (
      <div className="bn-file-block-content-wrapper w-full">
        <AddFileButton blockId={props.block.id} blockType="image" editor={props.editor} icon={<ImageIcon aria-hidden="true" />} />
      </div>
    )
  }

  return <ImageFigure block={props.block} editor={props.editor} />
}

export const ImageBlockSpec = createReactBlockSpec(
  createImageBlockConfig,
  (config) => ({
    meta: { fileBlockAccept: ['image/*'] },
    render: ImageBlock,
    parse: imageParse(config),
    toExternalHTML: ImageToExternalHTML,
    runsBefore: ['file'],
  }),
)

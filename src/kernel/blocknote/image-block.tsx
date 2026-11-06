/* eslint-disable react-refresh/only-export-components -- the block spec and its selection helper sit next to the view */
import { createImageBlockConfig, imageParse } from '@blocknote/core'
import { FilePanelExtension } from '@blocknote/core/extensions'
import {
  AddFileButton,
  createReactBlockSpec,
  ImageBlock as BlockNoteImageBlock,
  ImageToExternalHTML,
  useEditorState,
  useExtension,
  useUploadLoading,
} from '@blocknote/react'
import { Image as ImageIcon, ImageBroken } from '@phosphor-icons/react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type MouseEvent as ReactMouseEvent,
  type RefObject,
} from 'react'
import { cn } from '@/lib/cn'
import { subscribeFolderFilesChanged } from '@/lib/folder-file-changes'
import { filesystemPathFromAssetUrl, isTauriAssetUrl } from '@/kernel/markdown/vault-attachments'
import { dispatchRichEditorExternalChange } from './editor-external-change-events'
import { ImageCaption, normalizeImageCaption, type CaptionEndReason } from './image-caption'
import { isRemoteImageUrl, requestImageOpen, requestImagePreview } from './image-block-requests'
import {
  IMAGE_TOOLBAR_INSIDE_MIN_WIDTH,
  resizedImageWidth,
  storedImageWidth,
  type ImageResizeHandle,
  type ImageResizeStart,
} from './image-block-width'
import { ImageToolbar } from './image-toolbar'
import { registerOpenBlockEdit } from './open-block-edits'
import { isStaleBlockReferenceError, reportRecoveredEditorTransformError } from './rich-editor-transform-error-recovery-extension'

// Plumo's Image block, in place of BlockNote's (AIM-531): the picture centred,
// resized from both edges at once, with the Image toolbar in its corner, the
// caption typed in place under it, and a placeholder when it fails to load.
// The empty block and its Upload / Embed panel stay BlockNote's.

type ImageBlockProps = ComponentProps<typeof BlockNoteImageBlock>
type ImageBlockEditor = ImageBlockProps['editor']
type ImageBlockData = ImageBlockProps['block']
type ImageProps = Partial<Pick<ImageBlockData['props'], 'caption' | 'name' | 'previewWidth'>>
type LoadState = 'loading' | 'loaded' | 'error'

interface SelectionLike {
  node?: { attrs?: Record<string, unknown> }
  $from?: { parent?: { attrs?: Record<string, unknown> } }
}

/** Whether the selection is a node selection of this Block (its container or its content). */
export function isBlockNodeSelected(selection: unknown, blockId: string): boolean {
  const candidate = selection as SelectionLike | null
  if (!candidate?.node) return false
  return candidate.node.attrs?.id === blockId || candidate.$from?.parent?.attrs?.id === blockId
}

function updateImageProps(editor: ImageBlockEditor, blockId: string, props: ImageProps): boolean {
  try {
    if (!editor.getBlock(blockId)) return false
    editor.updateBlock(blockId, { props })
  } catch (error) {
    if (!isStaleBlockReferenceError(error)) throw error
    reportRecoveredEditorTransformError('stale_block_reference', error)
    return false
  }
  dispatchRichEditorExternalChange(editor, editor.domElement ?? undefined)
  return true
}

/** Gives the editor its focus back with the picture selected, as after a click on it. */
function selectImageBlock(editor: ImageBlockEditor, blockId: string) {
  try {
    if (!editor.getBlock(blockId)) return
    editor.setTextCursorPosition(blockId)
    editor.focus()
  } catch (error) {
    if (!isStaleBlockReferenceError(error)) throw error
  }
}

function useImageBlockSelected(editor: ImageBlockEditor, blockId: string): boolean {
  return useEditorState({
    editor,
    selector: ({ editor }) => isBlockNodeSelected(editor.prosemirrorState.selection, blockId),
  })
}

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
      if (stored !== block.props.previewWidth) updateImageProps(editor, block.id, { previewWidth: stored })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', release)
    stopRef.current = stop
  }, [block.id, block.props.previewWidth, editor, frameRef, imageRef])

  return { dragWidth, resizing: dragWidth !== null, startResize }
}

/** The caption edit: opened from the Image toolbar or by clicking the caption, written once when it ends. */
function useCaptionEdit(editor: ImageBlockEditor, block: ImageBlockData) {
  const caption = block.props.caption
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(caption)
  const editingRef = useRef(false)
  const draftRef = useRef(caption)

  const end = useCallback((reason: CaptionEndReason | 'flush') => {
    if (!editingRef.current) return
    editingRef.current = false
    setEditing(false)
    const next = normalizeImageCaption(draftRef.current)
    if (next !== caption) updateImageProps(editor, block.id, { caption: next })
    if (reason === 'key') selectImageBlock(editor, block.id)
  }, [block.id, caption, editor])

  useEffect(() => {
    if (!editing) return
    return registerOpenBlockEdit(editor, () => end('flush'))
  }, [editing, editor, end])

  return {
    draft,
    editing,
    end,
    setDraft: (next: string) => {
      draftRef.current = next
      setDraft(next)
    },
    start: () => {
      if (!editor.isEditable) return
      draftRef.current = caption
      setDraft(caption)
      editingRef.current = true
      setEditing(true)
    },
  }
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

function useHover() {
  const [hovered, setHovered] = useState(false)
  return {
    hovered,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  }
}

function ImageFigure({ block, editor }: { block: ImageBlockData; editor: ImageBlockEditor }) {
  const url = block.props.url
  const frameRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const filePanel = useExtension(FilePanelExtension)
  const editable = editor.isEditable
  const selected = useImageBlockSelected(editor, block.id)
  const hover = useHover()
  const [popupOpen, setPopupOpen] = useState(false)
  const load = useImageLoad(url)
  const failed = load.state === 'error'
  const resize = useImageResize({ block, editor, frameRef, imageRef })
  const caption = useCaptionEdit(editor, block)
  const frameWidth = useElementWidth(frameRef)
  const shownWidth = resize.dragWidth ?? frameWidth
  const placement = shownWidth > 0 && shownWidth < IMAGE_TOOLBAR_INSIDE_MIN_WIDTH ? 'above' : 'inside'
  const width = resize.dragWidth ?? block.props.previewWidth
  const toolbarShown = editable && !resize.resizing && (hover.hovered || selected || popupOpen)
  const handlesShown = editable && !failed && (hover.hovered || resize.resizing)
  const returnFocus = () => selectImageBlock(editor, block.id)

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
          onAltChange={(name) => updateImageProps(editor, block.id, { name })}
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
        <div className="bn-file-loading-preview">Loading...</div>
      </div>
    )
  }

  if (!props.block.props.url) {
    return (
      <div className="bn-file-block-content-wrapper">
        {/* BlockNote's own button types itself for the file block; any file block's props fit it. */}
        <AddFileButton {...(props as unknown as ComponentProps<typeof AddFileButton>)} buttonIcon={<ImageIcon size={24} />} />
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

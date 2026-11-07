/* eslint-disable react-refresh/only-export-components -- the block specs and their helpers sit next to the views */
import {
  audioParse,
  createAudioBlockConfig,
  createFileBlockConfig,
  createVideoBlockConfig,
  fileParse,
  videoParse,
} from '@blocknote/core'
import { FilePanelExtension } from '@blocknote/core/extensions'
import {
  AudioToExternalHTML,
  createReactBlockSpec,
  useExtension,
  useUploadLoading,
  VideoToExternalHTML,
  type ReactCustomBlockRenderProps,
} from '@blocknote/react'
import { File as FileIcon, FilmStrip, SpeakerHigh } from '@phosphor-icons/react'
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { cn } from '@/lib/cn'
import { useExternalMediaPreview } from '@/platform/media-preview-runtime'
import { AddFileButton, FileBlockLoading } from './add-file-button'
import type { BlockToolbarPlacement } from './block-toolbar'
import {
  selectFileBlock,
  updateFileBlockProps,
  useFileBlockCaptionEdit,
  useFileBlockSelected,
  useHover,
  type FileBlockEditor,
} from './file-block-edits'
import { FileBlockToolbar } from './file-block-toolbar'
import { ImageCaption } from './image-caption'
import { isRemoteImageUrl, requestImageOpen } from './image-block-requests'
import { IMAGE_MIN_WIDTH, IMAGE_TOOLBAR_INSIDE_MIN_WIDTH, type ImageResizeHandle } from './image-block-width'

// Plumo's Audio, Video and File blocks, in place of BlockNote's, laid out as
// Notion's: a video or audio player, or a file's icon and name on one line,
// the caption typed in place under it, and the File toolbar in a corner on
// hover or while the Block is selected. Before the Block has a file it is
// the empty slot that opens the File panel. A runtime which cannot preview
// external media (see platform/media-preview-runtime) shows the file's name
// instead of a player. The configs, parsers and external HTML are
// BlockNote's.

export type FileBlockKind = 'audio' | 'video' | 'file'

interface FileBlockData {
  id: string
  props: {
    caption: string
    name: string
    url: string
    previewWidth?: number
    showPreview?: boolean
    textAlignment?: string
  }
}

type FileBlockViewEditor = FileBlockEditor & {
  removeBlocks(ids: string[]): unknown
  transact<T>(run: () => T): T
}

type MediaBlockPreviewProps = {
  block: {
    props: {
      showPreview: boolean
    }
  }
}

/** The props a view renders with: no player where the runtime cannot preview external media. */
export function mediaBlockPropsForPreviewRuntime<T extends MediaBlockPreviewProps>(
  props: T,
  externalMediaPreview: boolean,
): T {
  if (!externalMediaPreview) return props

  return {
    ...props,
    block: {
      ...props.block,
      props: {
        ...props.block.props,
        showPreview: false,
      },
    },
  }
}

/** The name a File block shows: its name, else the last part of its URL. */
export function fileBlockDisplayName(name: string, url: string): string {
  if (name.trim()) return name
  const path = url.split(/[?#]/u)[0] ?? ''
  let decoded = path
  try {
    decoded = decodeURIComponent(path)
  } catch {
    // A malformed escape: the path as written.
  }
  return decoded.slice(Math.max(decoded.lastIndexOf('/'), decoded.lastIndexOf('\\')) + 1) || url
}

export interface MediaResizeStart {
  handle: ImageResizeHandle
  startWidth: number
  startX: number
}

/**
 * A video's width while a handle is dragged: a centred video moves both edges
 * (twice the pointer's travel), any other the edge that is dragged. 64px to
 * the text column, as BlockNote's.
 */
export function resizedMediaWidth(start: MediaResizeStart, x: number, column: number | undefined, centred: boolean): number {
  const travel = start.handle === 'right' ? x - start.startX : start.startX - x
  const width = start.startWidth + travel * (centred ? 2 : 1)
  const max = column && column > 0 ? column : Number.POSITIVE_INFINITY
  return Math.min(Math.max(width, IMAGE_MIN_WIDTH), Math.max(max, IMAGE_MIN_WIDTH))
}

function columnWidth(editor: FileBlockEditor): number | undefined {
  return editor.domElement?.firstElementChild?.clientWidth || undefined
}

function useVideoResize(options: {
  block: FileBlockData
  editor: FileBlockViewEditor
  frameRef: RefObject<HTMLDivElement | null>
}) {
  const { block, editor, frameRef } = options
  const [dragWidth, setDragWidth] = useState<number | null>(null)
  const stopRef = useRef<(() => void) | null>(null)

  useEffect(() => () => stopRef.current?.(), [])

  const startResize = useCallback((handle: ImageResizeHandle) => (event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    const frame = frameRef.current
    if (!frame || !editor.isEditable) return

    const start: MediaResizeStart = { handle, startWidth: frame.getBoundingClientRect().width, startX: event.clientX }
    const centred = block.props.textAlignment === 'center'
    let width = start.startWidth
    setDragWidth(width)

    const move = (moveEvent: MouseEvent) => {
      width = resizedMediaWidth(start, moveEvent.clientX, columnWidth(editor), centred)
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
      const stored = Math.round(width)
      if (stored !== block.props.previewWidth) updateFileBlockProps(editor, block.id, { previewWidth: stored })
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', release)
    stopRef.current = stop
  }, [block.id, block.props.previewWidth, block.props.textAlignment, editor, frameRef])

  return { dragWidth, resizing: dragWidth !== null, startResize }
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

function ResizeHandle({ shown, side, onMouseDown }: {
  shown: boolean
  side: ImageResizeHandle
  onMouseDown: (event: ReactMouseEvent) => void
}) {
  return (
    <button
      aria-hidden="true"
      className={cn(
        'absolute top-1/2 h-12 w-1.5 -translate-y-1/2 cursor-ew-resize rounded-full border-hairline border-white/80 bg-black/60',
        side === 'left' ? 'left-1' : 'right-1',
        !shown && 'invisible',
      )}
      data-media-resize-handle={side}
      tabIndex={-1}
      type="button"
      onMouseDown={onMouseDown}
    />
  )
}

/** A file's line, Notion's: the icon and the name on the hover fill, a click on the name opening the file. */
function FileName({ icon, name }: { icon: ReactNode; name: string }) {
  return (
    <div
      className="flex h-8 w-full min-w-0 items-center gap-1.5 rounded-sm px-1 text-foreground transition-colors duration-150 ease-out hover:bg-accent"
      contentEditable={false}
      draggable={false}
      suppressContentEditableWarning
    >
      <span className="flex shrink-0 text-muted-foreground [&_svg]:size-4.5">{icon}</span>
      <span className="min-w-0 cursor-pointer truncate" data-file-name="">
        {name}
      </span>
    </div>
  )
}

function MediaPlayer({ kind, url }: { kind: 'audio' | 'video'; url: string }) {
  if (kind === 'video') {
    return <video className="block w-full rounded-sm" contentEditable={false} controls draggable={false} src={url} />
  }
  return <audio className="block w-full" contentEditable={false} controls draggable={false} src={url} />
}

function toolbarPlacement(kind: FileBlockKind, preview: boolean, frameWidth: number): BlockToolbarPlacement {
  if (!preview) return 'end'
  if (kind === 'audio') return 'above'
  return frameWidth > 0 && frameWidth < IMAGE_TOOLBAR_INSIDE_MIN_WIDTH ? 'above' : 'inside'
}

function FileBlockFigure({ block, editor, icon, kind }: {
  block: FileBlockData
  editor: FileBlockViewEditor
  icon: ReactNode
  kind: FileBlockKind
}) {
  const url = block.props.url
  const frameRef = useRef<HTMLDivElement>(null)
  const filePanel = useExtension(FilePanelExtension)
  const editable = editor.isEditable
  const selected = useFileBlockSelected(editor, block.id)
  const hover = useHover()
  const [popupOpen, setPopupOpen] = useState(false)
  const caption = useFileBlockCaptionEdit(editor, block.id, block.props.caption)
  const preview = kind !== 'file' && block.props.showPreview !== false
  const resizable = kind === 'video' && preview
  const resize = useVideoResize({ block, editor, frameRef })
  const frameWidth = useElementWidth(frameRef)
  const width = resizable ? resize.dragWidth ?? block.props.previewWidth : undefined
  const toolbarShown = editable && !resize.resizing && (hover.hovered || selected || popupOpen)
  const handlesShown = editable && resizable && (hover.hovered || resize.resizing)
  const returnFocus = () => selectFileBlock(editor, block.id)

  return (
    <div
      className={cn(
        'relative flex max-w-full flex-col outline-none! select-none **:select-none',
        resizable ? '' : 'w-full',
      )}
      data-file-block-view={kind}
      style={resizable ? { width: width ? `${width}px` : 'fit-content' } : undefined}
      onMouseEnter={hover.onMouseEnter}
      onMouseLeave={hover.onMouseLeave}
    >
      <div className="relative flex max-w-full items-center" data-file-block-frame="" ref={frameRef}>
        {preview
          ? <MediaPlayer kind={kind === 'audio' ? 'audio' : 'video'} url={url} />
          : <FileName icon={icon} name={fileBlockDisplayName(block.props.name, url)} />}
        {resizable && (
          <>
            <ResizeHandle shown={handlesShown} side="left" onMouseDown={resize.startResize('left')} />
            <ResizeHandle shown={handlesShown} side="right" onMouseDown={resize.startResize('right')} />
            {/* Keeps the pointer's moves on the page while resizing, over whatever the player is. */}
            <div className={cn('absolute inset-0', !resize.resizing && 'hidden')} aria-hidden="true" />
          </>
        )}
        {/* A selected Block takes the block selection's tint, as a selected Image block does. */}
        <div
          aria-hidden="true"
          className={cn(
            'pointer-events-none absolute inset-0 rounded-sm bg-[color-mix(in_srgb,var(--selection)_var(--_block-selection-mix),transparent)]',
            !selected && 'hidden',
          )}
          data-file-block-selection=""
        />
        <FileBlockToolbar
          blockType={kind}
          name={block.props.name}
          placement={toolbarPlacement(kind, preview, resize.dragWidth ?? frameWidth)}
          previewShown={kind === 'file' ? undefined : preview}
          remote={isRemoteImageUrl(url)}
          shown={toolbarShown}
          onCaption={caption.start}
          onDelete={() => {
            editor.removeBlocks([block.id])
            editor.focus()
          }}
          onOpen={() => {
            // The same request the Image toolbar sends: the surface opens the file through the Folder.
            if (frameRef.current) requestImageOpen(frameRef.current, { url })
            returnFocus()
          }}
          onPopupOpenChange={setPopupOpen}
          onRename={(name) => updateFileBlockProps(editor, block.id, { name })}
          onReplace={() => editor.transact(() => filePanel.showMenu(block.id))}
          onReturnFocus={returnFocus}
          onTogglePreview={() => {
            updateFileBlockProps(editor, block.id, { showPreview: !preview })
            returnFocus()
          }}
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

/** Any of the three: the loading line while a file goes in, the empty slot, or the file. */
export function FileBlockView({ block, editor, icon, kind }: {
  block: FileBlockData
  editor: FileBlockViewEditor
  icon: ReactNode
  kind: FileBlockKind
}) {
  const uploading = useUploadLoading(block.id)
  if (!uploading && block.props.url) return <FileBlockFigure block={block} editor={editor} icon={icon} kind={kind} />
  // Selected, the slot takes its own darker fill in place of BlockNote's outline.
  return (
    <div className="w-full outline-none!">
      {uploading
        ? <FileBlockLoading />
        : <AddFileButton blockId={block.id} blockType={kind} editor={editor} icon={icon} />}
    </div>
  )
}

type AudioBlockProps = Omit<ReactCustomBlockRenderProps<'audio', ReturnType<typeof createAudioBlockConfig>['propSchema'], 'none'>, 'contentRef'>
type VideoBlockProps = Omit<ReactCustomBlockRenderProps<'video', ReturnType<typeof createVideoBlockConfig>['propSchema'], 'none'>, 'contentRef'>
type FileBlockProps = Omit<ReactCustomBlockRenderProps<'file', ReturnType<typeof createFileBlockConfig>['propSchema'], 'none'>, 'contentRef'>

export function AudioBlock(props: AudioBlockProps) {
  const externalMediaPreview = useExternalMediaPreview()
  const { block } = mediaBlockPropsForPreviewRuntime(props, externalMediaPreview)
  return <FileBlockView block={block} editor={props.editor} icon={<SpeakerHigh aria-hidden="true" />} kind="audio" />
}

export function VideoBlock(props: VideoBlockProps) {
  const externalMediaPreview = useExternalMediaPreview()
  const { block } = mediaBlockPropsForPreviewRuntime(props, externalMediaPreview)
  return <FileBlockView block={block} editor={props.editor} icon={<FilmStrip aria-hidden="true" />} kind="video" />
}

export function FileBlock(props: FileBlockProps) {
  return <FileBlockView block={props.block} editor={props.editor} icon={<FileIcon aria-hidden="true" />} kind="file" />
}

/** A File block in exported HTML, as BlockNote writes it: the link, and the caption under it. */
function FileToExternalHTML({ block }: Pick<FileBlockProps, 'block'>) {
  if (!block.props.url) return <p>Add file</p>
  const link = <a href={block.props.url}>{block.props.name || block.props.url}</a>
  if (!block.props.caption) return link
  return (
    <div>
      {link}
      <p>{block.props.caption}</p>
    </div>
  )
}

export const AudioBlockSpec = createReactBlockSpec(
  createAudioBlockConfig,
  (config) => ({
    render: AudioBlock,
    parse: audioParse(config),
    toExternalHTML: AudioToExternalHTML,
    runsBefore: ['file'],
  }),
)

export const VideoBlockSpec = createReactBlockSpec(
  createVideoBlockConfig,
  (config) => ({
    render: VideoBlock,
    parse: videoParse(config),
    toExternalHTML: VideoToExternalHTML,
    runsBefore: ['file'],
  }),
)

export const FileBlockSpec = createReactBlockSpec(createFileBlockConfig, {
  meta: { fileBlockAccept: ['*/*'] },
  render: FileBlock,
  parse: fileParse(),
  toExternalHTML: FileToExternalHTML,
})

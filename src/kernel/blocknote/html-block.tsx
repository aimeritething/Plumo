import { createReactBlockSpec } from '@blocknote/react'
import {
  ArrowsClockwise,
  ArrowsOutLineVertical,
  Code,
  Copy,
} from '@phosphor-icons/react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject, SyntheticEvent } from 'react'
import { APP_COMMAND_EVENT_NAME, APP_COMMAND_IDS } from '@/shell/app-command-dispatcher'
import { translate } from '@/lib/i18n'
import { trackEvent } from '@/lib/telemetry'
import { writeClipboardText } from '@/platform/clipboard-text'
import {
  clampHtmlBlockHeight as clampBlockHeight,
  HTML_BLOCK_DEFAULT_HEIGHT as BLOCK_DEFAULT_HEIGHT,
  HTML_BLOCK_TYPE as BLOCK_TYPE,
  normalizeHtmlBlockHeight as normalizeBlockHeight,
  normalizeHtmlBlockScripts as normalizeBlockScripts,
  type HtmlBlockScripts,
} from '@/kernel/markdown/html-block-markdown'
import { htmlBlockPreview } from './html-block-sandbox'
import { dispatchRichEditorExternalChange } from './editor-external-change-events'
import { readFencedPreElement } from './fenced-pre-element'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { FloatingIconGroup } from './floating-icon-group'

export const HTML_BLOCK_CONFIG = {
  type: BLOCK_TYPE,
  propSchema: {
    height: { default: '320' },
    html: { default: '' },
    scripts: { default: 'blocked' },
  },
  content: 'none',
} as const

export interface HtmlBlockProps {
  height: string
  html: string
  scripts: HtmlBlockScripts
}

export interface HtmlBlockEditor {
  domElement?: EventTarget | null
  focus?: () => void
  getBlock: (blockId: string) => unknown
  updateBlock: (blockId: string, update: HtmlBlockUpdate) => unknown
}

interface HtmlBlockUpdate {
  props: HtmlBlockProps
  type: typeof BLOCK_TYPE
}

interface HtmlBlockViewProps {
  block: {
    id: string
    props: Omit<HtmlBlockProps, 'scripts'> & { scripts: unknown }
  }
  editor: HtmlBlockEditor
}

interface LiveHtmlBlock {
  id: string
  props: HtmlBlockProps
}

type HeightChangeSource = 'keyboard' | 'pointer' | 'reset'

const HEIGHT_KEYBOARD_STEP = 24
const HEIGHT_KEYBOARD_LARGE_STEP = 96
const HTML_BLOCK_SANDBOX_ATTRIBUTE = 'allow-popups allow-popups-to-escape-sandbox'

function stopHtmlBlockEvent(event: SyntheticEvent): void {
  event.stopPropagation()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function htmlBlockProps(value: unknown): HtmlBlockProps | null {
  if (!isRecord(value) || typeof value.html !== 'string') return null
  return {
    height: normalizeBlockHeight(value.height),
    html: value.html,
    scripts: normalizeBlockScripts(value.scripts),
  }
}

function isLiveHtmlBlockRecord(value: unknown): value is Record<string, unknown> & { id: string } {
  return isRecord(value) && value.type === BLOCK_TYPE && typeof value.id === 'string'
}

function liveHtmlBlock(value: unknown): LiveHtmlBlock | null {
  if (!isLiveHtmlBlockRecord(value)) return null

  const props = htmlBlockProps(value.props)
  return props ? { id: value.id, props } : null
}

function isMissingBlockError(error: unknown): error is Error {
  return error instanceof Error
    && error.message.includes('Block with ID')
    && error.message.includes('not found')
}

function warnStaleHtmlBlockUpdate(error: Error): void {
  console.warn('[editor] Ignored stale HTML block update:', error)
}

function getLiveHtmlBlock(editor: HtmlBlockEditor, blockId: string): LiveHtmlBlock | null {
  try {
    return liveHtmlBlock(editor.getBlock(blockId))
  } catch (error) {
    if (!isMissingBlockError(error)) throw error

    warnStaleHtmlBlockUpdate(error)
    return null
  }
}

function updateHtmlBlockPropsSafely(
  editor: HtmlBlockEditor,
  blockId: string,
  nextProps: (props: HtmlBlockProps) => HtmlBlockProps,
): boolean {
  const liveBlock = getLiveHtmlBlock(editor, blockId)
  if (!liveBlock) return false

  try {
    editor.updateBlock(liveBlock.id, {
      props: nextProps(liveBlock.props),
      type: 'htmlBlock',
    })
    return true
  } catch (error) {
    if (!isMissingBlockError(error)) throw error

    warnStaleHtmlBlockUpdate(error)
    return false
  }
}

function dispatchEditorChange(editor: HtmlBlockEditor): void {
  dispatchRichEditorExternalChange(editor, editor.domElement ?? undefined)
}

function t(key: Parameters<typeof translate>[1]): string {
  return translate('en', key)
}

function openRawEditorForHtmlSource(event: SyntheticEvent): void {
  event.preventDefault()
  event.stopPropagation()
  window.dispatchEvent(new CustomEvent(APP_COMMAND_EVENT_NAME, {
    detail: APP_COMMAND_IDS.editToggleRawEditor,
  }))
}

function heightFromKeyboard(currentHeight: string, key: string): string | null {
  const current = Number.parseInt(normalizeBlockHeight(currentHeight), 10)
  if (key === 'ArrowUp') return clampBlockHeight(current - HEIGHT_KEYBOARD_STEP)
  if (key === 'ArrowDown') return clampBlockHeight(current + HEIGHT_KEYBOARD_STEP)
  if (key === 'PageUp') return clampBlockHeight(current - HEIGHT_KEYBOARD_LARGE_STEP)
  if (key === 'PageDown') return clampBlockHeight(current + HEIGHT_KEYBOARD_LARGE_STEP)
  if (key === 'Home') return clampBlockHeight(Number.parseInt(BLOCK_DEFAULT_HEIGHT, 10))
  return null
}

function restoreHtmlPreviewFocus(editor: HtmlBlockEditor, frame: HTMLIFrameElement): void {
  frame.blur()
  editor.focus?.()
}

function useHtmlBlockFrameFocus(editor: HtmlBlockEditor) {
  const frameRef = useRef<HTMLIFrameElement | null>(null)
  const releasePreviewFocus = useCallback((frame = frameRef.current) => {
    if (!frame) return
    restoreHtmlPreviewFocus(editor, frame)
  }, [editor])

  useEffect(() => {
    const releaseFocusedFrame = () => {
      if (document.activeElement === frameRef.current) releasePreviewFocus()
    }

    window.addEventListener('blur', releaseFocusedFrame)
    return () => window.removeEventListener('blur', releaseFocusedFrame)
  }, [releasePreviewFocus])

  const handlePreviewFocus = (event: SyntheticEvent<HTMLIFrameElement>) => {
    event.stopPropagation()
    releasePreviewFocus(event.currentTarget)
  }
  const handlePreviewLoad = (event: SyntheticEvent<HTMLIFrameElement>) => {
    if (document.activeElement === event.currentTarget) releasePreviewFocus(event.currentTarget)
  }
  return { frameRef, handlePreviewFocus, handlePreviewLoad }
}

function useHtmlBlockHeight(block: HtmlBlockViewProps['block'], editor: HtmlBlockEditor, currentHeight: string) {
  const [resizingHeight, setResizingHeight] = useState<string | null>(null)
  const displayHeight = resizingHeight ?? currentHeight
  const updateHeight = useCallback((height: string, source: HeightChangeSource) => {
    const updated = updateHtmlBlockPropsSafely(editor, block.id, props => ({
      ...props,
      height,
    }))
    if (!updated) return

    dispatchEditorChange(editor)
    trackEvent('editor_html_block_height_changed', { height: Number.parseInt(height, 10), source })
  }, [block.id, editor])

  const resetHeight = (event: SyntheticEvent) => {
    event.preventDefault()
    event.stopPropagation()
    updateHeight(BLOCK_DEFAULT_HEIGHT, 'reset')
  }

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()

    const startHeight = Number.parseInt(displayHeight, 10)
    const startY = event.clientY

    const onPointerMove = (moveEvent: PointerEvent) => {
      setResizingHeight(clampBlockHeight(startHeight + moveEvent.clientY - startY))
    }

    const onPointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)
      setResizingHeight(null)
      updateHeight(clampBlockHeight(startHeight + upEvent.clientY - startY), 'pointer')
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
  }

  const handleResizeKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const nextHeight = heightFromKeyboard(displayHeight, event.key)
    if (nextHeight === null) return

    event.preventDefault()
    event.stopPropagation()
    updateHeight(nextHeight, 'keyboard')
  }
  return { displayHeight, handleResizeKeyDown, resetHeight, startResize }
}

function useHtmlBlockSourceCopy(currentMarkup: string) {
  return (event: SyntheticEvent) => {
    event.preventDefault()
    event.stopPropagation()
    void writeClipboardText(currentMarkup)
      .then(() => trackEvent('editor_html_block_source_copied', { outcome: 'success' }))
      .catch((error) => {
        console.warn('[editor] Failed to copy HTML block source:', error)
        trackEvent('editor_html_block_source_copied', { outcome: 'failed' })
      })
  }
}

interface HtmlBlockToolbarProps {
  copySource: (event: SyntheticEvent) => void
  resetHeight: (event: SyntheticEvent) => void
}

/** A block control's tooltip: below the toolbar's buttons, left of the resize handle in the bottom corner. */
function HtmlBlockTooltip({ label, side = 'bottom', children }: { label: string; side?: 'bottom' | 'left'; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </Tooltip>
  )
}

function HtmlBlockToolbar({ copySource, resetHeight }: HtmlBlockToolbarProps) {
  return (
    <FloatingIconGroup
      className="absolute top-2 right-2 z-raised opacity-0 transition-opacity duration-150 ease-out group-focus-within:opacity-100 group-hover:opacity-100"
      aria-label={t('editor.htmlBlock.toolbar')}
      role="toolbar"
    >
      <HtmlBlockTooltip label={t('editor.htmlBlock.copySource')}>
        <Button aria-label={t('editor.htmlBlock.copySource')} onClick={copySource}
          onMouseDown={stopHtmlBlockEvent} size="icon-xs" type="button" variant="icon">
          <Copy aria-hidden="true" />
        </Button>
      </HtmlBlockTooltip>
      <HtmlBlockTooltip label={t('editor.htmlBlock.openRawEditor')}>
        <Button aria-label={t('editor.htmlBlock.openRawEditor')}
          onClick={openRawEditorForHtmlSource} onMouseDown={stopHtmlBlockEvent} size="icon-xs" type="button" variant="icon">
          <Code aria-hidden="true" />
        </Button>
      </HtmlBlockTooltip>
      <HtmlBlockTooltip label={t('editor.htmlBlock.resetHeight')}>
        <Button aria-label={t('editor.htmlBlock.resetHeight')} onClick={resetHeight}
          onMouseDown={stopHtmlBlockEvent} size="icon-xs" type="button" variant="icon">
          <ArrowsClockwise aria-hidden="true" />
        </Button>
      </HtmlBlockTooltip>
    </FloatingIconGroup>
  )
}

interface HtmlBlockContentProps {
  blocked: boolean
  frameRef: RefObject<HTMLIFrameElement | null>
  onFocus: (event: SyntheticEvent<HTMLIFrameElement>) => void
  onLoad: (event: SyntheticEvent<HTMLIFrameElement>) => void
  srcDoc: string
}

function HtmlBlockContent({ blocked, frameRef, onFocus, onLoad, srcDoc }: HtmlBlockContentProps) {
  if (!blocked) {
    return <iframe className="block h-full w-full border-0 bg-[Canvas]" onFocus={onFocus} onLoad={onLoad} referrerPolicy="no-referrer"
      ref={frameRef} sandbox={HTML_BLOCK_SANDBOX_ATTRIBUTE} srcDoc={srcDoc}
      tabIndex={-1} title={t('editor.htmlBlock.previewTitle')} />
  }
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-text-secondary" role="alert">
      <span>{t('editor.htmlBlock.blockedFallback')}</span>
      <Button onClick={openRawEditorForHtmlSource} onMouseDown={stopHtmlBlockEvent} type="button" variant="outline" size="sm">
        <Code aria-hidden="true" />
        {t('editor.htmlBlock.openRawEditor')}
      </Button>
    </div>
  )
}

function HtmlBlockResizeHandle({ onKeyDown, onPointerDown }: {
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  return (
    <FloatingIconGroup className="absolute right-1.5 bottom-1.5 z-raised opacity-0 group-focus-within:opacity-100 group-hover:opacity-100">
      <HtmlBlockTooltip label={t('editor.htmlBlock.resizeHeight')} side="left">
        <Button aria-label={t('editor.htmlBlock.resizeHeight')} className="cursor-ns-resize"
          onKeyDown={onKeyDown} onMouseDown={stopHtmlBlockEvent} onPointerDown={onPointerDown}
          size="icon-xs" type="button" variant="icon">
          <ArrowsOutLineVertical aria-hidden="true" />
        </Button>
      </HtmlBlockTooltip>
    </FloatingIconGroup>
  )
}

export function HtmlBlock({ block, editor }: HtmlBlockViewProps) {
  const currentMarkup = Reflect.get(block.props, 'html') as string
  const currentHeight = normalizeBlockHeight(block.props.height)
  const preview = useMemo(() => htmlBlockPreview(currentMarkup), [currentMarkup])
  const blocked = currentMarkup.trim().length > 0 && preview.sanitizedHtml.trim().length === 0
  const focus = useHtmlBlockFrameFocus(editor)
  const height = useHtmlBlockHeight(block, editor, currentHeight)
  const copySource = useHtmlBlockSourceCopy(currentMarkup)

  return (
    <section
      className="group relative min-h-45 w-full overflow-hidden rounded-lg border-hairline border-transparent bg-surface-card transition-colors duration-150 ease-out hover:border-border-default"
      contentEditable={false} data-html-block aria-label={t('editor.htmlBlock.previewTitle')}
      onMouseDown={stopHtmlBlockEvent} onPointerDown={stopHtmlBlockEvent} style={{ height: `${height.displayHeight}px` }}
      suppressContentEditableWarning>
      <HtmlBlockToolbar copySource={copySource} resetHeight={height.resetHeight} />
      <HtmlBlockContent blocked={blocked} frameRef={focus.frameRef} onFocus={focus.handlePreviewFocus}
        onLoad={focus.handlePreviewLoad} srcDoc={preview.srcDoc} />
      <HtmlBlockResizeHandle onKeyDown={height.handleResizeKeyDown} onPointerDown={height.startResize} />
    </section>
  )
}

function readHtmlPreElement(element: HTMLElement): { height: string; html: string } | undefined {
  const html = readFencedPreElement(element, 'html')
  if (html === undefined) return undefined

  return {
    height: BLOCK_DEFAULT_HEIGHT,
    html,
  }
}

export const HtmlBlockSpec = createReactBlockSpec(
  HTML_BLOCK_CONFIG,
  {
    runsBefore: ['codeBlock'],
    meta: { selectable: false },
    parse: readHtmlPreElement,
    render: (props) => (
      <HtmlBlock block={props.block} editor={props.editor} />
    ),
  },
)

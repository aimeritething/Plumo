import { memo, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent } from 'react'
import { getAssetUrlsByImport } from '@tldraw/assets/imports.vite'
import { useBlockNoteContext } from '@blocknote/react'
import { ArrowsIn, ArrowsOut } from '@phosphor-icons/react'
import {
  Box,
  Tldraw,
  createTLStore,
  defaultUserPreferences,
  loadSnapshot,
  useDialogs,
  useTldrawUser,
  useValue,
  type Editor,
  type TLEventInfo,
  type TLUiDialog,
  type TLStoreSnapshot,
  type TLUserPreferences,
} from 'tldraw'
import { resolveEffectiveLocale, translate, type AppLocale } from '@/lib/i18n'
import {
  isWhiteboardPlatformPermissionRejection,
  retainWhiteboardPlatformPermissionGuard,
} from './whiteboard-platform-permission-rejection'
import { Button } from '@/ui/button'
import { FloatingIconGroup } from './floating-icon-group'
import { Dialog } from '@/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { installTldrawTextMeasurementGuard } from './tldraw-text-measurement-guard'

const EMPTY_TLDRAW_TRANSLATION_URL = 'data:application/json;base64,e30K'
const TLDRAW_USER_ID = 'plumo-whiteboard'

// The three resize handles: bare buttons at the board's edges, gone in fullscreen.
const RESIZE_HANDLE_CLASS = 'absolute z-raised touch-none border-0 bg-transparent p-0 group-data-fullscreen:hidden'

function resolveTldrawAssetUrl(assetUrl: string | undefined): string {
  return assetUrl ?? EMPTY_TLDRAW_TRANSLATION_URL
}

const tldrawAssetUrls = getAssetUrlsByImport(resolveTldrawAssetUrl)

interface TldrawWhiteboardProps {
  boardId: string
  height: string
  snapshot: string
  width: string
  onSnapshotChange: (snapshot: string) => void
  onSizeChange: (size: TldrawWhiteboardSize) => void
}

interface TldrawWhiteboardSize {
  height: string
  width: string
}

interface PixelSize {
  height: number
  width: number | null
}

interface ResizeStart {
  height: number
  pointerX: number
  pointerY: number
  width: number
}

type ResizeMode = 'height' | 'width' | 'both'

function resizeModeFromHandle(handle: HTMLButtonElement): ResizeMode {
  const mode = handle.dataset.resizeMode
  if (mode === 'height' || mode === 'width') return mode
  return 'both'
}

const DEFAULT_HEIGHT = 520
const MIN_HEIGHT = 260
const MIN_WIDTH = 360
const TLDRAW_UI_ICON_SELECTOR = '.tlui-icon'
const WEBKIT_MASK_PROPERTY = '-webkit-mask'

function parsePixelValue(value: string, fallback: number): number {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

function normalizeSize({ height, width }: TldrawWhiteboardSize): PixelSize {
  return {
    height: parsePixelValue(height, DEFAULT_HEIGHT),
    width: width ? parsePixelValue(width, MIN_WIDTH) : null,
  }
}

function sizeToProps({ height, width }: PixelSize): TldrawWhiteboardSize {
  return {
    height: String(Math.max(MIN_HEIGHT, Math.round(height))),
    width: width === null ? '' : String(Math.max(MIN_WIDTH, Math.round(width))),
  }
}

function cssSize({ height, width }: PixelSize): CSSProperties {
  return {
    '--whiteboard-height': `${Math.max(MIN_HEIGHT, height)}px`,
    '--whiteboard-width': width === null ? '100%' : `${Math.max(MIN_WIDTH, width)}px`,
  } as CSSProperties
}

function tldrawUserPreferences(colorScheme: 'light' | 'dark'): TLUserPreferences {
  return {
    ...defaultUserPreferences,
    id: TLDRAW_USER_ID,
    colorScheme,
  }
}

function ignoreTldrawUserPreferencesUpdate(preferences: TLUserPreferences) {
  void preferences
}

function readDocumentLocale(): AppLocale {
  if (typeof document === 'undefined') return 'en'
  return resolveEffectiveLocale(document.documentElement.lang)
}

function useDocumentLocale(): AppLocale {
  const [locale, setLocale] = useState(readDocumentLocale)

  useEffect(() => {
    if (typeof document === 'undefined') return

    const syncLocale = () => setLocale(readDocumentLocale())
    const observer = new MutationObserver(syncLocale)
    observer.observe(document.documentElement, { attributeFilter: ['lang'], attributes: true })
    syncLocale()

    return () => observer.disconnect()
  }, [])

  return locale
}

interface WhiteboardRuntimeGuardOptions {
  onPlatformPermissionDenied: () => void
}

function installTldrawPlatformPermissionGuard({ onPlatformPermissionDenied }: WhiteboardRuntimeGuardOptions): () => void {
  const releaseWhiteboardPermissionGuard = retainWhiteboardPlatformPermissionGuard()
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (!isWhiteboardPlatformPermissionRejection(event.reason)) return
    event.preventDefault()
    onPlatformPermissionDenied()
  }

  // Sentry installs its global rejection handler during app startup, before tldraw mounts.
  window.addEventListener('unhandledrejection', handleUnhandledRejection, true)
  return () => {
    window.removeEventListener('unhandledrejection', handleUnhandledRejection, true)
    releaseWhiteboardPermissionGuard()
  }
}

function parseSnapshot(source: string): TLStoreSnapshot | null {
  if (!source.trim()) return null

  try {
    return JSON.parse(source) as TLStoreSnapshot
  } catch {
    return null
  }
}

function createBoardStore(boardId: string) {
  void boardId
  return createTLStore({ onMount: installTldrawTextMeasurementGuard })
}

function serializeSnapshot(snapshot: TLStoreSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

function getDocumentSnapshot(store: ReturnType<typeof createTLStore>): TLStoreSnapshot {
  return store.getStoreSnapshot()
}

function documentZoom(): number {
  const inlineZoom = document.documentElement.style.getPropertyValue('zoom')
  const computedZoom = getComputedStyle(document.documentElement).zoom
  const zoom = inlineZoom || computedZoom
  const parsed = Number.parseFloat(zoom)
  if (!Number.isFinite(parsed) || parsed <= 0) return 1
  return zoom.endsWith('%') ? parsed / 100 : parsed
}

function viewportBounds(screenBounds: Box | HTMLElement): Box | HTMLElement {
  if (screenBounds instanceof Box) return screenBounds

  const zoom = documentZoom()
  if (zoom === 1) return screenBounds

  const rect = screenBounds.getBoundingClientRect()
  return new Box(
    (rect.left || rect.x) / zoom,
    (rect.top || rect.y) / zoom,
    Math.max(rect.width / zoom, 1),
    Math.max(rect.height / zoom, 1),
  )
}

function zoomAdjustedPoint<T extends { x: number; y: number; z?: number }>(point: T, zoom: number): T {
  return {
    ...point,
    x: point.x / zoom,
    y: point.y / zoom,
  }
}

function zoomAdjustedEvent(info: TLEventInfo): TLEventInfo {
  const zoom = documentZoom()
  if (zoom === 1) return info

  switch (info.type) {
    case 'click':
    case 'pinch':
    case 'pointer':
    case 'wheel':
      return {
        ...info,
        point: zoomAdjustedPoint(info.point, zoom),
      } as TLEventInfo
    default:
      return info
  }
}

function installZoomAwareViewport(editor: Editor): () => void {
  const updateViewportScreenBounds = editor.updateViewportScreenBounds.bind(editor)
  const updateViewport: Editor['updateViewportScreenBounds'] = (screenBounds, center) =>
    updateViewportScreenBounds(viewportBounds(screenBounds), center)
  const dispatch = editor.dispatch.bind(editor)
  const animationFrameIds: number[] = []
  const timeoutIds: number[] = []

  editor.updateViewportScreenBounds = updateViewport
  editor.dispatch = (info: TLEventInfo) => dispatch(zoomAdjustedEvent(info))

  const updateCurrentCanvas = () => {
    const canvas = editor.getContainer().querySelector<HTMLElement>('.tl-canvas')
    if (canvas) updateViewport(canvas)
  }

  const scheduleViewportUpdate = () => {
    updateCurrentCanvas()
    animationFrameIds.push(window.requestAnimationFrame(updateCurrentCanvas))
    timeoutIds.push(window.setTimeout(updateCurrentCanvas, 150))
  }

  scheduleViewportUpdate()

  return () => {
    animationFrameIds.forEach((id) => {
      window.cancelAnimationFrame(id)
    })
    timeoutIds.forEach((id) => {
      window.clearTimeout(id)
    })
    editor.updateViewportScreenBounds = updateViewportScreenBounds
    editor.dispatch = dispatch
  }
}

function syncTldrawIconWebkitMask(icon: HTMLElement): void {
  const mask = icon.style.getPropertyValue('mask').trim()
  if (!mask) {
    icon.style.removeProperty(WEBKIT_MASK_PROPERTY)
    return
  }

  if (icon.style.getPropertyValue(WEBKIT_MASK_PROPERTY).trim() === mask) return
  icon.style.setProperty(WEBKIT_MASK_PROPERTY, mask)
}

function syncTldrawIconWebkitMasks(root: HTMLElement): void {
  if (root.matches(TLDRAW_UI_ICON_SELECTOR)) {
    syncTldrawIconWebkitMask(root)
  }

  for (const icon of root.querySelectorAll<HTMLElement>(TLDRAW_UI_ICON_SELECTOR)) {
    syncTldrawIconWebkitMask(icon)
  }
}

function syncAddedTldrawIconMasks(node: Node): void {
  if (!(node instanceof HTMLElement)) return
  syncTldrawIconWebkitMasks(node)
}

function installTldrawWebkitIconMaskBridge(container: HTMLElement): () => void {
  syncTldrawIconWebkitMasks(container)

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes' && mutation.target instanceof HTMLElement) {
        syncTldrawIconWebkitMasks(mutation.target)
        continue
      }

      mutation.addedNodes.forEach(syncAddedTldrawIconMasks)
    }
  })

  observer.observe(container, {
    attributeFilter: ['class', 'style'],
    attributes: true,
    childList: true,
    subtree: true,
  })

  return () => {
    observer.disconnect()
  }
}

function installWhiteboardRuntimeGuards(editor: Editor, options: WhiteboardRuntimeGuardOptions): () => void {
  const cleanupZoomAwareViewport = installZoomAwareViewport(editor)
  const cleanupWebkitIconMaskBridge = installTldrawWebkitIconMaskBridge(editor.getContainer())
  const cleanupPlatformPermissionGuard = installTldrawPlatformPermissionGuard(options)

  return () => {
    cleanupPlatformPermissionGuard()
    cleanupWebkitIconMaskBridge()
    cleanupZoomAwareViewport()
  }
}

interface TldrawDialogProps {
  dialog: TLUiDialog
  onClose: (id: string) => void
}

const DIALOG_OPEN_DISMISS_GRACE_MS = 250
let retainedTldrawDialogs: TLUiDialog[] = []

function useDeferredDialogOpen() {
  const openedAtRef = useRef(0)
  const [readyToOpen, setReadyToOpen] = useState(false)

  useEffect(() => {
    const animationFrameId = window.requestAnimationFrame(() => {
      openedAtRef.current = performance.now()
      setReadyToOpen(true)
    })
    return () => { window.cancelAnimationFrame(animationFrameId) }
  }, [])

  return { openedAtRef, readyToOpen }
}

function canDismissDialog(openedAt: number): boolean {
  return performance.now() - openedAt >= DIALOG_OPEN_DISMISS_GRACE_MS
}

function isOverlayEvent(event: { currentTarget: EventTarget | null; target: EventTarget | null }): boolean {
  return event.target === event.currentTarget
}

function shouldCloseFromOverlayClick(
  event: { currentTarget: EventTarget | null; target: EventTarget | null },
  dialog: TLUiDialog,
  mouseDownInsideContent: boolean
): boolean {
  return isOverlayEvent(event) && !dialog.preventBackgroundClose && !mouseDownInsideContent
}

interface TldrawDialogContentProps {
  dialog: TLUiDialog
  mouseDownInsideContentRef: MutableRefObject<boolean>
  onClose: () => void
}

function TldrawDialogContent({
  dialog,
  mouseDownInsideContentRef,
  onClose,
}: TldrawDialogContentProps) {
  const ModalContent = dialog.component
  const handleClose = () => {
    mouseDownInsideContentRef.current = false
    onClose()
  }

  return (
    <div
      dir="ltr"
      className="tlui-dialog__content"
      aria-describedby={undefined}
      role="dialog"
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        mouseDownInsideContentRef.current = false
        onClose()
      }}
      onMouseDown={() => { mouseDownInsideContentRef.current = true }}
      onMouseUp={() => { mouseDownInsideContentRef.current = false }}
    >
      <ModalContent onClose={handleClose} />
    </div>
  )
}

const TldrawDialog = memo(function TldrawDialog({ dialog, onClose }: TldrawDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const mouseDownInsideContentRef = useRef(false)
  const { openedAtRef, readyToOpen } = useDeferredDialogOpen()

  const closeDialogFromBackground = useCallback(() => {
    if (!canDismissDialog(openedAtRef.current)) return
    onClose(dialog.id)
  }, [dialog.id, onClose, openedAtRef])
  const closeDialogNow = useCallback(() => { onClose(dialog.id) }, [dialog.id, onClose])
  const handleOpenChange = useCallback((isOpen: boolean) => {
    if (!isOpen) closeDialogNow()
  }, [closeDialogNow])
  useEffect(() => {
    const overlay = overlayRef.current
    if (!overlay) return

    const handleMouseDown = (event: MouseEvent) => {
      if (event.target === overlay) mouseDownInsideContentRef.current = false
    }
    const handleClick = (event: MouseEvent) => {
      if (shouldCloseFromOverlayClick({ currentTarget: overlay, target: event.target }, dialog, mouseDownInsideContentRef.current)) {
        closeDialogFromBackground()
      }
    }

    overlay.addEventListener('mousedown', handleMouseDown)
    overlay.addEventListener('click', handleClick)
    return () => {
      overlay.removeEventListener('mousedown', handleMouseDown)
      overlay.removeEventListener('click', handleClick)
    }
  }, [closeDialogFromBackground, dialog])

  if (!readyToOpen) return null

  // The overlay and the panel stay tldraw's own DOM inside its container: its
  // --tl-* variables live on .tl-container, and a panel portaled to the body
  // (ui/dialog's DialogContent) would lose them.
  return (
    <Dialog open onOpenChange={handleOpenChange}>
      <div
        ref={overlayRef}
        dir="ltr"
        className="tlui-dialog__overlay"
      >
        <TldrawDialogContent
          dialog={dialog}
          mouseDownInsideContentRef={mouseDownInsideContentRef}
          onClose={closeDialogNow}
        />
      </div>
    </Dialog>
  )
})

function TldrawDialogs() {
  const { dialogs, removeDialog } = useDialogs()
  const requestedDialogs = useValue('tldraw dialogs', () => dialogs.get(), [dialogs])
  const [visibleDialogs, setVisibleDialogs] = useState<TLUiDialog[]>(() =>
    retainedTldrawDialogs.length > 0 ? retainedTldrawDialogs : dialogs.get()
  )

  const closeVisibleDialog = useCallback((id: string) => {
    const nextDialogs = retainedTldrawDialogs.filter((dialog) => dialog.id !== id)
    retainedTldrawDialogs = nextDialogs
    setVisibleDialogs(nextDialogs)
    removeDialog(id)
  }, [removeDialog])

  useEffect(() => {
    if (requestedDialogs.length === 0) return
    // tldraw clears the dialog atom while Radix closes the menu; keep the last requested dialog mounted locally.
    retainedTldrawDialogs = requestedDialogs
    queueMicrotask(() => {
      setVisibleDialogs(requestedDialogs)
    })
  }, [requestedDialogs])

  return visibleDialogs.map((dialog) => (
    <TldrawDialog
      key={dialog.id}
      dialog={dialog}
      onClose={closeVisibleDialog}
    />
  ))
}

function useFullscreenWhiteboard() {
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!fullscreen) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFullscreen(false)
    }
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [fullscreen])

  useEffect(() => {
    void fullscreen
    const animationFrameId = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'))
    })
    return () => { window.cancelAnimationFrame(animationFrameId) }
  }, [fullscreen])

  const toggleFullscreen = useCallback((event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    setFullscreen((current) => !current)
  }, [])

  return { fullscreen, toggleFullscreen }
}

export function TldrawWhiteboard({
  boardId,
  height,
  snapshot,
  width,
  onSnapshotChange,
  onSizeChange,
}: TldrawWhiteboardProps) {
  const store = useMemo(() => createBoardStore(boardId), [boardId])
  const boardRef = useRef<HTMLDivElement | null>(null)
  const savedSnapshotRef = useRef<string | null>(null)
  const savedBoardIdRef = useRef<string | null>(null)
  const onSnapshotChangeRef = useRef(onSnapshotChange)
  const persistedSize = useMemo(() => normalizeSize({ height, width }), [height, width])
  const [resizingSize, setResizingSize] = useState<PixelSize | null>(null)
  const [permissionDeniedBoardId, setPermissionDeniedBoardId] = useState<string | null>(null)
  const platformPermissionDenied = permissionDeniedBoardId === boardId
  const visibleSize = resizingSize ?? persistedSize
  const { fullscreen, toggleFullscreen } = useFullscreenWhiteboard()
  const locale = useDocumentLocale()
  const fullscreenLabel = translate(
    locale,
    fullscreen ? 'editor.whiteboard.exitFullscreen' : 'editor.whiteboard.enterFullscreen',
  )
  // The board follows the editor's theme prop (BlockNoteView), not the window's.
  const colorScheme = useBlockNoteContext()?.colorSchemePreference ?? 'dark'
  const userPreferences = useMemo(() => tldrawUserPreferences(colorScheme), [colorScheme])
  const tldrawUser = useTldrawUser({
    setUserPreferences: ignoreTldrawUserPreferencesUpdate,
    userPreferences,
  })
  const tldrawUiComponents = useMemo(() => ({ Dialogs: TldrawDialogs }), [])
  const handleTldrawMount = useCallback((editor: Editor) =>
    installWhiteboardRuntimeGuards(editor, {
      onPlatformPermissionDenied: () => { setPermissionDeniedBoardId(boardId) },
    }), [boardId])

  useEffect(() => {
    onSnapshotChangeRef.current = onSnapshotChange
  }, [onSnapshotChange])

  useEffect(() => {
    if (boardId === savedBoardIdRef.current && snapshot === savedSnapshotRef.current) return

    const parsed = parseSnapshot(snapshot)
    if (parsed) {
      try {
        loadSnapshot(store, parsed)
        savedBoardIdRef.current = boardId
        savedSnapshotRef.current = snapshot
        return
      } catch {
        // Fall through to an empty board when legacy or hand-edited JSON is invalid.
      }
    }

    const emptySnapshot = getDocumentSnapshot(createTLStore())
    loadSnapshot(store, emptySnapshot)
    savedBoardIdRef.current = boardId
    savedSnapshotRef.current = serializeSnapshot(emptySnapshot)
  }, [boardId, snapshot, store])

  useEffect(() => {
    let timeoutId: number | null = null

    const flushSnapshot = () => {
      timeoutId = null
      const nextSnapshot = serializeSnapshot(getDocumentSnapshot(store))
      if (nextSnapshot === savedSnapshotRef.current) return

      savedBoardIdRef.current = boardId
      savedSnapshotRef.current = nextSnapshot
      onSnapshotChangeRef.current(nextSnapshot)
    }

    const scheduleSnapshotFlush = () => {
      if (timeoutId !== null) window.clearTimeout(timeoutId)
      timeoutId = window.setTimeout(flushSnapshot, 350)
    }

    const cleanup = store.listen(scheduleSnapshotFlush, { source: 'user', scope: 'document' })
    return () => {
      cleanup()
      if (timeoutId !== null) window.clearTimeout(timeoutId)
    }
  }, [boardId, store])

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    event.preventDefault()
    event.stopPropagation()
    const mode = resizeModeFromHandle(event.currentTarget)

    const rect = boardRef.current?.getBoundingClientRect()
    const start: ResizeStart = {
      height: visibleSize.height,
      pointerX: event.clientX,
      pointerY: event.clientY,
      width: visibleSize.width ?? rect?.width ?? MIN_WIDTH,
    }

    const onPointerMove = (moveEvent: PointerEvent) => {
      const nextSize = {
        height: mode === 'width' ? start.height : start.height + moveEvent.clientY - start.pointerY,
        width: mode === 'height' ? visibleSize.width : start.width + moveEvent.clientX - start.pointerX,
      }
      setResizingSize(normalizeSize(sizeToProps(nextSize)))
    }

    const onPointerUp = (upEvent: PointerEvent) => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onPointerUp)

      const finalSize = {
        height: mode === 'width' ? start.height : start.height + upEvent.clientY - start.pointerY,
        width: mode === 'height' ? visibleSize.width : start.width + upEvent.clientX - start.pointerX,
      }
      const nextProps = sizeToProps(normalizeSize(sizeToProps(finalSize)))
      setResizingSize(null)
      onSizeChange(nextProps)
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp, { once: true })
  }

  return (
    <div
      ref={boardRef}
      className="group relative h-[var(--whiteboard-height,520px)] w-[min(var(--whiteboard-width,100%),100%)] max-w-full overflow-hidden rounded-lg border-hairline border-border-default bg-surface-card select-none data-fullscreen:fixed data-fullscreen:inset-2 data-fullscreen:z-popover data-fullscreen:h-auto data-fullscreen:w-auto data-fullscreen:max-w-none data-fullscreen:rounded-xl data-fullscreen:shadow-dialog"
      contentEditable={false}
      data-board-id={boardId}
      data-fullscreen={fullscreen || undefined}
      style={cssSize(visibleSize)}
    >
      <Tldraw
        assetUrls={tldrawAssetUrls}
        components={tldrawUiComponents}
        key={boardId}
        onMount={handleTldrawMount}
        store={store}
        user={tldrawUser}
      />
      {platformPermissionDenied ? (
        <div
          role="alert"
          className="absolute right-3 bottom-3 left-3 z-sticky grid gap-1 rounded-lg border-hairline border-[color-mix(in_srgb,var(--chroma-red)_34%,var(--border-default))] bg-[color-mix(in_srgb,var(--surface-app)_94%,var(--chroma-red))] px-3 py-2.5 text-xs leading-snug text-text-primary shadow-menu"
          data-testid="tldraw-whiteboard-permission-error"
        >
          <strong className="text-xs text-chroma-red">{translate(locale, 'editor.whiteboard.permissionDeniedTitle')}</strong>
          <span>{translate(locale, 'editor.whiteboard.permissionDeniedBody')}</span>
        </div>
      ) : null}
      <FloatingIconGroup className="absolute top-2 right-2 z-sticky group-data-fullscreen:top-3 group-data-fullscreen:right-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="icon"
              size="icon-xs"
              aria-label={fullscreenLabel}
              aria-pressed={fullscreen}
              data-testid="tldraw-whiteboard-fullscreen-toggle"
              onClick={toggleFullscreen}
            >
              {fullscreen ? <ArrowsIn aria-hidden="true" /> : <ArrowsOut aria-hidden="true" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="left">{fullscreenLabel}</TooltipContent>
        </Tooltip>
      </FloatingIconGroup>
      <button
        type="button"
        aria-label="Resize whiteboard width"
        className={`${RESIZE_HANDLE_CLASS} top-0 right-0 h-full w-3 cursor-ew-resize`}
        data-resize-mode="width"
        onPointerDown={startResize}
      />
      <button
        type="button"
        aria-label="Resize whiteboard height"
        className={`${RESIZE_HANDLE_CLASS} bottom-0 left-0 h-3 w-full cursor-ns-resize`}
        data-resize-mode="height"
        onPointerDown={startResize}
      />
      <button
        type="button"
        aria-label="Resize whiteboard"
        className={`${RESIZE_HANDLE_CLASS} right-0 bottom-0 size-4.5 cursor-nwse-resize after:absolute after:right-1 after:bottom-1 after:size-2 after:border-r-2 after:border-b-2 after:border-text-primary/42`}
        data-resize-mode="both"
        onPointerDown={startResize}
      />
    </div>
  )
}

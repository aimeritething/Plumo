import {
  useCallback,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  BLOCK_CONTAINER_SELECTOR,
  CODE_BLOCK_LANGUAGE_CONTROL_ATTRIBUTE,
  blockElementById,
  blockElementFromPoint,
  blockIdFromElement,
  dropPlacementForPoint,
  editorBlockElement,
  type DropPlacement,
  type RichEditor,
} from './block-note-dom'
import {
  canDropSideMenuSection,
  liveSideMenuBlock,
  moveSideMenuSection,
  runSideMenuAction,
  type SideMenuBlock,
} from './side-menu-blocks'

type PointerReorderState = {
  affordances?: ReorderAffordances
  autoscrollFrame: number | null
  clearListeners: () => void
  draggedBlockId: string
  editorElement: HTMLElement
  hasMoved: boolean
  lastDropTarget: DropTarget | null
  ownerDocument: Document
  pointerId: number
  pointerX: number
  pointerY: number
  scrollArea: HTMLElement | null
  startX: number
  startY: number
}
type ReorderAffordances = {
  dimStyle: HTMLStyleElement
  dropIndicator: HTMLElement
  pointerOffsetX: number
  pointerOffsetY: number
  preview: HTMLElement
}
type DropTarget = {
  blockId: string
  element: HTMLElement
  placement: DropPlacement
}

const POINTER_REORDER_THRESHOLD_PX = 4
// Holding the dragged block this close to the editor's top or bottom edge
// scrolls it, faster the closer the pointer is, up to the full step at the edge.
const AUTOSCROLL_EDGE_PX = 40
const AUTOSCROLL_MAX_STEP_PX = 18

function styleDragPreview(preview: HTMLElement, rect: DOMRect) {
  preview.setAttribute('data-testid', 'editor-block-drag-preview')
  preview.setAttribute('aria-hidden', 'true')
  preview.className = 'editor__blocknote-container'
  preview.style.position = 'fixed'
  preview.style.width = `${rect.width}px`
  preview.style.maxHeight = `${Math.max(rect.height, 1)}px`
  preview.style.overflow = 'hidden'
  preview.style.pointerEvents = 'none'
  preview.style.opacity = '0.72'
  preview.style.zIndex = '14000'
  preview.style.boxSizing = 'border-box'
  preview.style.borderRadius = '6px'
  preview.style.background = 'var(--surface-card)'
  preview.style.boxShadow = '0 10px 26px rgba(15, 23, 42, 0.18)'
}

// A code block's language control is laid out over the block, not inside it,
// so the dragged block's clone has to carry it along.
function languageControlsOver(draggedElement: HTMLElement): HTMLElement[] {
  const container = draggedElement.closest('.editor__blocknote-container')
  if (!container) return []

  const blockIds = new Set(
    [draggedElement, ...draggedElement.querySelectorAll(BLOCK_CONTAINER_SELECTOR)]
      .map((element) => element.getAttribute('data-id')),
  )
  return Array.from(
    container.querySelectorAll<HTMLElement>(`[${CODE_BLOCK_LANGUAGE_CONTROL_ATTRIBUTE}]`),
  ).filter((control) => blockIds.has(control.getAttribute(CODE_BLOCK_LANGUAGE_CONTROL_ATTRIBUTE)))
}

function cloneLanguageControl(control: HTMLElement, draggedRect: DOMRect): Node {
  const clone = control.cloneNode(true)
  const rect = control.getBoundingClientRect()
  if (clone instanceof HTMLElement) {
    clone.style.opacity = '1'
    clone.style.left = `${rect.left - draggedRect.left}px`
    clone.style.top = `${rect.top - draggedRect.top}px`
  }
  return clone
}

function createDragPreview(
  draggedElement: HTMLElement,
  languageControls: HTMLElement[],
  ownerDocument: Document,
): HTMLElement {
  const preview = ownerDocument.createElement('div')
  const clone = draggedElement.cloneNode(true)
  const rect = draggedElement.getBoundingClientRect()

  if (clone instanceof HTMLElement) {
    clone.style.opacity = '1'
    clone.style.margin = '0'
    clone.style.width = '100%'
    clone.style.pointerEvents = 'none'
    preview.appendChild(clone)
  }
  languageControls.forEach((control) => preview.appendChild(cloneLanguageControl(control, rect)))
  styleDragPreview(preview, rect)
  ownerDocument.body.appendChild(preview)

  return preview
}

function cssString(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

// ProseMirror redraws a block whose attributes change under it, so an inline
// opacity on the dragged block never shows; a style rule dims it from outside.
// The preview's clones match the same rule and opt out inline.
function createDimStyle(
  draggedBlockId: string,
  languageControls: HTMLElement[],
  ownerDocument: Document,
): HTMLStyleElement {
  const selectors = [
    `[data-node-type="blockContainer"][data-id=${cssString(draggedBlockId)}]`,
    ...languageControls.map((control) => (
      `[${CODE_BLOCK_LANGUAGE_CONTROL_ATTRIBUTE}=${cssString(control.getAttribute(CODE_BLOCK_LANGUAGE_CONTROL_ATTRIBUTE) ?? '')}]`
    )),
  ]
  const style = ownerDocument.createElement('style')
  style.setAttribute('data-plumo-block-reorder', 'true')
  style.textContent = `${selectors.join(', ')} { opacity: 0.35; }`
  ownerDocument.head.appendChild(style)
  return style
}

function createDropIndicator(ownerDocument: Document): HTMLElement {
  const indicator = ownerDocument.createElement('div')
  indicator.setAttribute('data-testid', 'editor-block-drop-indicator')
  indicator.style.position = 'fixed'
  indicator.style.height = '2px'
  indicator.style.pointerEvents = 'none'
  indicator.style.background = 'var(--accent-base)'
  indicator.style.borderRadius = '999px'
  indicator.style.boxShadow = '0 0 0 1px var(--accent-bg)'
  indicator.style.zIndex = '14001'
  indicator.style.display = 'none'
  ownerDocument.body.appendChild(indicator)

  return indicator
}

function createReorderAffordances(state: PointerReorderState): ReorderAffordances | undefined {
  const draggedElement = blockElementById(state.editorElement, state.draggedBlockId)
  if (!draggedElement) return undefined

  const rect = draggedElement.getBoundingClientRect()
  const languageControls = languageControlsOver(draggedElement)
  const preview = createDragPreview(draggedElement, languageControls, state.ownerDocument)

  return {
    dimStyle: createDimStyle(state.draggedBlockId, languageControls, state.ownerDocument),
    dropIndicator: createDropIndicator(state.ownerDocument),
    pointerOffsetX: state.startX - rect.left,
    pointerOffsetY: state.startY - rect.top,
    preview,
  }
}

function cleanupReorderAffordances(affordances: ReorderAffordances | undefined) {
  if (!affordances) return

  affordances.dimStyle.remove()
  affordances.preview.remove()
  affordances.dropIndicator.remove()
}

function updateDragPreview(affordances: ReorderAffordances, x: number, y: number) {
  affordances.preview.style.left = `${x - affordances.pointerOffsetX}px`
  affordances.preview.style.top = `${y - affordances.pointerOffsetY}px`
}

function hideDropIndicator(affordances: ReorderAffordances | undefined) {
  if (affordances) affordances.dropIndicator.style.display = 'none'
}

function updateDropIndicator(affordances: ReorderAffordances | undefined, target: DropTarget | null) {
  if (!affordances || !target) {
    hideDropIndicator(affordances)
    return
  }

  const rect = target.element.getBoundingClientRect()
  affordances.dropIndicator.style.display = 'block'
  affordances.dropIndicator.style.left = `${rect.left}px`
  affordances.dropIndicator.style.top = `${target.placement === 'before' ? rect.top - 1 : rect.bottom - 1}px`
  affordances.dropIndicator.style.width = `${rect.width}px`
}

function validDropTarget({
  editor,
  state,
  x,
  y,
}: {
  editor: RichEditor
  state: PointerReorderState
  x: number
  y: number
}): DropTarget | null {
  const targetElement = blockElementFromPoint({
    editorElement: state.editorElement,
    ownerDocument: state.ownerDocument,
    x,
    y,
  })
  if (!targetElement) return null

  const blockId = blockIdFromElement(targetElement)
  if (!blockId || !canDropSideMenuSection(editor, state.draggedBlockId, blockId)) return null

  return {
    blockId,
    element: targetElement,
    placement: dropPlacementForPoint(targetElement, y),
  }
}

function refreshDropTarget(editor: RichEditor, state: PointerReorderState) {
  state.lastDropTarget = validDropTarget({ editor, state, x: state.pointerX, y: state.pointerY })
  updateDropIndicator(state.affordances, state.lastDropTarget)
}

function editorScrollArea(editorElement: HTMLElement): HTMLElement | null {
  const scrollArea = editorElement.closest('.editor-scroll-area')
  return scrollArea instanceof HTMLElement ? scrollArea : null
}

// Pixels to scroll this frame: negative near the top edge, positive near the
// bottom, 0 anywhere else.
function autoscrollStep(scrollArea: HTMLElement, y: number): number {
  const rect = scrollArea.getBoundingClientRect()
  const edge = Math.min(AUTOSCROLL_EDGE_PX, rect.height / 2)
  if (edge <= 0) return 0

  const stepFor = (depth: number) => Math.ceil(AUTOSCROLL_MAX_STEP_PX * Math.min(depth / edge, 1))
  if (y < rect.top + edge) return -stepFor(rect.top + edge - y)
  if (y > rect.bottom - edge) return stepFor(y - (rect.bottom - edge))
  return 0
}

function stopAutoscroll(state: PointerReorderState) {
  if (state.autoscrollFrame === null) return

  state.ownerDocument.defaultView?.cancelAnimationFrame(state.autoscrollFrame)
  state.autoscrollFrame = null
}

// One scroll step a frame for as long as the pointer stays at an edge; the
// scroll listener moves the drop target along with the content.
function continueAutoscroll(state: PointerReorderState) {
  const { scrollArea } = state
  const view = state.ownerDocument.defaultView
  if (state.autoscrollFrame !== null || !scrollArea || !view) return
  if (autoscrollStep(scrollArea, state.pointerY) === 0) return

  state.autoscrollFrame = view.requestAnimationFrame(() => {
    state.autoscrollFrame = null
    const step = autoscrollStep(scrollArea, state.pointerY)
    if (step === 0) return

    scrollArea.scrollTop += step
    continueAutoscroll(state)
  })
}

function moveBlockByPointerDrop({
  editor,
  draggedBlockId,
  targetBlockId,
  placement,
}: {
  editor: RichEditor
  draggedBlockId: string
  targetBlockId: string
  placement: DropPlacement
}): boolean {
  if (draggedBlockId === targetBlockId) return false
  if (!canDropSideMenuSection(editor, draggedBlockId, targetBlockId)) return false

  let moved = false
  runSideMenuAction(() => {
    editor.focus()
    moved = moveSideMenuSection(editor, draggedBlockId, targetBlockId, placement)
  })

  return moved
}

export function usePointerBlockReorder(
  editor: RichEditor,
  block: SideMenuBlock | undefined,
) {
  const reorderStateRef = useRef<PointerReorderState | null>(null)
  const suppressNextClickRef = useRef(false)

  const clearReorderState = useCallback(() => {
    const state = reorderStateRef.current
    if (state) {
      state.clearListeners()
      stopAutoscroll(state)
      cleanupReorderAffordances(state.affordances)
    }
    reorderStateRef.current = null
  }, [])

  const finishPointerReorder = useCallback((event: PointerEvent) => {
    const state = reorderStateRef.current
    if (!state || event.pointerId !== state.pointerId) return

    clearReorderState()
    if (!state.hasMoved) return

    event.preventDefault()
    suppressNextClickRef.current = true
    const dropTarget = state.lastDropTarget ?? validDropTarget({
      editor,
      state,
      x: event.clientX,
      y: event.clientY,
    })
    if (!dropTarget) return

    const moved = moveBlockByPointerDrop({
      editor,
      draggedBlockId: state.draggedBlockId,
      targetBlockId: dropTarget.blockId,
      placement: dropTarget.placement,
    })

    if (!moved) suppressNextClickRef.current = false
  }, [clearReorderState, editor])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    if ((typeof event.button === 'number' && event.button !== 0) || !event.isPrimary) return
    // BlockNote's shadcn menu trigger opens on pointer up by dispatching a
    // synthetic pointerdown built from the pointerup event, so it carries no
    // pressed button. No pointerup ever follows it: a gesture armed on it
    // would outlive the click and paint the drag preview on the next move.
    if (event.buttons === 0) return

    runSideMenuAction(() => {
      const liveBlock = liveSideMenuBlock(editor, block)
      const editorElement = editorBlockElement(editor)
      if (!liveBlock || !editorElement) {
        event.preventDefault()
        return
      }

      clearReorderState()
      const ownerDocument = event.currentTarget.ownerDocument
      const pointerId = event.pointerId
      const handlePointerMove = (nativeEvent: PointerEvent) => {
        const state = reorderStateRef.current
        if (!state || nativeEvent.pointerId !== state.pointerId) return

        const distance = Math.hypot(
          nativeEvent.clientX - state.startX,
          nativeEvent.clientY - state.startY,
        )
        const movementStarted = [state.hasMoved, distance >= POINTER_REORDER_THRESHOLD_PX]
          .includes(true)
        if (!movementStarted) return

        state.hasMoved = true
        suppressNextClickRef.current = true
        state.affordances ??= createReorderAffordances(state)
        if (!state.affordances) return

        state.pointerX = nativeEvent.clientX
        state.pointerY = nativeEvent.clientY
        updateDragPreview(state.affordances, nativeEvent.clientX, nativeEvent.clientY)
        refreshDropTarget(editor, state)
        continueAutoscroll(state)
        nativeEvent.preventDefault()
      }
      const handlePointerUp = (nativeEvent: PointerEvent) => { finishPointerReorder(nativeEvent); }
      const handlePointerCancel = (nativeEvent: PointerEvent) => {
        if (nativeEvent.pointerId !== pointerId) return
        clearReorderState()
      }
      // Content scrolled under a still pointer (by the wheel or by autoscroll)
      // puts a different block there.
      const handleScroll = () => {
        const state = reorderStateRef.current
        if (state?.affordances) refreshDropTarget(editor, state)
      }
      // Escape drops nothing; the pointerup that follows finds no gesture, and
      // the click it may raise on the handle stays suppressed.
      const handleKeyDown = (nativeEvent: KeyboardEvent) => {
        if (nativeEvent.key !== 'Escape' || !reorderStateRef.current?.hasMoved) return

        nativeEvent.preventDefault()
        nativeEvent.stopPropagation()
        clearReorderState()
      }

      ownerDocument.addEventListener('pointermove', handlePointerMove, true)
      ownerDocument.addEventListener('pointerup', handlePointerUp, true)
      ownerDocument.addEventListener('pointercancel', handlePointerCancel, true)
      ownerDocument.addEventListener('scroll', handleScroll, true)
      ownerDocument.addEventListener('keydown', handleKeyDown, true)

      reorderStateRef.current = {
        clearListeners: () => {
          ownerDocument.removeEventListener('pointermove', handlePointerMove, true)
          ownerDocument.removeEventListener('pointerup', handlePointerUp, true)
          ownerDocument.removeEventListener('pointercancel', handlePointerCancel, true)
          ownerDocument.removeEventListener('scroll', handleScroll, true)
          ownerDocument.removeEventListener('keydown', handleKeyDown, true)
        },
        autoscrollFrame: null,
        draggedBlockId: liveBlock.id,
        editorElement,
        hasMoved: false,
        lastDropTarget: null,
        ownerDocument,
        pointerId,
        pointerX: event.clientX,
        pointerY: event.clientY,
        scrollArea: editorScrollArea(editorElement),
        startX: event.clientX,
        startY: event.clientY,
      }
      try {
        if ('setPointerCapture' in event.currentTarget) event.currentTarget.setPointerCapture(pointerId)
      } catch {
        // Document-level pointer listeners still complete the reorder gesture.
      }
    })
  }, [block, clearReorderState, editor, finishPointerReorder])

  const onClickCapture = useCallback((event: ReactMouseEvent<HTMLElement>) => {
    if (!suppressNextClickRef.current) return

    suppressNextClickRef.current = false
    event.preventDefault()
    event.stopPropagation()
  }, [])

  return { onClickCapture, onPointerDown }
}

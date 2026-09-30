import { useCallback, useEffect, useRef } from 'react'
import type { useCreateBlockNote } from '@blocknote/react'
import {
  applyTiptapTextSelection,
  getTiptapSelectionBridge,
  textPositionAtEditorPoint,
  type EditorClientPoint,
  type WhitespaceSelectionStart,
} from './editor-tiptap-selection'
import { eventTargetElement } from './editor-rich-copy'
import { findNearestTextCursorBlock } from './block-note-cursor-target'
import { handleEditorFileBlockClick } from './editor-attachment-actions'
import { queueTitleHeadingCursorRepair } from './title-heading-interactions'

const CONTAINER_CLICK_IGNORE_SELECTOR = [
  '[contenteditable="true"]',
  'button',
  'input',
  'select',
  'textarea',
  '.bn-formatting-toolbar',
  '.bn-link-toolbar',
  '.bn-panel',
  '.bn-side-menu',
  '.bn-suggestion-menu',
  '.bn-grid-suggestion-menu',
  '.bn-form-popover',
  '[data-editor-code-copy]',
  '[role="menu"]',
  '[role="dialog"]',
].join(', ')
const DRAG_SELECTION_THRESHOLD_PX = 3

type WhitespaceDragState = WhitespaceSelectionStart & {
  moved: boolean
  startX: number
  startY: number
}

type WhitespaceMouseDownEvent = EditorClientPoint & {
  button: number
  target: EventTarget | null
  preventDefault: () => void
}

type WhitespaceSelectionRequest = {
  event: WhitespaceMouseDownEvent
  selectionRoot: HTMLElement
}

type EditorContainerClickOptions = {
  editable: boolean
  editor: ReturnType<typeof useCreateBlockNote>
  event: React.MouseEvent<HTMLDivElement>
  /** Where the last primary press in the container began, so a click the browser moved to a common ancestor is known. */
  pressTargetRef: React.MutableRefObject<EventTarget | null>
  suppressNextContainerClickRef: React.MutableRefObject<boolean>
  vaultPath?: string
}

function shouldIgnoreContainerClick(target: HTMLElement): boolean {
  return Boolean(target.closest(CONTAINER_CLICK_IGNORE_SELECTOR))
}

function selectionIsInsideContainer(container: HTMLElement): boolean {
  const selection = window.getSelection()
  const anchorNode = selection?.rangeCount ? selection.anchorNode : null
  return anchorNode !== null && container.contains(anchorNode)
}

function isUnmodifiedPrimaryClick(event: React.MouseEvent<HTMLDivElement>): boolean {
  const modifierPressed = [event.metaKey, event.ctrlKey, event.altKey, event.shiftKey].some(Boolean)
  return event.button === 0 && !modifierPressed
}

function editableClickNeedsCaretRecovery(container: HTMLElement, target: HTMLElement): boolean {
  return target.closest('[contenteditable="true"]') !== null
    && !selectionIsInsideContainer(container)
}

function recoverMissingEditableSelection(options: {
  container: HTMLElement
  editor: ReturnType<typeof useCreateBlockNote>
  event: React.MouseEvent<HTMLDivElement>
  target: HTMLElement
}): boolean {
  const { container, editor, event, target } = options
  if (!isUnmodifiedPrimaryClick(event)) return false
  if (!editableClickNeedsCaretRecovery(container, target)) return false

  const tiptapEditor = getTiptapSelectionBridge(editor)
  if (!tiptapEditor) return false

  const position = textPositionAtEditorPoint(tiptapEditor, event)
  if (position === null) return false

  editor.focus()
  return applyTiptapTextSelection(tiptapEditor, position, position)
}

function suppressNextContainerClick(
  suppressNextContainerClickRef: React.MutableRefObject<boolean>,
): void {
  suppressNextContainerClickRef.current = true
  window.setTimeout(() => {
    suppressNextContainerClickRef.current = false
  }, 0)
}

function whitespaceSelectionStartFromEvent(options: {
  editable: boolean
  editor: ReturnType<typeof useCreateBlockNote>
  event: WhitespaceMouseDownEvent
  selectionRoot: HTMLElement
}): WhitespaceSelectionStart | null {
  const { editable, editor, event, selectionRoot } = options
  if (!editable || event.button !== 0) return null

  const target = eventTargetElement(event.target)
  if (!target || !selectionRoot.contains(target)) return null
  if (shouldIgnoreContainerClick(target)) return null

  const tiptapEditor = getTiptapSelectionBridge(editor)
  if (!tiptapEditor) return null

  const anchor = textPositionAtEditorPoint(tiptapEditor, event)
  return anchor === null ? null : { anchor, tiptapEditor }
}

function movedPastDragThreshold(state: WhitespaceDragState, point: EditorClientPoint): boolean {
  const movedDistance = Math.max(
    Math.abs(point.clientX - state.startX),
    Math.abs(point.clientY - state.startY),
  )
  return movedDistance >= DRAG_SELECTION_THRESHOLD_PX
}

function updateWhitespaceDragSelection(
  state: WhitespaceDragState,
  point: EditorClientPoint,
): boolean {
  const head = textPositionAtEditorPoint(state.tiptapEditor, point)
  if (head === null) return false

  state.moved = state.moved || movedPastDragThreshold(state, point) || head !== state.anchor
  return applyTiptapTextSelection(state.tiptapEditor, state.anchor, head)
}

function installWhitespaceSelectionDrag(options: {
  cleanupDragRef: React.MutableRefObject<(() => void) | null>
  state: WhitespaceDragState
  suppressNextContainerClickRef: React.MutableRefObject<boolean>
}): () => void {
  const { cleanupDragRef, state, suppressNextContainerClickRef } = options

  function cleanupDrag() {
    window.removeEventListener('mousemove', handleMouseMove)
    window.removeEventListener('mouseup', handleMouseUp)
    if (cleanupDragRef.current === cleanupDrag) cleanupDragRef.current = null
  }

  function handleMouseMove(moveEvent: MouseEvent) {
    if ((moveEvent.buttons & 1) !== 1) {
      cleanupDrag()
      return
    }
    if (updateWhitespaceDragSelection(state, moveEvent)) moveEvent.preventDefault()
  }

  function handleMouseUp(upEvent: MouseEvent) {
    updateWhitespaceDragSelection(state, upEvent)
    if (state.moved) suppressNextContainerClick(suppressNextContainerClickRef)
    cleanupDrag()
  }

  window.addEventListener('mousemove', handleMouseMove)
  window.addEventListener('mouseup', handleMouseUp)
  return cleanupDrag
}

function closestEditorScrollArea(container: HTMLElement): HTMLElement | null {
  const scrollArea = container.closest('.editor-scroll-area')
  return scrollArea instanceof HTMLElement ? scrollArea : null
}

function eventTargetIsOutsideContainer(event: MouseEvent, container: HTMLElement): boolean {
  const target = eventTargetElement(event.target)
  return !target || !container.contains(target)
}

function installScrollAreaWhitespaceSelection(options: {
  beginWhitespaceSelection: (request: WhitespaceSelectionRequest) => void
  container: HTMLElement
}): (() => void) | undefined {
  const { beginWhitespaceSelection, container } = options
  const scrollArea = closestEditorScrollArea(container)
  if (!scrollArea || scrollArea === container) return undefined
  const selectionRoot: HTMLElement = scrollArea

  function handleScrollAreaMouseDown(event: MouseEvent) {
    if (eventTargetIsOutsideContainer(event, container)) {
      beginWhitespaceSelection({
        event: {
          button: event.button,
          clientX: event.clientX,
          clientY: event.clientY,
          preventDefault: () => event.preventDefault(),
          target: event.target,
        },
        selectionRoot,
      })
    }
  }

  selectionRoot.addEventListener('mousedown', handleScrollAreaMouseDown, true)
  return () => selectionRoot.removeEventListener('mousedown', handleScrollAreaMouseDown, true)
}

export function useEditorWhitespaceMouseSelection(options: {
  containerRef: React.RefObject<HTMLDivElement | null>
  editable: boolean
  editor: ReturnType<typeof useCreateBlockNote>
  suppressNextContainerClickRef: React.MutableRefObject<boolean>
}) {
  const { containerRef, editable, editor, suppressNextContainerClickRef } = options
  const cleanupDragRef = useRef<(() => void) | null>(null)

  useEffect(() => () => cleanupDragRef.current?.(), [])

  const beginWhitespaceSelection = useCallback(
    ({ event, selectionRoot }: WhitespaceSelectionRequest) => {
      const selectionStart = whitespaceSelectionStartFromEvent({
        editable,
        editor,
        event,
        selectionRoot,
      })
      if (!selectionStart) return

      cleanupDragRef.current?.()
      editor.focus()
      const { anchor, tiptapEditor } = selectionStart
      if (!applyTiptapTextSelection(tiptapEditor, anchor, anchor)) return
      event.preventDefault()

      cleanupDragRef.current = installWhitespaceSelectionDrag({
        cleanupDragRef,
        state: {
          ...selectionStart,
          moved: false,
          startX: event.clientX,
          startY: event.clientY,
        },
        suppressNextContainerClickRef,
      })
    },
    [editable, editor, suppressNextContainerClickRef],
  )

  useEffect(() => {
    const container = containerRef.current
    if (!container) return undefined
    return installScrollAreaWhitespaceSelection({ beginWhitespaceSelection, container })
  }, [beginWhitespaceSelection, containerRef])

  return useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      beginWhitespaceSelection({ event, selectionRoot: event.currentTarget })
    },
    [beginWhitespaceSelection],
  )
}

function focusEditorAtDocumentEnd(editor: ReturnType<typeof useCreateBlockNote>): void {
  const blocks = editor.document
  const targetBlock = findNearestTextCursorBlock(blocks, blocks.length - 1)
  if (targetBlock) {
    try {
      editor.setTextCursorPosition(targetBlock.id, 'end')
    } catch {
      // Ignore transient BlockNote selection errors and at least restore focus.
    }
  }
  editor.focus()
}

/**
 * A press released on another element (a Table's extend button dragged down
 * as rows appear under it) fires its click on their common ancestor. That
 * click did not start there, so it is not a click below the text.
 */
function clickStartedElsewhere(
  event: React.MouseEvent<HTMLDivElement>,
  pressTargetRef: React.MutableRefObject<EventTarget | null>,
): boolean {
  const pressTarget = pressTargetRef.current
  pressTargetRef.current = null
  return pressTarget !== null && pressTarget !== event.target
}

function handleEditorContainerClick(options: EditorContainerClickOptions): void {
  const { editable, editor, event, pressTargetRef, suppressNextContainerClickRef, vaultPath } = options
  if (!editable) return
  if (suppressNextContainerClickRef.current) {
    suppressNextContainerClickRef.current = false
    return
  }
  if (handleEditorFileBlockClick({ event, editor, vaultPath })) return

  const target = eventTargetElement(event.target)
  if (!target) return
  if (queueTitleHeadingCursorRepair(target, editor)) return
  if (shouldIgnoreContainerClick(target)) {
    recoverMissingEditableSelection({
      container: event.currentTarget,
      editor,
      event,
      target,
    })
    return
  }
  if (clickStartedElsewhere(event, pressTargetRef)) return
  focusEditorAtDocumentEnd(editor)
}

export function useEditorContainerClickHandler(
  options: Omit<EditorContainerClickOptions, 'event'>,
) {
  const { editable, editor, pressTargetRef, suppressNextContainerClickRef, vaultPath } = options
  return useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      handleEditorContainerClick({
        editable,
        editor,
        event,
        pressTargetRef,
        suppressNextContainerClickRef,
        vaultPath,
      })
    },
    [editable, editor, pressTargetRef, suppressNextContainerClickRef, vaultPath],
  )
}

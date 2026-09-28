import {
  useState, useEffect, useCallback, useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'
import { isImeKeyEvent } from '@/lib/ime-key-event'

export interface SidebarMenuPosition {
  x: number
  y: number
}

export interface SidebarContextMenuState<T> {
  target: T
  pos: SidebarMenuPosition
}

interface PointerMenuEvent {
  clientX: number
  clientY: number
  preventDefault?: () => void
  stopPropagation?: () => void
}

interface SidebarInlineRenameInputOptions {
  initialValue: string
  onCancel: () => void
  onSubmit: (value: string) => Promise<boolean> | boolean | undefined
  /**
   * The rename ended from the keyboard (Enter took the name, or Escape gave it
   * up), so focus needs a place to go: the input is about to unmount. A blur
   * ends a rename too, but focus went where the click went.
   */
  onKeyboardEnd?: () => void
  selectTextOnFocus?: boolean
}

export function getPointerMenuPosition(event: PointerMenuEvent): SidebarMenuPosition {
  return { x: event.clientX, y: event.clientY }
}

export function useOutsideClick<T extends HTMLElement>(
  ref: RefObject<T | null>,
  isOpen: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!isOpen) return
    const handler = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [ref, isOpen, onClose])
}

export function useDismissableSidebarLayer<T extends HTMLElement>(
  ref: RefObject<T | null>,
  isOpen: boolean,
  onClose: () => void,
) {
  useOutsideClick(ref, isOpen, onClose)

  useEffect(() => {
    if (!isOpen) return
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [isOpen, onClose])
}

export function useSidebarContextMenu<T>() {
  const [contextMenu, setContextMenu] = useState<SidebarContextMenuState<T> | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const closeContextMenu = useCallback(() => setContextMenu(null), [])
  useDismissableSidebarLayer(contextMenuRef, !!contextMenu, closeContextMenu)

  const openContextMenuAt = useCallback((target: T, pos: SidebarMenuPosition) => {
    setContextMenu({ target, pos })
  }, [])

  const openContextMenuFromPointer = useCallback((target: T, event: PointerMenuEvent) => {
    event.preventDefault?.()
    event.stopPropagation?.()
    openContextMenuAt(target, getPointerMenuPosition(event))
  }, [openContextMenuAt])

  return {
    closeContextMenu,
    contextMenu,
    contextMenuRef,
    openContextMenuAt,
    openContextMenuFromPointer,
  }
}

export function useSidebarInlineRenameInput({
  initialValue,
  onCancel,
  onSubmit,
  onKeyboardEnd,
  selectTextOnFocus = true,
}: SidebarInlineRenameInputOptions) {
  const [value, setValue] = useState(initialValue)
  const inputRef = useRef<HTMLInputElement>(null)
  const submittingRef = useRef(false)

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.focus()
    if (selectTextOnFocus) input.select()
  }, [selectTextOnFocus])

  const submitValue = useCallback(async () => {
    if (submittingRef.current) return false
    submittingRef.current = true
    try {
      return await onSubmit(value)
    } finally {
      submittingRef.current = false
    }
  }, [onSubmit, value])

  // A blur whose name is refused gives the rename up, as Escape would: there
  // is no one left looking at the input to read why (AIM-481). A blur that
  // lands while Enter's commit is still out leaves that commit to answer.
  const handleBlur = useCallback(() => {
    if (submittingRef.current) return
    void Promise.resolve(submitValue()).then((accepted) => { if (!accepted) onCancel() })
  }, [onCancel, submitValue])

  const handleKeyDown = useCallback((event: ReactKeyboardEvent<HTMLInputElement>) => {
    // Enter confirming a candidate is not Enter committing the name.
    if (isImeKeyEvent(event.nativeEvent)) return
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      void Promise.resolve(submitValue()).then((accepted) => { if (accepted) onKeyboardEnd?.() })
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onCancel()
      onKeyboardEnd?.()
    }
  }, [onCancel, onKeyboardEnd, submitValue])

  return {
    handleBlur,
    handleKeyDown,
    inputRef,
    setValue,
    submitValue,
    value,
  }
}

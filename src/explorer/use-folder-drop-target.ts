import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import { canMoveInto, clearDraggedNotePath, readDraggedNotePath } from './note-drag-drop'

/** How long a dragged file rests on a shut folder before the folder opens. */
export const DRAG_HOVER_EXPAND_MS = 600

type DropHandler = (event: DragEvent<HTMLElement>) => void

export interface FolderDropProps {
  onDragEnter: DropHandler
  onDragOver: DropHandler
  onDragLeave: DropHandler
  onDrop: DropHandler
}

export interface FolderDropTarget {
  /**
   * The folder a drop would land in right now, or null. Its row is what is
   * marked, or the header for the Folder's top level, whichever element the
   * file is over.
   */
  target: string | null
  /**
   * The handlers for an element whose drops land in `destination`: a folder
   * row, a file row (its own folder), the header or the empty area (the
   * Folder's top level). `expand` opens the shut folder the file rests on.
   */
  dropProps: (destination: string, expand?: () => void) => FolderDropProps
  /** The drag ended somewhere, so nothing stays marked and no folder is left to open. */
  endDrag: () => void
}

/**
 * Where a dragged Document or Image file can land, for the whole Explorer at
 * once: one element can mark another (a file row marks its folder's row), so
 * the mark lives here rather than on each element. The dragged path is read
 * off the drag or, when the browser hides the data, from the drag in progress.
 * A drop that would move nothing is not offered: the dragover goes untaken and
 * nothing is marked.
 *
 * Every element counts the `dragenter`s and `dragleave`s that reach it, its
 * children's included, so crossing a row's own icon or name never reads as
 * leaving the row; the browser enters the next element before it leaves the
 * last, so the element entered last is the one the file is over.
 */
export function useFolderDropTarget(moveInto: (path: string, destination: string) => void): FolderDropTarget {
  const [target, setTarget] = useState<string | null>(null)
  const depthsRef = useRef(new Map<Element, number>())
  const overRef = useRef<Element | null>(null)
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancelExpand = useCallback(() => {
    if (expandTimerRef.current !== null) clearTimeout(expandTimerRef.current)
    expandTimerRef.current = null
  }, [])

  useEffect(() => cancelExpand, [cancelExpand])

  const endDrag = useCallback(() => {
    depthsRef.current.clear()
    overRef.current = null
    cancelExpand()
    setTarget(null)
  }, [cancelExpand])

  const dropProps = useCallback((destination: string, expand?: () => void): FolderDropProps => {
    const accepts = (dataTransfer: DataTransfer) => {
      const dragged = readDraggedNotePath(dataTransfer)
      return dragged !== null && canMoveInto(dragged, destination)
    }

    return {
      onDragEnter: (event) => {
        if (!readDraggedNotePath(event.dataTransfer)) return
        const element = event.currentTarget
        const depth = (depthsRef.current.get(element) ?? 0) + 1
        depthsRef.current.set(element, depth)
        if (depth > 1) return
        overRef.current = element
        cancelExpand()
        if (expand) {
          expandTimerRef.current = setTimeout(() => {
            expandTimerRef.current = null
            expand()
          }, DRAG_HOVER_EXPAND_MS)
        }
        setTarget(accepts(event.dataTransfer) ? destination : null)
      },
      onDragOver: (event) => {
        if (!accepts(event.dataTransfer)) return
        // Taking the event is what tells the browser this element accepts the drop.
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        overRef.current = event.currentTarget
        setTarget(destination)
      },
      onDragLeave: (event) => {
        const element = event.currentTarget
        const depth = (depthsRef.current.get(element) ?? 0) - 1
        if (depth > 0) {
          depthsRef.current.set(element, depth)
          return
        }
        depthsRef.current.delete(element)
        if (overRef.current !== element) return
        overRef.current = null
        cancelExpand()
        setTarget(null)
      },
      onDrop: (event) => {
        const dragged = readDraggedNotePath(event.dataTransfer)
        endDrag()
        clearDraggedNotePath()
        if (!dragged || !canMoveInto(dragged, destination)) return
        event.preventDefault()
        moveInto(dragged, destination)
      },
    }
  }, [cancelExpand, endDrag, moveInto])

  return { target, dropProps, endDrag }
}

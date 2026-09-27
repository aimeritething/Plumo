import { useEffect, type MutableRefObject } from 'react'

/**
 * Hand a value up through a ref App holds, for as long as the surface that
 * owns it is mounted: Toggle Rich/Raw, Find, Undo and Redo reach the editor
 * this way. The ref is cleared on the way out only when it still holds this
 * value, so another surface's registration is left alone.
 */
export function useRegisteredRef<T>(ref: MutableRefObject<T | null> | undefined, value: T) {
  useEffect(() => {
    if (!ref) return
    ref.current = value
    return () => {
      if (ref.current === value) ref.current = null
    }
  }, [ref, value])
}

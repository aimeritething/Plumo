import { useCallback, useRef } from 'react'

/** Nothing has focus, or only the document chrome: what a closing dialog leaves behind. */
function focusIsLoose(): boolean {
  const active = document.activeElement
  return active === null || active === document.body || active === document.documentElement
}

/**
 * Where focus goes when one of Plumo's dialogs closes. Radix hands it to the
 * dialog's trigger, and Plumo's dialogs open from a shortcut, a menu item or
 * a double-click and have none, so focus would land on `<body>` and the
 * keyboard would be dead until a click. The element that had focus when the
 * dialog opened gets it back, unless whatever the dialog ran took focus
 * itself (a find bar, a rename field, the editor of a Document just opened):
 * then that stands.
 */
export function useDialogReturnFocus() {
  const returnToRef = useRef<HTMLElement | null>(null)

  const onOpenAutoFocus = useCallback(() => {
    const active = document.activeElement
    returnToRef.current = active instanceof HTMLElement && !focusIsLoose() ? active : null
  }, [])

  const onCloseAutoFocus = useCallback((event: Event) => {
    event.preventDefault()
    const target = returnToRef.current
    returnToRef.current = null
    if (!focusIsLoose() || !target?.isConnected) return
    target.focus({ preventScroll: true })
  }, [])

  return { onOpenAutoFocus, onCloseAutoFocus }
}

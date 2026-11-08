import { useCallback } from 'react'

/** Nothing has focus, or only the document chrome: what a closing dialog leaves behind. */
function focusIsLoose(): boolean {
  const active = document.activeElement
  return active === null || active === document.body || active === document.documentElement
}

/**
 * Where focus goes when one of Plumo's dialogs closes, as the dialog's
 * `finalFocus`. Plumo's dialogs open from a shortcut, a menu item or a
 * double-click and have no trigger, so the element that had focus when the
 * dialog opened gets it back (Base UI's own return), unless whatever the
 * dialog ran took focus itself (a find bar, a rename field, the editor of a
 * Document just opened): then that stands.
 */
export function useDialogReturnFocus() {
  const finalFocus = useCallback(() => {
    const active = document.activeElement
    const stillInDialog = active instanceof HTMLElement && active.closest('[data-slot="dialog-content"]') !== null
    return focusIsLoose() || stillInDialog
  }, [])

  return { finalFocus }
}

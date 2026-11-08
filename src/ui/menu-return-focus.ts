import * as React from "react"

/** Nothing has the focus, or only the document: what a closed menu leaves behind. */
function focusIsLoose(doc: Document): boolean {
  const active = doc.activeElement
  return active === null || active === doc.body || active === doc.documentElement
}

/** Sits in a menu's popup and notes what had the focus as it opened, before Base UI moves it in. */
function MenuOpenedFrom({ onOpen }: { onOpen: (element: HTMLElement | null) => void }) {
  React.useLayoutEffect(() => {
    const active = document.activeElement
    onOpen(active instanceof HTMLElement && !focusIsLoose(document) ? active : null)
  }, [onOpen])
  return null
}

/**
 * A menu's default `finalFocus`: the focus goes back to where it was when the
 * menu opened (its trigger, the row a right-click focused), unless what the
 * chosen item ran took it (a rename field, a dialog). Base UI decides as the
 * menu goes, before a field the choice mounts has taken the focus, and then
 * takes it back; this return waits a task, as Radix's did.
 */
function useMenuReturnFocus() {
  const openedFromRef = React.useRef<HTMLElement | null>(null)
  const noteOpenedFrom = React.useCallback((element: HTMLElement | null) => {
    openedFromRef.current = element
  }, [])
  const finalFocus = React.useCallback(() => {
    const openedFrom = openedFromRef.current
    openedFromRef.current = null
    window.setTimeout(() => {
      if (openedFrom?.isConnected && focusIsLoose(openedFrom.ownerDocument)) {
        openedFrom.focus({ preventScroll: true })
      }
    }, 0)
    return false
  }, [])
  return { noteOpenedFrom, finalFocus }
}

export { MenuOpenedFrom, useMenuReturnFocus }

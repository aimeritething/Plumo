/**
 * Keeps WKWebView's own right-click menu (Reload, Inspect Element) out of the
 * app. The listener runs in the bubble phase, after React has handled the event
 * at the root: Radix's `ContextMenuTrigger` opens only for an event nobody has
 * prevented yet, so a capture-phase listener would stop every sidebar menu.
 */

function preventNativeContextMenu(event: MouseEvent): void {
  event.preventDefault()
}

export function installNativeContextMenuSuppression(target: Pick<Document, 'addEventListener' | 'removeEventListener'>): () => void {
  target.addEventListener('contextmenu', preventNativeContextMenu)
  return () => target.removeEventListener('contextmenu', preventNativeContextMenu)
}

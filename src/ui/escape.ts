/**
 * For an overlay that does not hold the focus (a hover card, a popover that
 * only places a control beside the editor), the Esc that closes it was pressed
 * in whatever has the focus, the editor, and is that place's too. The
 * primitive library marks the Esc handled (preventDefault) right after the
 * overlay's own Esc handler as it dismisses the overlay, and the editor then
 * ignores it (it selects the caret's Block, the find bar closes). Called from
 * that handler, this drops that one mark; the next listener's preventDefault
 * is the event's own again. The library's dismiss step is spelled here, in
 * src/ui, where the move to Base UI changes it (ADR-0013).
 */
function leaveEscapeUnmarked(event: KeyboardEvent) {
  event.preventDefault = () => {
    Reflect.deleteProperty(event, "preventDefault")
  }
}

/**
 * Wraps an overlay's Esc handler: the caller's handler runs first, and when it
 * did not mark the Esc itself and `unmarked` is set, the library's mark is
 * dropped (`leaveEscapeUnmarked`).
 */
function escapeKeyDownHandler(
  onEscapeKeyDown: ((event: KeyboardEvent) => void) | undefined,
  unmarked: boolean
): ((event: KeyboardEvent) => void) | undefined {
  if (!unmarked) return onEscapeKeyDown
  return (event) => {
    onEscapeKeyDown?.(event)
    if (!event.defaultPrevented) leaveEscapeUnmarked(event)
  }
}

export { escapeKeyDownHandler }

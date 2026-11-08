/**
 * For an overlay that does not hold the focus (a hover card, a tooltip, a
 * popover that only places a control beside the editor), the Esc that closes
 * it was pressed in whatever has the focus, the editor, and is that place's
 * too. Base UI dismisses the overlay from a keydown listener on the document,
 * after the editor has seen the Esc, and then marks it handled
 * (preventDefault) and stops it there, so a window listener (the board's
 * fullscreen) never sees it. Called from the overlay's `onOpenChange`, which
 * Base UI runs first, this drops that one mark; the next listener's
 * preventDefault is the event's own again. The library's dismiss step is
 * spelled here, in src/ui, and not by the features (ADR-0013).
 */
function leaveEscapeUnmarked(event: Event) {
  event.preventDefault = () => {
    Reflect.deleteProperty(event, "preventDefault")
  }
}

/** What escapeOpenChangeHandler reads off a Base UI `onOpenChange`'s details. */
interface EscapeChangeDetails {
  reason: string
  event: Event
  isCanceled: boolean
  allowPropagation(): void
}

/**
 * Wraps an overlay Root's `onOpenChange`: the caller's handler runs first,
 * and when the change is an Esc the caller did not cancel or mark itself and
 * `unmarked` is set, the Esc is left unmarked (`leaveEscapeUnmarked`) and goes
 * on past the document. Always returns a handler, so an overlay with no
 * `onOpenChange` of its own (one open for as long as it is shown) still
 * leaves its Esc alone.
 */
function escapeOpenChangeHandler<Details extends EscapeChangeDetails>(
  onOpenChange: ((open: boolean, details: Details) => void) | undefined,
  unmarked: boolean
): (open: boolean, details: Details) => void {
  return (open, details) => {
    onOpenChange?.(open, details)
    if (!unmarked || details.reason !== "escape-key" || details.isCanceled) return
    if (!details.event.defaultPrevented) leaveEscapeUnmarked(details.event)
    details.allowPropagation()
  }
}

export { escapeOpenChangeHandler }

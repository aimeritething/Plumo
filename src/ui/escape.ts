import * as React from "react"

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

/**
 * Radix dismissed a tooltip or a hover card from an Esc listener in the
 * document's capture phase, so the Esc closed it wherever the focus was.
 * Base UI's listener is in the bubble phase, and an Esc the editor handles
 * stops before it gets there, leaving the overlay up. While the overlay is
 * `open`, this closes it through its Root's `actionsRef` from the capture
 * phase instead: a tooltip marks the Esc handled, as Radix's did, so the
 * editor leaves it alone; an `unmarked` one (a hover card) leaves it to the
 * editor.
 */
function useEscapeClosesFirst(
  open: boolean,
  actionsRef: React.RefObject<{ close(): void } | null>,
  unmarked: boolean
) {
  React.useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.isComposing) return
      if (!unmarked) event.preventDefault()
      actionsRef.current?.close()
    }
    document.addEventListener("keydown", onKeyDown, true)
    return () => document.removeEventListener("keydown", onKeyDown, true)
  }, [open, actionsRef, unmarked])
}

export { escapeOpenChangeHandler, useEscapeClosesFirst }

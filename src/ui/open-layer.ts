/**
 * A selector for one of src/ui's overlays, by its `data-slot` (`dialog-content`,
 * `dropdown-menu-content`), while it is open and not during its exit
 * animation. The open / closed attribute is the primitive library's own, so it
 * is spelled here, where the move to Base UI changes it, and not by the
 * features that ask (ADR-0013).
 */
function openLayerSelector(slot: string): string {
  return `[data-slot="${slot}"][data-state="open"]`
}

export { openLayerSelector }

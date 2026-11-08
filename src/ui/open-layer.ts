/**
 * A selector for one of src/ui's overlays, by its `data-slot` (`dialog-content`,
 * `dropdown-menu-content`), while it is open and not during its exit
 * animation (Base UI then writes `data-closed` and `data-ending-style`). The
 * open attribute is the primitive library's own, so it is spelled here and
 * not by the features that ask (ADR-0013).
 */
function openLayerSelector(slot: string): string {
  return `[data-slot="${slot}"][data-open]`
}

export { openLayerSelector }

/**
 * The attributes one of src/ui's overlays carries, open or closing, written
 * into a test's markup: a test that stands in for an overlay with a plain
 * element leaves the library's open / closed attribute to src/ui.
 */
export function layerAttributes(slot: string, state: "open" | "closing" = "open"): string {
  return `data-slot="${slot}" data-state="${state === "open" ? "open" : "closed"}"`
}

/** Whether a src/ui trigger (a context menu's, a dropdown's) holds its menu open. */
export function holdsOpenMenu(element: Element): boolean {
  return element.getAttribute("data-state") === "open"
}

/**
 * The box that places one of src/ui's popovers (its position and size, which
 * a test gives the overlay since jsdom lays nothing out). It is the primitive
 * library's own wrapper around the content, so it is named here and not by
 * the tests that measure it.
 */
const LAYER_POSITIONER = "[data-radix-popper-content-wrapper]"

/** Whether an element is the box that places a src/ui popover. */
export function isLayerPositioner(element: Element): boolean {
  return element.matches(LAYER_POSITIONER)
}

/** The box that places the src/ui popover holding `element`. */
export function layerPositioner(element: Element): HTMLElement {
  const positioner = element.closest<HTMLElement>(LAYER_POSITIONER)
  if (!positioner) throw new Error("Expected the element to sit in a src/ui popover")
  return positioner
}

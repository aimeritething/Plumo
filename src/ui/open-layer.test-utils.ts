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

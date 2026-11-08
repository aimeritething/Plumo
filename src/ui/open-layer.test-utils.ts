import { fireEvent } from '@testing-library/react'

/**
 * The attributes one of src/ui's overlays carries, open or closing, written
 * into a test's markup: a test that stands in for an overlay with a plain
 * element leaves the library's open / closed attributes to src/ui.
 */
export function layerAttributes(slot: string, state: 'open' | 'closing' = 'open'): string {
  return state === 'open'
    ? `data-slot="${slot}" data-open=""`
    : `data-slot="${slot}" data-closed="" data-ending-style=""`
}

/** Whether a src/ui trigger (a context menu's, a dropdown's, a popover's) holds its popup open. */
export function holdsOpenMenu(element: Element): boolean {
  return element.hasAttribute('data-popup-open')
}

/**
 * Opens the menu, popover or select a src/ui trigger opens, as a press does.
 * Base UI opens a menu on the mouse's press, a frame later, or on a click
 * with no press before it (a screen reader's, the keyboard's): the click is
 * the one that does not wait.
 */
export function pressToOpen(trigger: Element): void {
  fireEvent.click(trigger)
}

/**
 * Chooses a select's option with the pointer: Base UI takes a click on an
 * option only after a press on it (the list can open under a pointer that is
 * still down), or from the keyboard on the highlighted one.
 */
export function pressItem(item: Element): void {
  fireEvent.pointerDown(item)
  fireEvent.click(item)
}

/**
 * Puts the pointer over a src/ui tooltip's or hover card's trigger, or over
 * an open card. Over a card the pointer enters the box that places it too,
 * as it would in a browser: Base UI watches that box, not the card.
 */
export function hoverToOpen(element: Element): void {
  const positioner = element.closest(LAYER_POSITIONER)
  if (positioner && positioner !== element) fireEvent.mouseEnter(positioner)
  fireEvent.mouseEnter(element)
  fireEvent.mouseMove(element)
}

/**
 * Takes the pointer off a src/ui tooltip's or hover card's trigger, or off an
 * open card (and the box that places it), onto `onto` when it goes straight
 * to another element (the open card): Base UI keeps a card open while the
 * pointer heads for it, which jsdom, with no layout, can only tell by where
 * the pointer lands.
 */
export function unhover(element: Element, onto?: Element): void {
  const init = onto ? { relatedTarget: onto } : undefined
  fireEvent.mouseLeave(element, init)
  const positioner = element.closest(LAYER_POSITIONER)
  if (positioner && positioner !== element && !(onto && positioner.contains(onto))) {
    fireEvent.mouseLeave(positioner, init)
  }
}

/**
 * The box that places one of src/ui's popovers (its position and size, which
 * a test gives the overlay since jsdom lays nothing out). It is the primitive
 * library's own wrapper around the content, which src/ui names
 * `<name>-positioner`, so it is named here and not by the tests that measure it.
 */
const LAYER_POSITIONER = '[data-slot$="-positioner"]'

/** Whether an element is the box that places a src/ui popover. */
export function isLayerPositioner(element: Element): boolean {
  return element.matches(LAYER_POSITIONER)
}

/** The box that places the src/ui popover holding `element`. */
export function layerPositioner(element: Element): HTMLElement {
  const positioner = element.closest<HTMLElement>(LAYER_POSITIONER)
  if (!positioner) throw new Error('Expected the element to sit in a src/ui popover')
  return positioner
}

/**
 * The DOM contract between Properties and the code that finds its rows from
 * outside it: the mode switch (`editor-mode-position.ts`) and the focus hold.
 * The editor shell's Tailwind variant `[&:has(>[data-properties])…]` in
 * `editor.tsx` spells the root attribute out, since Tailwind reads it from source.
 */

/** The Properties root. */
export const PROPERTIES_ATTRIBUTE = 'data-properties'
/** A row, carrying its Property's key. */
export const PROPERTY_KEY_ATTRIBUTE = 'data-property-key'
/** A row: the first line of its Property within the Frontmatter block, 0 being the opening `---`. */
export const PROPERTY_LINE_ATTRIBUTE = 'data-property-line'
/** A row: the last line of its Property. */
export const PROPERTY_END_LINE_ATTRIBUTE = 'data-property-end-line'
/** The control of a value that takes the caret: what ↑ and ↓ move between, and what a mode switch focuses. */
export const PROPERTY_VALUE_ATTRIBUTE = 'data-property-value'

export const PROPERTIES_SELECTOR = `[${PROPERTIES_ATTRIBUTE}]`
export const PROPERTY_VALUE_SELECTOR = `[${PROPERTY_VALUE_ATTRIBUTE}]`
/** Spread onto the element of a value control. */
export const PROPERTY_VALUE_PROPS = { [PROPERTY_VALUE_ATTRIBUTE]: '' } as const

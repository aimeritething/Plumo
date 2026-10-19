import type { Node as ProsemirrorNode } from '@tiptap/pm/model'

export interface OutlineEntry {
  id: string
  level: number
  text: string
  /** Indent: 0 for the shallowest heading level in this Outline. */
  depth: number
}

/** Below this many entries a Document has no Outline. */
export const OUTLINE_MIN_ENTRIES = 2

/**
 * A Document's Outline: its non-empty heading Blocks in Document order,
 * nested ones included, less its title (a first-level heading that is its
 * first Block). Read off the ProseMirror document, not `editor.document`,
 * because it runs after every edit and that conversion costs a whole
 * Document's worth of Blocks.
 */
export function documentOutline(doc: ProsemirrorNode): OutlineEntry[] {
  const headings: Omit<OutlineEntry, 'depth'>[] = []
  let first = true
  // Down through Blocks and their nested groups only, never into a Block's own content.
  doc.descendants((node) => {
    if (node.type.name === 'blockGroup') return true
    if (node.type.name !== 'blockContainer') return false
    const content = node.firstChild
    const isTitle = first && content?.type.name === 'heading' && headingLevel(content) === 1
    first = false
    if (content?.type.name !== 'heading' || isTitle) return true
    const text = content.textContent.trim()
    const id: unknown = node.attrs.id
    if (text && typeof id === 'string') headings.push({ id, level: headingLevel(content), text })
    return true
  })
  if (headings.length < OUTLINE_MIN_ENTRIES) return []
  const shallowest = Math.min(...headings.map((heading) => heading.level))
  return headings.map((heading) => ({ ...heading, depth: heading.level - shallowest }))
}

function headingLevel(node: ProsemirrorNode): number {
  const level = Number(node.attrs.level)
  return Number.isInteger(level) && level >= 1 ? level : 1
}

export function sameOutline(a: readonly OutlineEntry[], b: readonly OutlineEntry[]): boolean {
  return a.length === b.length && a.every((entry, i) => {
    const other = b[i]
    return entry.id === other.id && entry.level === other.level && entry.text === other.text && entry.depth === other.depth
  })
}

const RAIL_PITCH = 10
const RAIL_MIN_PITCH = 4

export interface RailLayout {
  /** The distance between two dashes. */
  pitch: number
  /** The entries the rail shows, `start` up to but not including `end`. */
  start: number
  end: number
}

/**
 * How the collapsed Outline fits `maxHeight`: dashes 10px apart, closer
 * together down to 4px when there are many, and past that only the run of
 * them around the current Section's.
 */
export function railLayout(count: number, activeIndex: number, maxHeight: number): RailLayout {
  if (count * RAIL_PITCH <= maxHeight) return { pitch: RAIL_PITCH, start: 0, end: count }
  if (count * RAIL_MIN_PITCH <= maxHeight) return { pitch: maxHeight / count, start: 0, end: count }
  const shown = Math.max(1, Math.floor(maxHeight / RAIL_MIN_PITCH))
  const start = Math.min(Math.max(0, Math.max(activeIndex, 0) - Math.floor(shown / 2)), count - shown)
  return { pitch: RAIL_MIN_PITCH, start, end: start + shown }
}

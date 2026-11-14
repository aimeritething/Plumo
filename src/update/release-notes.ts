/** One group of an Update's notes: a heading from `CHANGELOG.md` (Added, Improved, Fixed) and the changes under it. */
export interface ReleaseNotesGroup {
  heading: string | null
  items: string[]
}

/** Inline Markdown the notes may carry, shown as plain text: code ticks, emphasis, and a link's target. */
function plainText(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .trim()
}

/**
 * An Update's notes as groups of changes. The notes are a version's section
 * of `CHANGELOG.md`: `###` headings with a bullet list under each. A line
 * that is neither continues the change before it, and a change before any
 * heading belongs to a group with none.
 */
export function parseReleaseNotes(notes: string): ReleaseNotesGroup[] {
  const groups: ReleaseNotesGroup[] = []
  for (const raw of notes.split('\n')) {
    const line = raw.trim()
    if (line === '') continue
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      groups.push({ heading: plainText(heading[1]), items: [] })
      continue
    }
    if (groups.length === 0) groups.push({ heading: null, items: [] })
    const group = groups[groups.length - 1]
    const bullet = /^[-*]\s+(.*)$/.exec(line)
    if (bullet) group.items.push(plainText(bullet[1]))
    else if (group.items.length === 0) group.items.push(plainText(line))
    else group.items[group.items.length - 1] += ` ${plainText(line)}`
  }
  return groups.filter((group) => group.items.length > 0)
}

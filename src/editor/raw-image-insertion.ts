import type { Text } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { portableImageUrls } from '@/kernel/markdown/vault-images'
import { splitFrontmatter } from '@/kernel/markdown/wikilinks'
import type { ClientPoint } from '@/platform/use-tauri-drag-drop-event'

/** The line a drop lands beside, and on which side of it. */
export type RawImageDropTarget = {
  line: number
  placement: 'before' | 'after'
}

type RawImageInsertion = { from: number; insert: string }
type RawImageView = Pick<EditorView, 'documentTop' | 'lineBlockAtHeight' | 'state'>

/**
 * Where images dropped at a point go: beside the line at the pointer's
 * height, before it in its upper half and after it in its lower half, the
 * rule Rich mode follows for the block under the pointer. Only the height is
 * read, so a point in the gutter or beside a short line finds the line there;
 * above the first line or below the last, that line. A wrapped line counts whole.
 */
export function rawImageDropTargetAt(view: RawImageView, point: ClientPoint): RawImageDropTarget {
  const block = view.lineBlockAtHeight(point.y - view.documentTop)
  const middle = view.documentTop + block.top + block.height / 2
  return {
    line: view.state.doc.lineAt(block.from).number,
    placement: point.y < middle ? 'before' : 'after',
  }
}

/**
 * The Markdown Rich mode writes for an image block holding this asset URL:
 * the same portable rewrite of the path, so a drop writes the same bytes in
 * either mode (`attachments/x.png` beside a Document at the Folder root).
 */
export function rawImageMarkdown(url: string, vaultPath: string | undefined, notePath: string): string {
  const markdown = `![](${url})`
  return vaultPath ? portableImageUrls(markdown, vaultPath, notePath) : markdown
}

function isBlankLine(doc: Text, lineNumber: number): boolean {
  return lineNumber < 1 || lineNumber > doc.lines || doc.line(lineNumber).text.trim() === ''
}

// Every drop goes in at the start of a line, or at the very end after a last
// line that has text; never into the Frontmatter, which an image line would break.
function insertionLine(doc: Text, target: RawImageDropTarget): number | 'end' {
  const line = Math.min(Math.max(target.line, 1), doc.lines)
  let before = target.placement === 'before' || isBlankLine(doc, line) ? line : line + 1

  const frontmatterLength = splitFrontmatter(doc.toString())[0].length
  if (before <= doc.lines && doc.line(before).from < frontmatterLength) {
    before = doc.lineAt(frontmatterLength).number
    if (doc.line(before).from < frontmatterLength) before += 1
  }
  return before > doc.lines ? 'end' : before
}

/**
 * The change that puts the image lines at a drop target: each on a line of
 * its own and a paragraph of its own, in order, with a blank line between it
 * and any text around it, so the Document reads back as one image block each.
 */
export function rawImageInsertion(doc: Text, target: RawImageDropTarget, images: string[]): RawImageInsertion {
  const block = images.join('\n\n')
  const line = insertionLine(doc, target)
  if (line === 'end') return { from: doc.length, insert: `\n\n${block}` }

  const lead = isBlankLine(doc, line - 1) ? '' : '\n'
  const trail = isBlankLine(doc, line) ? '\n' : '\n\n'
  return { from: doc.line(line).from, insert: `${lead}${block}${trail}` }
}

/** Insert the images as one ordinary edit: it goes on the undo history, and Autosave writes it. */
export function insertRawImages(
  view: Pick<EditorView, 'dispatch' | 'state'>,
  target: RawImageDropTarget,
  images: string[],
): void {
  if (images.length === 0) return

  view.dispatch({
    changes: rawImageInsertion(view.state.doc, target, images),
    userEvent: 'input.drop',
  })
}

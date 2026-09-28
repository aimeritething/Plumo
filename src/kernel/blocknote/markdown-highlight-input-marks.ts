import type { MarkType } from '@tiptap/pm/model'
import {
  DEFAULT_MARKDOWN_HIGHLIGHT_COLOR,
  MARKDOWN_HIGHLIGHT_STYLE,
} from '@/kernel/markdown/markdown-highlight-markdown'
import type { MarkdownHighlightInputReplacement } from './markdown-highlight-input-replacement'
import type { RichEditorInputView } from './rich-editor-input-transform'

type EditorViewLike = RichEditorInputView

function readMarkType(view: EditorViewLike, name: string): MarkType | null {
  return (Reflect.get(view.state.schema.marks, name) as MarkType | undefined) ?? null
}

// The cursor lands at the end of the new marks, and ProseMirror marks are
// inclusive there, so both are dropped from the stored marks: the next typed
// character starts plain, as it does after `**bold**`. Every step resets the
// stored marks, so the drops come after the last addMark.
export function addHighlightMarks(
  transaction: EditorViewLike['state']['tr'],
  view: EditorViewLike,
  replacement: MarkdownHighlightInputReplacement,
  from: number,
  to: number,
): EditorViewLike['state']['tr'] | null {
  const highlightMarkType = readMarkType(view, MARKDOWN_HIGHLIGHT_STYLE)
  if (!highlightMarkType) return null
  const backgroundColorMarkType = replacement.color === DEFAULT_MARKDOWN_HIGHLIGHT_COLOR
    ? null
    : readMarkType(view, 'backgroundColor')
  if (replacement.color !== DEFAULT_MARKDOWN_HIGHLIGHT_COLOR && !backgroundColorMarkType) return null

  transaction.addMark(from, to, highlightMarkType.create())
  if (backgroundColorMarkType) {
    transaction.addMark(from, to, backgroundColorMarkType.create({ stringValue: replacement.color }))
  }

  transaction.removeStoredMark(highlightMarkType)
  if (backgroundColorMarkType) transaction.removeStoredMark(backgroundColorMarkType)
  return transaction
}

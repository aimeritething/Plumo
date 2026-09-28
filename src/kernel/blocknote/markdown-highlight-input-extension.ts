import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  readMarkdownHighlightInputReplacement,
  type MarkdownHighlightCursorText,
} from './markdown-highlight-input-replacement'
import { caretIsInCode, rangeIsInCode } from './code-context'
import { addHighlightMarks } from './markdown-highlight-input-marks'
import {
  createRichEditorInputTransformExtension,
  type RichEditorInputView,
  type RichEditorInputTransform,
} from './rich-editor-input-transform'

const FINAL_MARKDOWN_HIGHLIGHT_INPUT = '='
const HARD_BREAK_NODE_TYPE = 'hardBreak'
// Stands in for an inline leaf (a wikilink, inline math) in the text the
// replacement scans, so its character offsets stay equal to document offsets.
const INLINE_LEAF_PLACEHOLDER = '\uFFFC'
type EditorViewLike = RichEditorInputView

export { readMarkdownHighlightInputReplacement } from './markdown-highlight-input-replacement'

function isInsertedFinalEquals(event: InputEvent): event is InputEvent & { data: string } {
  return event.inputType === 'insertText'
    && event.data === FINAL_MARKDOWN_HIGHLIGHT_INPUT
}

// A hard break reads as a newline, which the replacement refuses inside a
// highlight; any other leaf reads as one placeholder character, so the text
// stays position-for-position with the document.
function inlineLeafText(leaf: ProseMirrorNode): string {
  return leaf.type.name === HARD_BREAK_NODE_TYPE ? '\n' : INLINE_LEAF_PLACEHOLDER
}

function readCursorText(view: EditorViewLike): MarkdownHighlightCursorText | null {
  const { from, to, $from } = view.state.selection
  if (from !== to) return null
  if (!$from.parent.isTextblock) return null

  return {
    beforeText: $from.parent.textBetween(0, $from.parentOffset, '', inlineLeafText),
    cursor: from,
    parentStart: from - $from.parentOffset,
  }
}

function replaceCompletedMarkdownHighlight(
  view: EditorViewLike,
): EditorViewLike['state']['tr'] | null {
  if (caretIsInCode(view.state)) return null

  const cursorText = readCursorText(view)
  if (!cursorText) return null

  const replacement = readMarkdownHighlightInputReplacement(cursorText)
  if (!replacement) return null
  if (rangeIsInCode(view.state, replacement.contentFrom, replacement.contentTo)) return null

  const openingLength = replacement.openingTo - replacement.openingFrom
  const highlightedFrom = replacement.contentFrom - openingLength
  const highlightedTo = replacement.contentTo - openingLength

  const transaction = view.state.tr
    .delete(replacement.closingFrom, replacement.closingTo)
    .delete(replacement.openingFrom, replacement.openingTo)

  return addHighlightMarks(
    transaction,
    view,
    replacement,
    highlightedFrom,
    highlightedTo,
  )?.scrollIntoView() ?? null
}

export function createMarkdownHighlightInputTransform(): RichEditorInputTransform {
  return {
    handleBeforeInput(event, { view }) {
      if (!isInsertedFinalEquals(event)) return null

      const transaction = replaceCompletedMarkdownHighlight(view)
      if (!transaction) return null

      return { preventDefault: true, transaction }
    },
  }
}

export const createMarkdownHighlightInputExtension = createRichEditorInputTransformExtension({
  createTransforms: () => [createMarkdownHighlightInputTransform()],
  key: 'markdownHighlightInput',
})

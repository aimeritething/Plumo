import { resolveArrowLigatureInput } from '@/kernel/markdown/arrow-ligatures'
import { caretIsInCode } from './code-context'
import {
  createRichEditorInputTransformExtension,
  type RichEditorInputTransaction,
  type RichEditorInputTransform,
  type RichEditorInputView,
} from './rich-editor-input-transform'

const PREFIX_CONTEXT_LENGTH = 2

interface ArrowLigatureTransactionArgs {
  event: InputEvent & { data: string }
  literalAsciiCursor: number | null
  view: RichEditorInputView
}

interface ArrowLigatureTransactionResult {
  nextLiteralAsciiCursor: number | null
  transaction: RichEditorInputTransaction | null
}

function isInsertedCharacter(event: InputEvent): event is InputEvent & { data: string } {
  return event.inputType === 'insertText' && typeof event.data === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function getWritableCursor(selection: { from?: unknown; to?: unknown }): number | null {
  const { from, to } = selection
  if (!isFiniteNumber(from) || !isFiniteNumber(to)) return null

  return from === to ? from : null
}

function withoutTransaction(
  nextLiteralAsciiCursor: number | null,
): ArrowLigatureTransactionResult {
  return { nextLiteralAsciiCursor, transaction: null }
}

function buildArrowLigatureTransaction({
  event,
  literalAsciiCursor,
  view,
}: ArrowLigatureTransactionArgs): ArrowLigatureTransactionResult {
  try {
    const { state } = view
    const { selection } = state
    const from = getWritableCursor(selection)
    if (from === null) return withoutTransaction(literalAsciiCursor)
    if (caretIsInCode(state)) return withoutTransaction(null)

    const beforeText = state.doc.textBetween(
      Math.max(0, from - PREFIX_CONTEXT_LENGTH),
      from,
      '',
      '',
    )
    const resolution = resolveArrowLigatureInput({
      beforeText,
      cursor: from,
      inputText: event.data,
      literalAsciiCursor,
    })
    if (!resolution.change) return withoutTransaction(resolution.nextLiteralAsciiCursor)

    return {
      nextLiteralAsciiCursor: resolution.nextLiteralAsciiCursor,
      transaction: state.tr.insertText(
        resolution.change.insert,
        resolution.change.from,
        resolution.change.to,
      ),
    }
  } catch {
    return withoutTransaction(null)
  }
}

export function createArrowLigatureInputTransform(): RichEditorInputTransform {
  let literalAsciiCursor: number | null = null

  return {
    handleBeforeInput(event, { view }) {
      if (!isInsertedCharacter(event)) return null

      const result = buildArrowLigatureTransaction({ event, literalAsciiCursor, view })
      literalAsciiCursor = result.nextLiteralAsciiCursor
      if (result.transaction === null) return null

      return {
        ignoreDispatchError: true,
        onDispatchError: () => {
          literalAsciiCursor = null
        },
        preventDefault: true,
        transaction: result.transaction,
      }
    },
    reset() {
      literalAsciiCursor = null
    },
  }
}

export const createArrowLigaturesExtension = createRichEditorInputTransformExtension({
  createTransforms: () => [createArrowLigatureInputTransform()],
  key: 'arrow-ligatures',
})

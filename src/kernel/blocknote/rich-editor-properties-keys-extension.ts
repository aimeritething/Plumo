import { createExtension } from '@blocknote/core'
import {
  consumeKeyboardEvent,
  createCaptureKeydownMount,
  isComposingKeyboardEvent,
  type RichEditorView,
} from './rich-editor-keyboard'

/**
 * ↑ on the body's first line goes up into Properties, the way it would go up
 * a line in Raw mode. The Kernel does not know Properties: it asks over a
 * window event, cancelled by whoever took the caret.
 */
export const RICH_EDITOR_FOCUS_LAST_PROPERTY_EVENT = 'plumo:rich-editor-focus-last-property'

type FocusLastPropertyDetail = { source: object }
type KeysEditor = Parameters<typeof createCaptureKeydownMount>[0] & { isEditable?: boolean }

/** Asks Properties to take the caret; true when something did. */
function askForLastProperty(source: object): boolean {
  const event = new CustomEvent<FocusLastPropertyDetail>(RICH_EDITOR_FOCUS_LAST_PROPERTY_EVENT, {
    cancelable: true,
    detail: { source },
  })
  window.dispatchEvent(event)
  return event.defaultPrevented
}

/** Answers `source`'s ask with `focusLast`, which says whether it took the caret. */
export function subscribeRichEditorFocusLastProperty(source: object, focusLast: () => boolean): () => void {
  const handle = (event: Event) => {
    if (!(event instanceof CustomEvent) || event.detail?.source !== source) return
    if (focusLast()) event.preventDefault()
  }
  window.addEventListener(RICH_EDITOR_FOCUS_LAST_PROPERTY_EVENT, handle)
  return () => window.removeEventListener(RICH_EDITOR_FOCUS_LAST_PROPERTY_EVENT, handle)
}

/** Whether the caret sits on the first line of the Document's first textblock, where ↑ has nowhere left to go. */
function isOnFirstLine(view: RichEditorView): boolean {
  const { selection, doc } = view.state
  if (!selection.empty) return false
  let firstTextblockStart: number | null = null
  doc.descendants((node, position) => {
    if (firstTextblockStart !== null) return false
    if (node.isTextblock) {
      firstTextblockStart = position
      return false
    }
    return true
  })
  if (firstTextblockStart === null || selection.$from.before() !== firstTextblockStart) return false
  return view.endOfTextblock('up')
}

export const createRichEditorPropertiesKeysExtension = createExtension(({ editor }) => {
  const keysEditor = editor as KeysEditor
  return {
    key: 'richEditorPropertiesKeys',
    mount: createCaptureKeydownMount(keysEditor, (event, view) => {
      if (!view || event.key !== 'ArrowUp') return
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return
      if (keysEditor.isEditable === false || isComposingKeyboardEvent(event, view)) return
      if (!isOnFirstLine(view) || !askForLastProperty(editor)) return
      consumeKeyboardEvent(event)
    }),
  } as const
})

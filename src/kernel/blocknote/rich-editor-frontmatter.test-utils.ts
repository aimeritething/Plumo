import { Schema } from '@tiptap/pm/model'
import { EditorState, type Plugin, type Transaction } from '@tiptap/pm/state'
import { history } from '@tiptap/pm/history'
import { createRichEditorFrontmatterExtension } from './rich-editor-frontmatter'

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'text*', toDOM: () => ['p', 0] },
    text: {},
  },
})

function frontmatterPlugin(source: object): Plugin {
  const extension = createRichEditorFrontmatterExtension()({ editor: source } as never)
  return extension.prosemirrorPlugins?.[0] as Plugin
}

type TransactionListener = () => void

/**
 * A view stand-in with the Frontmatter plugin: enough state and dispatch for
 * the helpers, the plugin's view hook driven by hand, and each transaction
 * reported the way TipTap does, for a reader that subscribes to them.
 */
export function createEditor() {
  const listeners = new Set<TransactionListener>()
  const editor = {
    _tiptapEditor: {
      on: (_event: 'transaction', callback: TransactionListener) => { listeners.add(callback) },
      off: (_event: 'transaction', callback: TransactionListener) => { listeners.delete(callback) },
    },
  } as {
    prosemirrorState: EditorState
    prosemirrorView: { state: EditorState; dispatch: (tr: Transaction) => void }
    _tiptapEditor: {
      on: (event: 'transaction', callback: TransactionListener) => void
      off: (event: 'transaction', callback: TransactionListener) => void
    }
  }
  const plugin = frontmatterPlugin(editor)
  let state = EditorState.create({ schema, plugins: [history(), plugin] })
  const pluginView = plugin.spec.view?.({ state } as never)
  const dispatch = (tr: Transaction) => {
    const previous = state
    state = state.apply(tr)
    pluginView?.update?.({ state } as never, previous)
    listeners.forEach((listener) => listener())
  }
  Object.defineProperty(editor, 'prosemirrorState', { get: () => state })
  editor.prosemirrorView = {
    get state() { return state },
    dispatch,
  }
  return {
    editor,
    state: () => state,
    run: (command: (state: EditorState, dispatch: (tr: Transaction) => void) => boolean) => command(state, dispatch),
    typeText: (text: string) => dispatch(state.tr.insertText(text, 1)),
  }
}

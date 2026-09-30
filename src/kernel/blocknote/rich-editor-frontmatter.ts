import { createExtension } from '@blocknote/core'
import { closeHistory } from '@tiptap/pm/history'
import type { Node as ProsemirrorNode, Schema } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Step, StepMap, StepResult } from '@tiptap/pm/transform'
import { dispatchRichEditorExternalChange } from './editor-external-change-events'

/**
 * The Frontmatter while Rich mode shows a Document. BlockNote holds only the
 * body, so an edit to a Property goes into the editor as a step of its own: it
 * leaves the blocks alone but sits in the same Undo history as the body, and
 * fires the same change that Autosave serializes.
 *
 * The plugin keeps the Frontmatter the last such step set, with the path of
 * the Document it was set for. A content swap (another Tab, a reload, the way
 * back from Raw) resets it, and until the next Property edit the Tab's own
 * bytes are the Frontmatter, which is why a reader passes those in.
 */

interface RichFrontmatter {
  path: string
  text: string
}

const STEP_ID = 'plumoFrontmatter'
const pluginKey = new PluginKey<RichFrontmatter | null>('rich-editor-frontmatter')
/** Set on a transaction that swaps the editor's content: what it held no longer describes the Document shown. */
export const RICH_FRONTMATTER_RESET_META = 'plumoFrontmatterReset'

class FrontmatterStep extends Step {
  readonly path: string
  readonly before: string
  readonly after: string

  constructor(path: string, before: string, after: string) {
    super()
    this.path = path
    this.before = before
    this.after = after
  }

  apply(doc: ProsemirrorNode): StepResult {
    return StepResult.ok(doc)
  }

  getMap(): StepMap {
    return StepMap.empty
  }

  invert(): Step {
    return new FrontmatterStep(this.path, this.after, this.before)
  }

  map(): Step {
    return this
  }

  toJSON() {
    return { stepType: STEP_ID, path: this.path, before: this.before, after: this.after }
  }

  static fromJSON(_schema: Schema, json: { path: string; before: string; after: string }): FrontmatterStep {
    return new FrontmatterStep(json.path, json.before, json.after)
  }
}

try {
  Step.jsonID(STEP_ID, FrontmatterStep)
} catch {
  // Already registered by an earlier copy of this module (a hot reload).
}

function nextState(value: RichFrontmatter | null, tr: Transaction): RichFrontmatter | null {
  let next = tr.getMeta(RICH_FRONTMATTER_RESET_META) ? null : value
  for (const step of tr.steps) {
    if (step instanceof FrontmatterStep) next = { path: step.path, text: step.after }
  }
  return next
}

/**
 * TipTap reports a change only when the blocks change, and a Frontmatter step
 * leaves them alone; so when one lands (an edit, its Undo, its Redo) the
 * editor's change is announced on the external channel, which is what
 * Autosave listens to as well.
 */
export const createRichEditorFrontmatterExtension = createExtension(({ editor }) => ({
  key: 'rich-editor-frontmatter',
  prosemirrorPlugins: [
    new Plugin<RichFrontmatter | null>({
      key: pluginKey,
      state: {
        init: () => null,
        apply: (tr, value) => nextState(value, tr),
      },
      view: () => ({
        update: (view, previous) => {
          const next = pluginKey.getState(view.state)
          if (next === null || next === pluginKey.getState(previous)) return
          dispatchRichEditorExternalChange(editor)
        },
      }),
    }),
  ],
}))

/** The Frontmatter a Property edit last set for `path`, or null when the Tab's bytes still say what it is. */
export function richFrontmatterFromState(state: EditorState, path: string): string | null {
  const value = pluginKey.getState(state)
  return value && value.path === path ? value.text : null
}

interface EditorWithState {
  prosemirrorState?: EditorState
}

/** The same, read from a BlockNote editor; one without the plugin (a test double) has none. */
export function richEditorFrontmatter(editor: unknown, path: string | undefined): string | null {
  if (!path) return null
  try {
    const state = (editor as EditorWithState).prosemirrorState
    return state ? richFrontmatterFromState(state, path) : null
  } catch {
    return null
  }
}

interface EditorView {
  state: EditorState
  dispatch: (tr: Transaction) => void
}

interface EditorWithView {
  prosemirrorView?: EditorView
}

/** The editor's view, or none while BlockNote is not mounted. */
function viewOf(editor: unknown): EditorView | null {
  try {
    return (editor as EditorWithView).prosemirrorView ?? null
  } catch {
    return null
  }
}

/** Drops what the last Property edit set, off the Undo history: the Tab's bytes say what the Frontmatter is again. */
export function resetRichEditorFrontmatter(editor: unknown): void {
  const view = viewOf(editor)
  if (!view) return
  view.dispatch(view.state.tr.setMeta(RICH_FRONTMATTER_RESET_META, true).setMeta('addToHistory', false))
}

/**
 * Puts a Property edit into the editor as one Undo step, its own: the history
 * is closed on both sides so neither the keystrokes before nor the ones after
 * join it.
 */
export function setRichEditorFrontmatter(editor: unknown, path: string, before: string, after: string): void {
  if (before === after) return
  const view = viewOf(editor)
  if (!view) return
  view.dispatch(closeHistory(view.state.tr.step(new FrontmatterStep(path, before, after))))
  view.dispatch(closeHistory(view.state.tr))
}

import { createExtension } from '@blocknote/core'
import { FilePanelExtension, FormattingToolbarExtension, LinkToolbarExtension, SuggestionMenu } from '@blocknote/core/extensions'
import type { Node as ProsemirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { RichEditor } from './block-note-dom'
import { expandSectionsHidingBlock } from './collapsed-sections'
import { clampEditorFindIndex, findEditorMatches, type EditorFindOptions } from './editor-find'
import { richEditorBlockSelectionPluginKey } from './rich-editor-block-selection-extension'
import { isComposingKeyboardEvent } from './rich-editor-keyboard'

/**
 * Find in the current Document, Rich mode (⌘F works in both modes). Raw
 * mode has the kernel's CodeMirror find bar; Rich mode has nothing
 * carried, so this is new Plumo code: the matcher walks the ProseMirror
 * document one textblock at a time and a plugin decorates the matches. The
 * query semantics (case, regex, the safe-regex guard) are the Raw bar's, from
 * `editorFind`, so both surfaces read a query the same way.
 */

export interface RichFindMatch {
  from: number
  to: number
}

export interface RichFindQuery {
  query: string
  options: EditorFindOptions
  /** Which match is the current one; clamped to the matches that exist. */
  activeIndex: number
}

export interface RichFindPluginState extends RichFindQuery {
  matches: RichFindMatch[]
  error: string | null
  decorations: DecorationSet
}

export interface RichFindResult {
  matches: RichFindMatch[]
  error: string | null
}

export const richFindPluginKey = new PluginKey<RichFindPluginState>('plumoRichEditorFind')

export const RICH_FIND_MATCH_CLASS = 'plumo-rich-find-match'
export const RICH_FIND_ACTIVE_MATCH_CLASS = 'plumo-rich-find-match--active'

/**
 * Stands in for an inline node that is not text (an image, an inline math
 * node), one placeholder per position it occupies, so string offsets in a
 * textblock stay equal to document offsets and no query can match through it.
 */
const INLINE_LEAF_PLACEHOLDER = '￼'

const NO_QUERY: RichFindQuery = { query: '', options: { caseSensitive: false, regex: false }, activeIndex: 0 }

function textblockText(node: ProsemirrorNode): string {
  let text = ''
  node.forEach((child) => {
    text += child.isText ? child.text ?? '' : INLINE_LEAF_PLACEHOLDER.repeat(child.nodeSize)
  })
  return text
}

/** Every match of `query` in the document's textblocks, in document order, as positions. */
export function collectRichFindMatches(doc: ProsemirrorNode, query: string, options: EditorFindOptions): RichFindResult {
  if (query.length === 0) return { matches: [], error: null }
  const matches: RichFindMatch[] = []
  let error: string | null = null
  doc.descendants((node, pos) => {
    if (error !== null) return false
    if (!node.isTextblock) return true
    const result = findEditorMatches(textblockText(node), query, options)
    if (result.error) {
      error = result.error
      return false
    }
    // Positions inside a textblock are its opening position plus one, plus the offset.
    const contentStart = pos + 1
    for (const match of result.matches) {
      if (match.text.includes(INLINE_LEAF_PLACEHOLDER)) continue
      matches.push({ from: contentStart + match.from, to: contentStart + match.to })
    }
    return false
  })
  return error === null ? { matches, error: null } : { matches: [], error }
}

function decorate(doc: ProsemirrorNode, matches: readonly RichFindMatch[], activeIndex: number): DecorationSet {
  if (matches.length === 0) return DecorationSet.empty
  return DecorationSet.create(doc, matches.map((match, index) => {
    const active = index === activeIndex
    const className = active ? `${RICH_FIND_MATCH_CLASS} ${RICH_FIND_ACTIVE_MATCH_CLASS}` : RICH_FIND_MATCH_CLASS
    return Decoration.inline(match.from, match.to, { class: className }, { active })
  }))
}

function computeState(doc: ProsemirrorNode, request: RichFindQuery): RichFindPluginState {
  const { matches, error } = collectRichFindMatches(doc, request.query, request.options)
  const activeIndex = clampEditorFindIndex(request.activeIndex, matches.length)
  return { ...request, activeIndex, matches, error, decorations: decorate(doc, matches, activeIndex) }
}

const EMPTY_STATE: RichFindPluginState = { ...NO_QUERY, matches: [], error: null, decorations: DecorationSet.empty }

/** Ask the plugin to search for `request`; an empty query clears the highlights. */
export function setRichFindState(tr: Transaction, request: RichFindQuery): Transaction {
  return tr.setMeta(richFindPluginKey, request)
}

export function richFindDecorations(state: EditorState): DecorationSet {
  return richFindPluginKey.getState(state)?.decorations ?? DecorationSet.empty
}

/** Whether a find is live in this state: a query is set, whatever it matches. */
export function isRichFindActive(state: EditorState): boolean {
  return (richFindPluginKey.getState(state)?.query.length ?? 0) > 0
}

/** The BlockNote block a position is in: the nearest node above it that carries an id. */
function blockIdAt(doc: ProsemirrorNode, pos: number): string | null {
  const $pos = doc.resolve(pos)
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    const id: unknown = $pos.node(depth).attrs.id
    if (typeof id === 'string') return id
  }
  return null
}

/**
 * Put a match in front of the reader: open the collapsed sections it sits
 * under (a match counted but under `display: none` cannot be scrolled to),
 * select it, and bring it to the middle of the view. The middle, because the
 * find bar is sticky over the top of the scroll area and ProseMirror's own
 * scrollIntoView stops at the edge, under the bar.
 */
export function revealRichFindMatch(editor: unknown, view: EditorView, match: RichFindMatch) {
  const blockId = blockIdAt(view.state.doc, match.from)
  if (blockId && isBlockEditor(editor)) expandSectionsHidingBlock(editor, blockId)

  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)))

  const { node } = view.domAtPos(match.from)
  const element = node instanceof Element ? node : node.parentElement
  element?.scrollIntoView({ block: 'center' })
}

/** What `isRichFindEscape` asks of the BlockNote editor: its overlays, when it has them. */
export type RichFindOverlayOwner = Partial<Pick<RichEditor, 'getExtension'>>

function isPlainEscape(event: KeyboardEvent): boolean {
  return event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey
}

/** A menu or toolbar over the Rich body that Esc closes: the slash and emoji menus, the formatting and link toolbars, the file panel. */
function hasOpenOverlay(editor: RichFindOverlayOwner): boolean {
  const extension = editor.getExtension?.bind(editor)
  if (!extension) return false
  return Boolean(
    extension(SuggestionMenu)?.shown()
    || extension(FormattingToolbarExtension)?.store.state
    || extension(FilePanelExtension)?.store.state
    || extension(LinkToolbarExtension)?.getLinkAtSelection(),
  )
}

/**
 * Whether an Esc typed in the Rich body is the find bar's, to close it. Esc
 * has other meanings there, and each comes first: the input method's (it
 * cancels a candidate), an open menu or toolbar's (it closes), a block
 * selection's (it clears). Only an Esc from the caret itself is left, which
 * would otherwise select the caret's block. A key in an input inside the
 * Document (a math block's source) is that input's.
 */
export function isRichFindEscape(editor: RichFindOverlayOwner, view: EditorView, event: KeyboardEvent): boolean {
  if (!isPlainEscape(event) || isComposingKeyboardEvent(event, view)) return false
  if (event.target !== view.dom) return false
  if (richEditorBlockSelectionPluginKey.getState(view.state)) return false
  return !hasOpenOverlay(editor)
}

function isBlockEditor(editor: unknown): editor is RichEditor {
  return typeof editor === 'object' && editor !== null && Array.isArray((editor as { document?: unknown }).document)
}

/**
 * The plugin: recomputes on every request and on every edit while a query is
 * live, so the highlights follow the text rather than drifting with it.
 */
export function createRichEditorFindPlugin(): Plugin<RichFindPluginState> {
  return new Plugin<RichFindPluginState>({
    key: richFindPluginKey,
    state: {
      init: () => EMPTY_STATE,
      apply(tr, previous) {
        const request = tr.getMeta(richFindPluginKey) as RichFindQuery | undefined
        if (request) return request.query.length === 0 ? EMPTY_STATE : computeState(tr.doc, request)
        if (tr.docChanged && previous.query.length > 0) return computeState(tr.doc, previous)
        return previous
      },
    },
    props: {
      decorations: (state) => richFindDecorations(state),
    },
  })
}

/** The BlockNote extension that mounts the plugin into the Rich editor. */
export const createRichEditorFindExtension = createExtension(() => ({
  key: 'plumoRichEditorFind',
  prosemirrorPlugins: [createRichEditorFindPlugin()],
}))

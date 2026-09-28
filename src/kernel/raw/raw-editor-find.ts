import { StateEffect, StateField, type EditorState, type Extension } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view'
import { clampEditorFindIndex, findEditorMatches, type EditorFindOptions } from '@/kernel/blocknote/editor-find'

/**
 * Find's highlights in Raw mode, the counterpart of the Rich find plugin: the
 * find bar says what it is looking for and which match is current, and this
 * field decorates every match, the current one distinctly. The current match
 * is also CodeMirror's selection, but CodeMirror draws no selection while the
 * focus is in the find bar's input, so without these the reader sees nothing.
 * Recomputed on every edit while a query is live, so the highlights follow
 * the text.
 */

export interface RawFindQuery {
  query: string
  options: EditorFindOptions
  /** Which match is current; clamped to the matches that exist. */
  activeIndex: number
}

interface RawFindState extends RawFindQuery {
  decorations: DecorationSet
}

export const RAW_FIND_MATCH_CLASS = 'plumo-raw-find-match'
export const RAW_FIND_ACTIVE_MATCH_CLASS = 'plumo-raw-find-match--active'

const MATCH = Decoration.mark({ class: RAW_FIND_MATCH_CLASS })
const ACTIVE_MATCH = Decoration.mark({ class: `${RAW_FIND_MATCH_CLASS} ${RAW_FIND_ACTIVE_MATCH_CLASS}` })

/** Ask for `query` to be highlighted; an empty query clears the highlights. */
export const setRawFindQuery = StateEffect.define<RawFindQuery>()

const NO_FIND: RawFindState = {
  query: '',
  options: { caseSensitive: false, regex: false },
  activeIndex: 0,
  decorations: Decoration.none,
}

function computeRawFind(state: EditorState, request: RawFindQuery): RawFindState {
  if (request.query.length === 0) return NO_FIND
  const { matches } = findEditorMatches(state.doc.toString(), request.query, request.options)
  const activeIndex = clampEditorFindIndex(request.activeIndex, matches.length)
  // Never an empty match: the matcher refuses a regex that matches no text.
  const decorations = Decoration.set(
    matches.map((match, index) => (index === activeIndex ? ACTIVE_MATCH : MATCH).range(match.from, match.to)),
  )
  return { ...request, activeIndex, decorations }
}

const rawFindField = StateField.define<RawFindState>({
  create: () => NO_FIND,
  update(previous, tr) {
    let next = previous
    for (const effect of tr.effects) {
      if (effect.is(setRawFindQuery)) next = computeRawFind(tr.state, effect.value)
    }
    if (next === previous && tr.docChanged && previous.query.length > 0) next = computeRawFind(tr.state, previous)
    return next
  },
  provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
})

export function rawFindDecorations(state: EditorState): DecorationSet {
  return state.field(rawFindField, false)?.decorations ?? Decoration.none
}

/** Every match tinted, the current one stronger: the colours of Rich mode's find. */
const rawFindTheme = EditorView.theme({
  [`.${RAW_FIND_MATCH_CLASS}`]: {
    borderRadius: 'var(--radius-sm)',
    backgroundColor: 'var(--chroma-yellow-bg)',
    boxShadow: '0 0 0 1px var(--chroma-yellow-bg)',
  },
  [`.${RAW_FIND_ACTIVE_MATCH_CLASS}`]: {
    backgroundColor: 'color-mix(in srgb, var(--chroma-orange) 38%, transparent)',
    boxShadow: '0 0 0 1px color-mix(in srgb, var(--chroma-orange) 38%, transparent)',
  },
})

export function rawFindHighlights(): Extension {
  return [rawFindField, rawFindTheme]
}

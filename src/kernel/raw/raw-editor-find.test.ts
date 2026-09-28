import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import {
  RAW_FIND_ACTIVE_MATCH_CLASS,
  RAW_FIND_MATCH_CLASS,
  rawFindDecorations,
  rawFindHighlights,
  setRawFindQuery,
} from './raw-editor-find'

const OPTIONS = { caseSensitive: false, regex: false }

function highlighted(state: EditorState): { text: string; className: string }[] {
  const found: { text: string; className: string }[] = []
  rawFindDecorations(state).between(0, state.doc.length, (from, to, decoration) => {
    found.push({ text: state.sliceDoc(from, to), className: String(decoration.spec.class) })
  })
  return found
}

describe('rawFindHighlights', () => {
  const start = () => EditorState.create({ doc: 'Alpha beta alpha', extensions: rawFindHighlights() })

  it('highlights every match and the current one distinctly', () => {
    const state = start().update({ effects: setRawFindQuery.of({ query: 'alpha', options: OPTIONS, activeIndex: 1 }) }).state

    expect(highlighted(state)).toEqual([
      { text: 'Alpha', className: RAW_FIND_MATCH_CLASS },
      { text: 'alpha', className: `${RAW_FIND_MATCH_CLASS} ${RAW_FIND_ACTIVE_MATCH_CLASS}` },
    ])
  })

  it('follows an edit, and clears on an empty query', () => {
    let state = start().update({ effects: setRawFindQuery.of({ query: 'alpha', options: OPTIONS, activeIndex: 0 }) }).state
    state = state.update({ changes: { from: 0, to: 5, insert: 'Gamma' } }).state
    expect(highlighted(state)).toEqual([{ text: 'alpha', className: `${RAW_FIND_MATCH_CLASS} ${RAW_FIND_ACTIVE_MATCH_CLASS}` }])

    state = state.update({ effects: setRawFindQuery.of({ query: '', options: OPTIONS, activeIndex: 0 }) }).state
    expect(highlighted(state)).toEqual([])
  })

  it('highlights nothing for a regex that does not compile', () => {
    const state = start().update({ effects: setRawFindQuery.of({ query: 'a(', options: { caseSensitive: false, regex: true }, activeIndex: 0 }) }).state

    expect(highlighted(state)).toEqual([])
  })
})

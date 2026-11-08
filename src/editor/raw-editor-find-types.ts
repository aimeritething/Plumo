import type { EditorView } from '@codemirror/view'
import type { MutableRefObject, RefObject } from 'react'
import type { AppLocale } from '@/lib/i18n'
import type { EditorFindMatch } from '@/kernel/blocknote/editor-find'
import type { EditorFindSession } from './editor-find-session'

export interface RawEditorFindRequest {
  id: number
  path: string
  replace: boolean
}

export interface RawEditorFindBarProps {
  doc: string
  /** Open or not, and the query: the editor pane's, so a switch to Rich mode and back keeps them. */
  find: EditorFindSession
  locale?: AppLocale
  onReplaceOpenChange: (open: boolean) => void
  path: string
  replaceOpen: boolean
  request?: RawEditorFindRequest | null
  viewRef: MutableRefObject<EditorView | null>
}

export interface ActiveEditorFindMatchSelection {
  activeMatch?: EditorFindMatch
  open: boolean
  viewRef: MutableRefObject<EditorView | null>
}

/** What the Raw bar's search hands the shared `FindBar`. */
export interface RawEditorFindController {
  caseSensitive: boolean
  changeQuery: (value: string) => void
  close: () => void
  currentIndex: number
  error: string | null
  findInputRef: RefObject<HTMLInputElement | null>
  matchCount: number
  moveNext: () => void
  movePrevious: () => void
  query: string
  regex: boolean
  replaceAll: () => void
  /** The Replace button hands the focus to the editor; ↵ in the replace input keeps it there. */
  replaceCurrent: (from: 'button' | 'enter') => void
  replacement: string
  setReplacement: (value: string) => void
  toggleCaseSensitive: () => void
  toggleRegex: () => void
}

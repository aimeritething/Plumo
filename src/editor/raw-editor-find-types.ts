import type { EditorView } from '@codemirror/view'
import type { ChangeEvent, KeyboardEvent, MutableRefObject, RefObject } from 'react'
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

export interface RawEditorFindController {
  caseSensitive: boolean
  close: () => void
  findInputRef: RefObject<HTMLInputElement | null>
  handleFindChange: (event: ChangeEvent<HTMLInputElement>) => void
  handleFindKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  hasMatches: boolean
  moveNext: () => void
  movePrevious: () => void
  query: string
  regex: boolean
  replaceAll: () => void
  replaceCurrent: () => void
  handleReplaceKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  replacement: string
  setReplacement: (value: string) => void
  status: string
  toggleCaseSensitive: () => void
  toggleRegex: () => void
}

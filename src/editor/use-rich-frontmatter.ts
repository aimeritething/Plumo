import { useCallback, useEffect, useSyncExternalStore } from 'react'
import type { EditorState } from '@tiptap/pm/state'
import { splitFrontmatter } from '@/kernel/markdown/wikilinks'
import {
  resetRichEditorFrontmatter,
  richFrontmatterFromState,
  setRichEditorFrontmatter,
} from '@/kernel/blocknote/rich-editor-frontmatter'

interface TransactionSource {
  on: (event: 'transaction', callback: () => void) => unknown
  off: (event: 'transaction', callback: () => void) => unknown
}

export interface FrontmatterEditor {
  prosemirrorState: EditorState
  _tiptapEditor: TransactionSource
}

/**
 * The Frontmatter Properties shows for the Document in Rich mode, and the way
 * an edit to it goes in. It is the one a Property edit last put into the
 * editor, or the Tab's own bytes until there is one. When the Tab's
 * Frontmatter changes to something the editor did not write (a reload, an
 * edit in Raw mode), the editor's copy is dropped and the Tab's bytes win.
 */
export function useRichFrontmatter(editor: FrontmatterEditor, path: string, tabContent: string) {
  const subscribe = useCallback((onChange: () => void) => {
    editor._tiptapEditor.on('transaction', onChange)
    return () => { editor._tiptapEditor.off('transaction', onChange) }
  }, [editor])
  const rich = useSyncExternalStore(subscribe, () => richFrontmatterFromState(editor.prosemirrorState, path))
  const [tabFrontmatter] = splitFrontmatter(tabContent)

  useEffect(() => {
    const current = richFrontmatterFromState(editor.prosemirrorState, path)
    if (current !== null && current !== tabFrontmatter) resetRichEditorFrontmatter(editor)
  }, [editor, path, tabFrontmatter])

  const frontmatter = rich ?? tabFrontmatter
  const commit = useCallback((next: string | null) => {
    if (next === null) return
    setRichEditorFrontmatter(editor, path, frontmatter, next)
  }, [editor, frontmatter, path])

  return { frontmatter, commit }
}

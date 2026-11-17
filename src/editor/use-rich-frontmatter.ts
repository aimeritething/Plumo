import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
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
 *
 * The Tab's bytes follow the editor through Autosave's debounced serialize,
 * so they can lag behind it by an edit or two: a Tab that shows a Frontmatter
 * the editor wrote earlier is catching up, not changing, and is left alone.
 */
export function useRichFrontmatter(editor: FrontmatterEditor, path: string, tabContent: string) {
  // Every Frontmatter a Property edit (or its Undo, or its Redo) has put into the editor since the Tab's bytes last won.
  const writtenRef = useRef(new Set<string>())
  const subscribe = useCallback((onChange: () => void) => {
    const record = () => {
      const text = richFrontmatterFromState(editor.prosemirrorState, path)
      if (text === null) writtenRef.current.clear()
      else writtenRef.current.add(text)
      onChange()
    }
    editor._tiptapEditor.on('transaction', record)
    return () => { editor._tiptapEditor.off('transaction', record) }
  }, [editor, path])
  const rich = useSyncExternalStore(subscribe, () => richFrontmatterFromState(editor.prosemirrorState, path))
  const [tabFrontmatter] = splitFrontmatter(tabContent)

  useEffect(() => {
    const current = richFrontmatterFromState(editor.prosemirrorState, path)
    if (current === null || current === tabFrontmatter || writtenRef.current.has(tabFrontmatter)) return
    writtenRef.current.clear()
    resetRichEditorFrontmatter(editor)
  }, [editor, path, tabFrontmatter])

  const frontmatter = rich ?? tabFrontmatter
  const commit = useCallback((next: string | null) => {
    if (next === null) return
    setRichEditorFrontmatter(editor, path, frontmatter, next)
  }, [editor, frontmatter, path])

  return { frontmatter, commit }
}

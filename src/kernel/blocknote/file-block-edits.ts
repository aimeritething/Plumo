import { useEditorState } from '@blocknote/react'
import type { BlockNoteEditor } from '@blocknote/core'
import { useCallback, useEffect, useRef, useState } from 'react'
import { dispatchRichEditorExternalChange } from './editor-external-change-events'
import { normalizeImageCaption, type CaptionEndReason } from './image-caption'
import { registerOpenBlockEdit } from './open-block-edits'
import { isStaleBlockReferenceError, reportRecoveredEditorTransformError } from './rich-editor-transform-error-recovery-extension'

// What every Block that shows a file (Image, Audio, Video, File) does to
// itself from its own controls: write its props, take the selection back,
// know whether it is selected, and hold the caption being typed in place.

/** The editor a file Block's view is given, as far as these edits need it. */
export interface FileBlockEditor {
  domElement?: HTMLElement | null
  isEditable: boolean
  focus(): void
  getBlock(id: string): unknown
  setTextCursorPosition(id: string): void
  updateBlock(id: string, update: { props: Record<string, unknown> }): unknown
}

export type FileBlockProps = Record<string, unknown>

interface SelectionLike {
  node?: { attrs?: Record<string, unknown> }
  $from?: { parent?: { attrs?: Record<string, unknown> } }
}

/** Whether the selection is a node selection of this Block (its container or its content). */
export function isBlockNodeSelected(selection: unknown, blockId: string): boolean {
  const candidate = selection as SelectionLike | null
  if (!candidate?.node) return false
  return candidate.node.attrs?.id === blockId || candidate.$from?.parent?.attrs?.id === blockId
}

/** Writes the Block's props as one change the Document hears; false when the Block is gone. */
export function updateFileBlockProps(editor: FileBlockEditor, blockId: string, props: FileBlockProps): boolean {
  try {
    if (!editor.getBlock(blockId)) return false
    editor.updateBlock(blockId, { props })
  } catch (error) {
    if (!isStaleBlockReferenceError(error)) throw error
    reportRecoveredEditorTransformError('stale_block_reference', error)
    return false
  }
  dispatchRichEditorExternalChange(editor, editor.domElement ?? undefined)
  return true
}

/** Gives the editor its focus back with the Block selected, as after a click on it. */
export function selectFileBlock(editor: FileBlockEditor, blockId: string) {
  try {
    if (!editor.getBlock(blockId)) return
    editor.setTextCursorPosition(blockId)
    editor.focus()
  } catch (error) {
    if (!isStaleBlockReferenceError(error)) throw error
  }
}

type AnyBlockNoteEditor = Parameters<typeof useEditorState>[0]['editor']

export function useFileBlockSelected(editor: object, blockId: string): boolean {
  return useEditorState({
    editor: editor as AnyBlockNoteEditor,
    selector: ({ editor }) => isBlockNodeSelected((editor as BlockNoteEditor).prosemirrorState.selection, blockId),
  }) ?? false
}

export function useHover() {
  const [hovered, setHovered] = useState(false)
  return {
    hovered,
    onMouseEnter: () => setHovered(true),
    onMouseLeave: () => setHovered(false),
  }
}

/** The caption edit: opened from the Block's toolbar or by clicking the caption, written once when it ends. */
export function useFileBlockCaptionEdit(editor: FileBlockEditor, blockId: string, caption: string) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(caption)
  const editingRef = useRef(false)
  const draftRef = useRef(caption)

  const end = useCallback((reason: CaptionEndReason | 'flush') => {
    if (!editingRef.current) return
    editingRef.current = false
    setEditing(false)
    const next = normalizeImageCaption(draftRef.current)
    if (next !== caption) updateFileBlockProps(editor, blockId, { caption: next })
    if (reason === 'key') selectFileBlock(editor, blockId)
  }, [blockId, caption, editor])

  useEffect(() => {
    if (!editing) return
    return registerOpenBlockEdit(editor, () => end('flush'))
  }, [editing, editor, end])

  return {
    draft,
    editing,
    end,
    setDraft: (next: string) => {
      draftRef.current = next
      setDraft(next)
    },
    start: () => {
      if (!editor.isEditable) return
      draftRef.current = caption
      setDraft(caption)
      editingRef.current = true
      setEditing(true)
    },
  }
}

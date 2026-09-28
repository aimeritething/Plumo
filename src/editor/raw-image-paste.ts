import { useEffect, useRef, type MutableRefObject, type RefObject } from 'react'
import type { EditorView } from '@codemirror/view'
import { pasteTakesClipboardFiles } from '@/kernel/blocknote/rich-editor-paste'
import { uploadEditorImage } from './editor-image-upload'
import { pasteRawImages, rawImageMarkdown, type RawImageRange } from './raw-image-insertion'
import { imageUrlFromUploadResult, isImageLikeFile, type ImageImportErrorHandler } from './use-image-drop'

interface UseRawImagePasteOptions {
  /** The directory whose `attachments/` a pasted image is saved into: the Document's own. */
  attachmentVaultPath?: string
  /** The CodeMirror host: a paste into the editor inside it passes through it first. */
  containerRef: RefObject<HTMLDivElement | null>
  onImageImportError?: ImageImportErrorHandler
  pathRef: MutableRefObject<string>
  /** The Folder, which the Markdown written for the image is made portable against. */
  vaultPath?: string
  viewRef: MutableRefObject<EditorView | null>
}

/**
 * The image files of a paste, in clipboard order, when the paste is its
 * files at all: a clipboard with text on it pastes the text, in Raw mode as
 * in Rich mode, and CodeMirror does that unchanged.
 */
function clipboardImageFiles(clipboardData: DataTransfer | null): File[] {
  if (!clipboardData || !pasteTakesClipboardFiles(clipboardData)) return []

  const items = Array.from(clipboardData.items ?? [])
  const files = items.length > 0
    ? items.flatMap((item) => {
      const file = item.kind === 'file' ? item.getAsFile() : null
      return file ? [file] : []
    })
    : Array.from(clipboardData.files)
  return files.filter(isImageLikeFile)
}

/**
 * The saves take a moment. The image lines go where the paste was made if the
 * Document has not changed since; if it has (typed into meanwhile), they go at
 * the caret, and take nothing a newer selection holds.
 */
function placeForImages(view: EditorView, pastedInto: EditorView['state']): RawImageRange {
  if (view.state.doc === pastedInto.doc) return pastedInto.selection.main

  const { head } = view.state.selection.main
  return { from: head, to: head }
}

/**
 * An image pasted into the Raw editor becomes an Attachment exactly as a Rich
 * mode paste does, through BlockNote's `uploadFile` path: the same
 * `save_image` into `attachments/` beside the Document, named the same, with
 * the same toasts for one that does not land. Its line goes in at the caret,
 * written as Rich mode writes the image block, once every save has settled,
 * as one edit in clipboard order.
 */
export function useRawImagePaste({
  attachmentVaultPath,
  containerRef,
  onImageImportError,
  pathRef,
  vaultPath,
  viewRef,
}: UseRawImagePasteOptions): void {
  const latest = useRef({ attachmentVaultPath, onImageImportError, vaultPath })
  useEffect(() => {
    latest.current = { attachmentVaultPath, onImageImportError, vaultPath }
  }, [attachmentVaultPath, onImageImportError, vaultPath])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // Captured on the host, before CodeMirror's own paste handler on its content.
    const handlePaste = (event: ClipboardEvent) => {
      const view = viewRef.current
      const files = clipboardImageFiles(event.clipboardData)
      if (!view || files.length === 0) return

      event.preventDefault()
      event.stopPropagation()
      const pastedInto = view.state
      const { attachmentVaultPath: directory, onImageImportError: onError, vaultPath: folder } = latest.current
      const saves = files.map((file) => uploadEditorImage(file, directory ?? folder, onError).then(
        imageUrlFromUploadResult,
        // Already said in a toast by `uploadEditorImage`.
        () => '',
      ))
      void Promise.all(saves).then((urls) => {
        const landed = urls.filter(Boolean)
        // The Tab left, or its editor was remade: the paste went to a view that is gone.
        if (landed.length === 0 || viewRef.current !== view) return

        const images = landed.map((url) => rawImageMarkdown(url, folder, pathRef.current))
        pasteRawImages(view, images, placeForImages(view, pastedInto))
      })
    }

    container.addEventListener('paste', handlePaste, true)
    return () => container.removeEventListener('paste', handlePaste, true)
  }, [containerRef, pathRef, viewRef])
}

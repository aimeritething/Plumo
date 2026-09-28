import {
  copyFailedImportError,
  emptyImageUploadResult,
  imageUrlFromUploadResult,
  isUnsupportedImageFormatError,
  uploadImageFile,
  type ImageImportErrorHandler,
  type UploadImageFileResult,
} from './use-image-drop'

/**
 * BlockNote's `uploadFile`: the file behind a ⌘V or a drop the editor handled
 * itself becomes an Attachment beside the Document, and the image block points
 * at its asset URL.
 *
 * A format the kernel cannot import leaves the block empty, and a copy that
 * fails still rejects so the file panel can show it; either way
 * `onImageImportError` hears why, which is what the toast says.
 */
export async function uploadEditorImage(
  file: File,
  vaultPath: string | undefined,
  onImageImportError?: ImageImportErrorHandler,
): Promise<UploadImageFileResult> {
  let result: UploadImageFileResult
  try {
    result = await uploadImageFile(file, vaultPath)
  } catch (error) {
    if (!isUnsupportedImageFormatError(error)) {
      onImageImportError?.(copyFailedImportError(file.name))
      throw error
    }

    console.warn('[editor] Unsupported image format:', error.message)
    onImageImportError?.(error)
    return emptyImageUploadResult(file)
  }
  // An unreadable file comes back empty rather than as a rejection.
  if (!imageUrlFromUploadResult(result)) onImageImportError?.(copyFailedImportError(file.name))
  return result
}

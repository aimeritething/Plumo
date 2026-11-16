import type { VaultEntry } from '@/types'
import { IMAGE_FILE_EXTENSIONS } from '@/folder/file-preview'
import { noteEntryForPath } from '@/folder/note-entry'

/**
 * What an Image file is to the shell (CONTEXT.md): a file Plumo shows and never
 * edits. `@/folder/file-preview.ts` holds the extension list the Explorer, the drop
 * intake and the Rust scanner all share; this module is the Tab's side of it —
 * the entry an Image Tab carries and the two strings its tab bar controls show.
 */

export interface ImageNaturalSize {
  width: number
  height: number
}

/** What the active Tab is: at most one of these is set, and neither with no Tab open. */
export interface ActiveTabPaths {
  documentPath: string | null
  imagePath: string | null
}

const IMAGE_FILE_PATTERN = new RegExp(`\\.(?:${IMAGE_FILE_EXTENSIONS.join('|')})$`, 'iu')

/** An Image file's Tab kind is derived from the extension, never from a Session `mode`. */
export function isImageFilePath(path: string): boolean {
  return IMAGE_FILE_PATTERN.test(path)
}

/**
 * Which of the two kinds of Tab is active, the one question the shell and the
 * editor both ask: the shell to leave Save, Toggle Source Mode and Find in
 * Document disabled over a picture, the editor to tell the kernel there is no
 * Document under it.
 */
export function activeTabPaths(activeTabPath: string | null): ActiveTabPaths {
  const isImage = activeTabPath !== null && isImageFilePath(activeTabPath)
  return {
    documentPath: isImage ? null : activeTabPath,
    imagePath: isImage ? activeTabPath : null,
  }
}

/**
 * The kernel entry an Image Tab carries. There is no content behind it: the
 * picture reaches the view through the asset protocol, and the byte size
 * through the Folder listing, so the entry only has to name the file.
 */
export function imageEntryForPath(path: string): VaultEntry {
  return { ...noteEntryForPath(path, ''), fileKind: 'binary' }
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const
const SIZE_STEP = 1024

/** One decimal, a trailing `.0` dropped: 245_760 bytes is `240 KB`, 250_000 is `244.1 KB`. */
export function formatFileSize(bytes: number): string {
  let value = Math.max(0, Math.round(bytes))
  let unit = 0
  while (value >= SIZE_STEP && unit < SIZE_UNITS.length - 1) {
    value /= SIZE_STEP
    unit += 1
  }
  // A value that would print as a full step belongs to the next unit up.
  if (value >= SIZE_STEP - 0.05 && unit < SIZE_UNITS.length - 1) {
    value /= SIZE_STEP
    unit += 1
  }
  const printed = unit === 0 ? String(value) : value.toFixed(1).replace(/\.0$/u, '')
  return `${printed} ${SIZE_UNITS[unit]}`
}

/**
 * What the picture is fetched at (ADR-0007). The Folder listing moves when the
 * file does, and the watcher's own reload count moves even when it does not —
 * `modifiedAt` is whole seconds, so an overwrite within the same second that
 * keeps the byte count would otherwise be served from the webview's cache.
 */
export function imageFetchVersion(file: { modifiedAt: number | null; fileSize: number } | null, reloads: number): string {
  return `${file?.modifiedAt ?? 0}-${file?.fileSize ?? 0}-${reloads}`
}

/**
 * The tab bar's line for an Image Tab, `1920 × 1080 · 240 KB`.
 * The dimensions are the natural size the browser reports once the image has
 * loaded, so there is nothing to show before that and the slot stays empty.
 */
export function imageMetadataLabel(naturalSize: ImageNaturalSize | null, fileSize: number): string | null {
  if (!naturalSize) return null
  return `${naturalSize.width} × ${naturalSize.height} · ${formatFileSize(fileSize)}`
}

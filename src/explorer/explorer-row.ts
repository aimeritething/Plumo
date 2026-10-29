import { FileText, Folder, Image } from '@phosphor-icons/react'
import type { ExplorerRowKind } from '@/folder/explorer-names'

/** How an Explorer row is drawn: its icon, and where its parts sit. */

export const EXPLORER_ROW_ICONS: Record<ExplorerRowKind, typeof FileText> = {
  note: FileText,
  image: Image,
  folder: Folder,
}

/** 12px per level, from the row's own 8px inset. */
export function explorerRowIndent(depth: number): number {
  return 8 + depth * 12
}

/** Where a row's name starts: past the icon (a folder's caret on hover) and its gap. */
export function explorerNameIndent(depth: number): number {
  return explorerRowIndent(depth) + 20
}

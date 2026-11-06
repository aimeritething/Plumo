import { useBlockNoteEditor, useDictionary, useEditorState } from '@blocknote/react'
import type { BlockSchema, InlineContentSchema, StyleSchema } from '@blocknote/core'
import { ArrowSquareOut } from '@phosphor-icons/react'
import { useCallback } from 'react'
import { ToolbarButton } from '@/ui/toolbar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { openEditorAttachmentOrUrl } from './editor-attachment-actions'
import {
  getSelectedBlocksSafely,
  isFileBlockType,
  type FormattingToolbarEditor,
} from './formatting-toolbar-selection'

// The toolbar's open button for a selected file block: the file opens through
// the Folder (vaultPath) rather than BlockNote's download.

type SelectedFileBlock = {
  type: string
  url: string
}

type FormattingToolbarDictionary = {
  formatting_toolbar?: {
    file_download?: {
      tooltip?: Record<string, string>
    }
  }
}

function getSelectedFileBlockState(editor: FormattingToolbarEditor): SelectedFileBlock | null {
  const selectedBlocks = getSelectedBlocksSafely(editor)
  if (selectedBlocks.length !== 1) return null

  const block = selectedBlocks.at(0)
  if (!block) return null
  if (!isFileBlockType(block.type)) return null

  const url = (block.props as Record<string, unknown>).url
  return typeof url === 'string' && url.trim().length > 0
    ? { type: block.type, url }
    : null
}

function fileDownloadTooltips(dict: unknown): Record<string, string> {
  const toolbar = (dict as FormattingToolbarDictionary).formatting_toolbar
  if (!toolbar) return {}
  const fileDownload = toolbar.file_download
  if (!fileDownload) return {}
  return fileDownload.tooltip ?? {}
}

function fileDownloadTooltip(dict: unknown, blockType: string): string {
  const tooltips = fileDownloadTooltips(dict)
  const specificTooltip = Reflect.get(tooltips, blockType)
  if (typeof specificTooltip === 'string') return specificTooltip
  return tooltips.file ?? 'Download file'
}

export function FileDownloadButton({ vaultPath }: { vaultPath?: string }) {
  const dict = useDictionary()
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>()
  const selectedFileBlock = useEditorState({
    editor,
    selector: ({ editor }) => getSelectedFileBlockState(editor),
  })
  const handleOpen = useCallback(() => {
    if (!selectedFileBlock) return

    editor.focus()
    openEditorAttachmentOrUrl({
      url: selectedFileBlock.url,
      vaultPath,
      source: 'file',
    })
  }, [editor, selectedFileBlock, vaultPath])

  if (!selectedFileBlock || !editor.isEditable) return null

  const label = fileDownloadTooltip(dict, selectedFileBlock.type)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ToolbarButton aria-label={label} data-test="fileDownload" onClick={handleOpen}>
          <ArrowSquareOut aria-hidden="true" />
        </ToolbarButton>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

import { FilePanelExtension } from '@blocknote/core/extensions'
import { useDictionary, useExtension } from '@blocknote/react'
import type { ReactNode } from 'react'
import { translate } from '@/lib/i18n'
import { Button } from '@/ui/button'
import { useFileBlockSelected } from './file-block-edits'

// What a Block that shows a file draws before it has one, Notion's empty
// slot: a full-width muted row with the Block's icon and "Add image" / "Add
// video" / "Add audio" / "Add file" (BlockNote's dictionary). A click opens
// the File panel on the Block; the press keeps the editor's focus. While a
// file is going in, the row says so instead.

interface AddFileButtonEditor {
  isEditable: boolean
  transact<T>(run: () => T): T
}

export function AddFileButton({ blockId, blockType, editor, icon }: {
  blockId: string
  blockType: string
  editor: AddFileButtonEditor
  icon: ReactNode
}) {
  const dictionary = useDictionary()
  const filePanel = useExtension(FilePanelExtension)
  const selected = useFileBlockSelected(editor, blockId)
  const labels = dictionary.file_blocks.add_button_text

  return (
    <Button
      contentEditable={false}
      data-add-file-button=""
      data-selected={selected}
      size="row"
      tabIndex={-1}
      variant="placeholder"
      onClick={() => {
        if (!editor.isEditable) return
        editor.transact(() => filePanel.showMenu(blockId))
      }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {icon}
      {labels[blockType] ?? labels.file}
    </Button>
  )
}

export function FileBlockLoading() {
  return (
    <div className="flex h-11 w-full items-center rounded-sm px-3 text-sm text-text-tertiary" data-file-loading="">
      {translate('en', 'editor.file.loading')}
    </div>
  )
}

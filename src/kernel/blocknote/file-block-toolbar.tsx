import { useDictionary } from '@blocknote/react'
import {
  ArrowSquareOut,
  Eye,
  FileText,
  Globe,
  PencilSimple,
  Subtitles,
  Swap,
  Trash,
} from '@phosphor-icons/react'
import { translate, type TranslationKey } from '@/lib/i18n'
import {
  BlockCornerToolbar,
  BlockToolbarButton,
  BlockToolbarField,
  BlockToolbarMenu,
  useBlockToolbarField,
  type BlockToolbarMenuItem,
  type BlockToolbarPlacement,
} from './block-toolbar'

// The File toolbar: the Image toolbar's sibling on an Audio, Video or File
// Block, as Notion has on its video, audio and file blocks. Caption, Open and
// `⋯` (Replace, Rename, Show as file / Show preview, Delete), in the corner of
// a player, or at the right end of a file's name; shown on hover or while the
// Block is selected. These were the Formatting toolbar's file buttons.

const t = (key: TranslationKey) => translate('en', key)

export interface FileBlockToolbarProps {
  blockType: string
  name: string
  placement: BlockToolbarPlacement
  /** Whether the Block shows its player; undefined for a Block that has none (a File). */
  previewShown: boolean | undefined
  remote: boolean
  shown: boolean
  onCaption: () => void
  onDelete: () => void
  onOpen: () => void
  /** A menu or the Rename popover opened or closed: the toolbar stays while one is open. */
  onPopupOpenChange: (open: boolean) => void
  onRename: (name: string) => void
  onReplace: () => void
  /** A popup closed without acting on the editor: give the editor its focus and the Block its selection back. */
  onReturnFocus: () => void
  onTogglePreview: () => void
}

function byBlockType(labels: Record<string, string>, blockType: string): string {
  return labels[blockType] ?? labels.file ?? ''
}

export function FileBlockToolbar(props: FileBlockToolbarProps) {
  const dictionary = useDictionary()
  const rename = useBlockToolbarField({
    value: props.name,
    onChange: props.onRename,
    onPopupOpenChange: props.onPopupOpenChange,
    onReturnFocus: props.onReturnFocus,
  })
  const renameLabel = byBlockType(dictionary.formatting_toolbar.file_rename.tooltip, props.blockType)
  const items: BlockToolbarMenuItem[] = [
    {
      key: 'replace',
      icon: <Swap aria-hidden="true" />,
      label: byBlockType(dictionary.formatting_toolbar.file_replace.tooltip, props.blockType),
      onSelect: props.onReplace,
    },
    { key: 'rename', icon: <PencilSimple aria-hidden="true" />, label: renameLabel, onSelect: rename.show },
  ]
  if (props.previewShown !== undefined) {
    items.push({
      key: 'preview',
      icon: props.previewShown ? <FileText aria-hidden="true" /> : <Eye aria-hidden="true" />,
      label: t(props.previewShown ? 'editor.file.showAsFile' : 'editor.file.showPreview'),
      onSelect: props.onTogglePreview,
    })
  }
  items.push({ key: 'delete', icon: <Trash aria-hidden="true" />, label: t('editor.file.delete'), onSelect: props.onDelete, destructive: true })
  const openLabel = t(props.remote ? 'editor.file.openInBrowser' : 'editor.file.openWithDefaultApp')

  return (
    <BlockCornerToolbar
      field={rename}
      fieldContent={(
        <BlockToolbarField
          field={rename}
          label={renameLabel}
          placeholder={byBlockType(dictionary.formatting_toolbar.file_rename.input_placeholder, props.blockType)}
          testId="file-rename-input"
          value={props.name}
        />
      )}
      label={t('editor.file.toolbar')}
      name="file-toolbar"
      placement={props.placement}
      shown={props.shown}
    >
      <BlockToolbarButton label={t('editor.file.caption')} shown={props.shown} testId="file-toolbar-caption" onClick={props.onCaption}>
        <Subtitles aria-hidden="true" />
      </BlockToolbarButton>
      <BlockToolbarButton label={openLabel} shown={props.shown} testId="file-toolbar-open" onClick={props.onOpen}>
        {props.remote ? <Globe aria-hidden="true" /> : <ArrowSquareOut aria-hidden="true" />}
      </BlockToolbarButton>
      <BlockToolbarMenu
        items={items}
        label={t('editor.file.more')}
        shown={props.shown}
        testId="file-toolbar-more"
        onPopupOpenChange={props.onPopupOpenChange}
        onReturnFocus={props.onReturnFocus}
      />
    </BlockCornerToolbar>
  )
}

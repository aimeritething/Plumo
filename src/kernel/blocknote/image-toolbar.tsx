import {
  ArrowSquareOut,
  ArrowsOut,
  Globe,
  Subtitles,
  Swap,
  Textbox,
  Trash,
} from '@phosphor-icons/react'
import { translate, type TranslationKey } from '@/lib/i18n'
import {
  BlockCornerToolbar,
  BlockToolbarButton,
  BlockToolbarField,
  BlockToolbarMenu,
  useBlockToolbarField,
} from './block-toolbar'

// The Image toolbar (CONTEXT.md): Caption, Preview image and `⋯` in the
// picture's top-right corner, or just above that corner when the picture is
// too narrow to hold them. Built from the parts every toolbar on a Block
// shares (block-toolbar.tsx).

const t = (key: TranslationKey) => translate('en', key)

export type ImageToolbarPlacement = 'inside' | 'above'

export interface ImageToolbarProps {
  alt: string
  placement: ImageToolbarPlacement
  previewDisabled: boolean
  remote: boolean
  shown: boolean
  onAltChange: (alt: string) => void
  onCaption: () => void
  onDelete: () => void
  onOpen: () => void
  /** A menu or the Alt text popover opened or closed: the toolbar stays while one is open. */
  onPopupOpenChange: (open: boolean) => void
  onPreview: () => void
  onReplace: () => void
  /** A popup closed without acting on the editor: give the editor its focus and the Block its selection back. */
  onReturnFocus: () => void
}

export function ImageToolbar(props: ImageToolbarProps) {
  // Enter and a click away both save the alt text; Esc cancels (AIM-531).
  const altText = useBlockToolbarField({
    value: props.alt,
    onChange: props.onAltChange,
    onPopupOpenChange: props.onPopupOpenChange,
    onReturnFocus: props.onReturnFocus,
  })

  return (
    <BlockCornerToolbar
      field={altText}
      fieldContent={(
        <BlockToolbarField
          field={altText}
          label={t('editor.image.altText')}
          placeholder={t('editor.image.altTextPlaceholder')}
          testId="image-alt-text-input"
          value={props.alt}
        />
      )}
      label={t('editor.image.toolbar')}
      name="image-toolbar"
      placement={props.placement}
      shown={props.shown}
    >
      <BlockToolbarButton label={t('editor.image.caption')} shown={props.shown} testId="image-toolbar-caption" onClick={props.onCaption}>
        <Subtitles aria-hidden="true" />
      </BlockToolbarButton>
      <BlockToolbarButton
        disabled={props.previewDisabled}
        label={t('editor.image.preview')}
        shown={props.shown}
        testId="image-toolbar-preview"
        onClick={props.onPreview}
      >
        <ArrowsOut aria-hidden="true" />
      </BlockToolbarButton>
      <BlockToolbarMenu
        items={[
          { key: 'replace', icon: <Swap aria-hidden="true" />, label: t('editor.image.replace'), onSelect: props.onReplace },
          { key: 'alt', icon: <Textbox aria-hidden="true" />, label: t('editor.image.altText'), onSelect: altText.show },
          {
            key: 'open',
            icon: props.remote ? <Globe aria-hidden="true" /> : <ArrowSquareOut aria-hidden="true" />,
            label: t(props.remote ? 'editor.image.openInBrowser' : 'editor.image.openWithDefaultApp'),
            onSelect: props.onOpen,
          },
          { key: 'delete', icon: <Trash aria-hidden="true" />, label: t('editor.image.delete'), onSelect: props.onDelete, destructive: true },
        ]}
        label={t('editor.image.more')}
        shown={props.shown}
        testId="image-toolbar-more"
        onPopupOpenChange={props.onPopupOpenChange}
        onReturnFocus={props.onReturnFocus}
      />
    </BlockCornerToolbar>
  )
}

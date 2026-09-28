import {
  FormattingToolbar as BlockNoteFormattingToolbar,
  getFormattingToolbarItems,
} from '@blocknote/react'
import type { ReactElement } from 'react'
import type { AppLocale } from '@/lib/i18n'
import { MARKDOWN_HIGHLIGHT_STYLE } from '@/kernel/markdown/markdown-highlight-markdown'
import { BlockTypeSelect } from './block-type-select'
import { CreateLinkButton } from './create-link-button'
import { FileDownloadButton } from './file-download-button'
import { NestBlockButton, UnnestBlockButton } from './nest-block-buttons'
import { TextStyleToggle } from './text-style-toggle'

// Plumo's formatting toolbar: BlockNote's item list with the controls that have
// no Markdown (underline, alignment, colour) removed, Plumo's own block type
// select, text style toggles, file open button, nest / unnest buttons and link
// button in place of BlockNote's, and the inline code and highlight toggles
// added after strikethrough. Every button is Plumo's so its tooltip is one
// row, label and shortcut chips; BlockNote's own draw two lines of text. The
// file block buttons (caption, replace, rename, delete, preview) stay
// BlockNote's, rendered through the shadcn components (shadcn-components.tsx).

const UNSUPPORTED_FORMATTING_TOOLBAR_KEYS = new Set([
  'underlineStyleButton',
  'textAlignLeftButton',
  'textAlignCenterButton',
  'textAlignRightButton',
  'colorStyleButton',
])

// eslint-disable-next-line react-refresh/only-export-components -- the filter is tested on its own
export function filterFormattingToolbarItems<T extends ReactElement>(items: T[]): T[] {
  return items.filter(
    (item) => !UNSUPPORTED_FORMATTING_TOOLBAR_KEYS.has(String(item.key)),
  )
}

function replaceToolbarControls(items: ReactElement[], vaultPath?: string) {
  return items.map((item) => {
    switch (String(item.key)) {
      case 'blockTypeSelect':
        return <BlockTypeSelect key={item.key} />
      case 'boldStyleButton':
        return <TextStyleToggle key={item.key} textStyle="bold" />
      case 'italicStyleButton':
        return <TextStyleToggle key={item.key} textStyle="italic" />
      case 'strikeStyleButton':
        return <TextStyleToggle key={item.key} textStyle="strike" />
      case 'fileDownloadButton':
        return <FileDownloadButton key={item.key} vaultPath={vaultPath} />
      case 'nestBlockButton':
        return <NestBlockButton key={item.key} />
      case 'unnestBlockButton':
        return <UnnestBlockButton key={item.key} />
      case 'createLinkButton':
        return <CreateLinkButton key={item.key} />
      default:
        return item
    }
  })
}

function insertExtraTextStyleToggles(items: ReactElement[], locale: AppLocale) {
  const strikeButtonIndex = items.findIndex(
    (item) => String(item.key) === 'strikeStyleButton',
  )
  if (strikeButtonIndex === -1) return items

  return [
    ...items.slice(0, strikeButtonIndex + 1),
    <TextStyleToggle key="codeStyleButton" textStyle="code" />,
    <TextStyleToggle key="highlightStyleButton" locale={locale} textStyle={MARKDOWN_HIGHLIGHT_STYLE} />,
    ...items.slice(strikeButtonIndex + 1),
  ]
}

function getFormattingToolbarItemsFor(vaultPath: string | undefined, locale: AppLocale) {
  return insertExtraTextStyleToggles(
    replaceToolbarControls(
      filterFormattingToolbarItems(getFormattingToolbarItems()),
      vaultPath,
    ),
    locale,
  )
}

export function FormattingToolbar({
  locale = 'en',
  vaultPath,
}: {
  locale?: AppLocale
  vaultPath?: string
} = {}) {
  return <BlockNoteFormattingToolbar>{getFormattingToolbarItemsFor(vaultPath, locale)}</BlockNoteFormattingToolbar>
}

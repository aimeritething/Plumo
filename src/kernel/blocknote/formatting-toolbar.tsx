import {
  FileCaptionButton,
  FileDeleteButton,
  FilePreviewButton,
  FileRenameButton,
  FileReplaceButton,
} from '@blocknote/react'
import { translate, type AppLocale } from '@/lib/i18n'
import { MARKDOWN_HIGHLIGHT_STYLE } from '@/kernel/markdown/markdown-highlight-markdown'
import { Toolbar, ToolbarGroup } from '@/ui/toolbar'
import { BlockTypeSelect } from './block-type-select'
import { CreateLinkButton } from './create-link-button'
import { FileDownloadButton } from './file-download-button'
import { NestBlockButton, UnnestBlockButton } from './nest-block-buttons'
import { TextStyleToggle } from './text-style-toggle'

// The Formatting toolbar (CONTEXT.md), Plumo's own on the shared toolbar
// (ui/toolbar), laid out as Notion's: one row, groups split by a hairline:
//
//   [Block type ▾] | [Link] | [B I S <> Highlight▾] | [Nest Unnest]
//
// and, for a selected Audio, Video or File block, the file's own group alone
// (the text controls all hide for a Block with no text). Only what Markdown
// keeps is offered: no underline, alignment or text colour. Each control
// decides by itself whether it shows for the selection (it renders nothing
// otherwise); a group with nothing in it takes no room (ui/toolbar's
// ToolbarGroup).
//
// The file group's caption, replace, rename, delete and preview buttons are
// still BlockNote's (rendered through the shadcn components,
// shadcn-components.tsx); the Image block has its own Image toolbar.

export function FormattingToolbar({
  locale = 'en',
  vaultPath,
}: {
  locale?: AppLocale
  vaultPath?: string
} = {}) {
  return (
    <Toolbar
      aria-label={translate(locale, 'editor.formatting.toolbar')}
      data-formatting-toolbar=""
      variant="floating"
    >
      <ToolbarGroup>
        <BlockTypeSelect />
      </ToolbarGroup>
      <ToolbarGroup>
        <FileCaptionButton />
        <FileReplaceButton />
        <FileRenameButton />
        <FileDeleteButton />
        <FileDownloadButton vaultPath={vaultPath} />
        <FilePreviewButton />
      </ToolbarGroup>
      <ToolbarGroup>
        <CreateLinkButton />
      </ToolbarGroup>
      <ToolbarGroup>
        <TextStyleToggle textStyle="bold" />
        <TextStyleToggle textStyle="italic" />
        <TextStyleToggle textStyle="strike" />
        <TextStyleToggle textStyle="code" />
        <TextStyleToggle locale={locale} textStyle={MARKDOWN_HIGHLIGHT_STYLE} />
      </ToolbarGroup>
      <ToolbarGroup>
        <NestBlockButton />
        <UnnestBlockButton />
      </ToolbarGroup>
    </Toolbar>
  )
}

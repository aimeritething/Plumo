import { translate, type AppLocale } from '@/lib/i18n'
import { MARKDOWN_HIGHLIGHT_STYLE } from '@/kernel/markdown/markdown-highlight-markdown'
import { Toolbar, ToolbarGroup } from '@/ui/toolbar'
import { BlockTypeSelect } from './block-type-select'
import { CreateLinkButton } from './create-link-button'
import { NestBlockButton, UnnestBlockButton } from './nest-block-buttons'
import { TextStyleToggle } from './text-style-toggle'

// The Formatting toolbar (CONTEXT.md), Plumo's own on the shared toolbar
// (ui/toolbar), laid out as Notion's: one row, groups split by a hairline:
//
//   [Block type ▾] | [Link] | [B I S <> Highlight▾] | [Nest Unnest]
//
// Only what Markdown keeps is offered: no underline, alignment or text
// colour. Each control decides by itself whether it shows for the selection
// (it renders nothing otherwise); a group with nothing in it takes no room
// (ui/toolbar's ToolbarGroup). A selected Image, Audio, Video or File block
// opens no Formatting toolbar: each has its own toolbar in its corner (the
// Image toolbar, the File toolbar).

export function FormattingToolbar({
  locale = 'en',
}: {
  locale?: AppLocale
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

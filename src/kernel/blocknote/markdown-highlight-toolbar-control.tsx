import { useEditorState } from '@blocknote/react'
import { CaretDown } from '@phosphor-icons/react'
import { translate, type AppLocale } from '@/lib/i18n'
import {
  DEFAULT_MARKDOWN_HIGHLIGHT_COLOR,
  markdownHighlightColorFromStyles,
} from '@/kernel/markdown/markdown-highlight-markdown'
import { MarkdownHighlightColorMenu } from './markdown-highlight-color-menu'
import type { HighlightEditor } from './markdown-highlight-model'
import { selectionOrHighlightRange } from './markdown-highlight-range'
import { useToolbarMenu } from './toolbar-menu-state'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

// The colour caret after the formatting toolbar's highlight toggle. It sits in
// the toolbar's own tree: its menu is portaled, but the trigger controls it
// (aria-controls), so the controller keeps the toolbar while focus is there.
export function ToolbarHighlightColorControl({
  editor,
  locale,
}: {
  editor: HighlightEditor
  locale: AppLocale
}) {
  // Shared with the toolbar controller, so the toolbar stays while the menu is open.
  const menu = useToolbarMenu('highlightColor')
  const currentColor = useEditorState({
    editor,
    selector: ({ editor }) => markdownHighlightColorFromStyles(editor.getActiveStyles()),
  }) ?? DEFAULT_MARKDOWN_HIGHLIGHT_COLOR
  const label = translate(locale, 'editor.formatting.highlightColor')

  // The tooltip trigger is the menu trigger's child, so the menu's open / closed data-state is the one the button keeps.
  return (
    <Tooltip>
      <MarkdownHighlightColorMenu
        currentColor={currentColor}
        editor={editor}
        locale={locale}
        onOpenChange={menu.setOpened}
        open={menu.opened}
        readRange={() => selectionOrHighlightRange(editor)}
        source="toolbar"
        trigger={(
          <TooltipTrigger asChild>
            <Button
              aria-label={label}
              className="h-7 w-4.5 min-w-4.5 rounded-s-none p-0 text-text-primary"
              data-test="highlightColorMenu"
              // As the block type trigger: keep the editor's selection, take the
              // focus so the toolbar counts as focused while the menu is open.
              onMouseDown={(event) => {
                event.preventDefault()
                event.currentTarget.focus()
              }}
              size="icon-xs"
              variant="ghost"
            >
              <CaretDown aria-hidden="true" className="size-3" />
            </Button>
          </TooltipTrigger>
        )}
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

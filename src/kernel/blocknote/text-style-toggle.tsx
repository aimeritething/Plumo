import { useBlockNoteEditor, useEditorState } from '@blocknote/react'
import type { BlockSchema, InlineContentSchema, StyleSchema } from '@blocknote/core'
import {
  Code,
  Highlighter,
  TextB,
  TextItalic,
  TextStrikethrough,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react'
import { useCallback } from 'react'
import { cn } from '@/lib/cn'
import { translate, type AppLocale } from '@/lib/i18n'
import { MARKDOWN_HIGHLIGHT_STYLE } from '@/kernel/markdown/markdown-highlight-markdown'
import { toggleDefaultMarkdownHighlight } from './markdown-highlight-model'
import { ToolbarHighlightColorControl } from './markdown-highlight-toolbar-control'
import { Toggle } from '@/ui/toggle'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { getSelectedBlocksSafely, type FormattingToolbarEditor } from './formatting-toolbar-selection'

// The five text style toggles of the formatting toolbar: bold, italic,
// strikethrough, inline code and the Markdown highlight. Each is a ui/Toggle
// pressed while the style is active at the selection. The highlight toggle
// goes through the highlight model (it extends or clears a whole highlight,
// colour mark included) and carries the colour caret after it.

export type TextStyle =
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | typeof MARKDOWN_HIGHLIGHT_STYLE

// The tooltip is one row, label then one Kbd chip per key, as every tooltip in
// Plumo. The keys are TipTap's marks' (bold, italic, strike, code) and the
// highlight shortcut extension's; Plumo is a macOS app, so the chips are ⌘ / ⇧.
type TextStyleCopy = { label: string; shortcut: string }

const TEXT_STYLE_COPY: Record<Exclude<TextStyle, typeof MARKDOWN_HIGHLIGHT_STYLE>, TextStyleCopy> = {
  bold: { label: 'Bold', shortcut: '⌘B' },
  italic: { label: 'Italic', shortcut: '⌘I' },
  strike: { label: 'Strikethrough', shortcut: '⌘⇧S' },
  code: { label: 'Inline code', shortcut: '⌘E' },
}

const TEXT_STYLE_ICONS: Record<TextStyle, PhosphorIcon> = {
  bold: TextB,
  italic: TextItalic,
  strike: TextStrikethrough,
  code: Code,
  [MARKDOWN_HIGHLIGHT_STYLE]: Highlighter,
}

function textStyleCopy(textStyle: TextStyle, locale: AppLocale): TextStyleCopy {
  if (textStyle === MARKDOWN_HIGHLIGHT_STYLE) {
    return {
      label: translate(locale, 'editor.formatting.highlight'),
      shortcut: '⌘⇧M',
    }
  }

  return TEXT_STYLE_COPY[textStyle]
}

function editorSupportsTextStyle(textStyle: TextStyle, editor: FormattingToolbarEditor) {
  const styleSchema = Reflect.get(editor.schema.styleSchema, textStyle) as {
    type?: string
    propSchema?: unknown
  } | undefined
  return (
    textStyle in editor.schema.styleSchema &&
    styleSchema?.type === textStyle &&
    styleSchema.propSchema === 'boolean'
  )
}

function selectionSupportsInlineFormatting(editor: FormattingToolbarEditor) {
  return getSelectedBlocksSafely(editor).some((block) => block.content !== undefined)
}

function getTextStyleToggleState(textStyle: TextStyle, editor: FormattingToolbarEditor) {
  if (!editor.isEditable) return undefined
  if (!editorSupportsTextStyle(textStyle, editor)) return undefined
  if (!selectionSupportsInlineFormatting(editor)) return undefined

  return {
    active: textStyle in editor.getActiveStyles(),
  }
}

export function TextStyleToggle({
  locale = 'en',
  textStyle,
}: {
  locale?: AppLocale
  textStyle: TextStyle
}) {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>()
  const toggleState = useEditorState({
    editor,
    selector: ({ editor }) => getTextStyleToggleState(textStyle, editor),
  })

  const toggleStyle = useCallback(() => {
    if (textStyle === MARKDOWN_HIGHLIGHT_STYLE) {
      toggleDefaultMarkdownHighlight(editor)
      return
    }
    editor.focus()
    editor.toggleStyles({ [textStyle]: true } as never)
  }, [editor, textStyle])

  if (toggleState === undefined) return null

  const Icon = TEXT_STYLE_ICONS[textStyle]
  const copy = textStyleCopy(textStyle, locale)
  const isHighlight = textStyle === MARKDOWN_HIGHLIGHT_STYLE

  const toggle = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Toggle
          aria-label={copy.label}
          // The highlight toggle and its colour caret read as one control.
          className={cn(isHighlight && 'rounded-e-none')}
          // Restated: the tooltip trigger writes its own open / closed data-state over the toggle's.
          data-state={toggleState.active ? 'on' : 'off'}
          data-test={textStyle}
          onClick={toggleStyle}
          pressed={toggleState.active}
        >
          <Icon aria-hidden="true" />
        </Toggle>
      </TooltipTrigger>
      <TooltipContent shortcut={copy.shortcut}>{copy.label}</TooltipContent>
    </Tooltip>
  )

  if (!isHighlight) return toggle

  return (
    <div className="flex items-center">
      {toggle}
      <ToolbarHighlightColorControl editor={editor} locale={locale} />
    </div>
  )
}

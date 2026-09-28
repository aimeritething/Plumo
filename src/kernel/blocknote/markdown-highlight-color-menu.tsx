import { Check } from '@phosphor-icons/react'
import { cva } from 'class-variance-authority'
import type { ReactNode } from 'react'
import type { AppLocale } from '@/lib/i18n'
import {
  MARKDOWN_HIGHLIGHT_COLORS,
  type MarkdownHighlightColor,
} from '@/kernel/markdown/markdown-highlight-markdown'
import { keepEditorFocusAfterMenuClose, keepFocusWhenLeavingClosingMenuItem } from './toolbar-menu-state'
import { colorLabel } from './markdown-highlight-control-state'
import {
  applyMarkdownHighlightColor,
  type HighlightControlSource,
  type HighlightEditor,
  type HighlightRange,
} from './markdown-highlight-model'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'

// The colour chip before each name: the chroma as the ring, its wash as the fill.
const swatchVariants = cva('size-3.5 shrink-0 rounded-full border border-current', {
  variants: {
    color: {
      yellow: 'bg-chroma-yellow-bg text-chroma-yellow',
      green: 'bg-chroma-green-bg text-chroma-green',
      red: 'bg-chroma-red-bg text-chroma-red',
      blue: 'bg-chroma-blue-bg text-chroma-blue',
      purple: 'bg-chroma-purple-bg text-chroma-purple',
    } satisfies Record<MarkdownHighlightColor, string>,
  },
})

interface MarkdownHighlightColorMenuProps {
  currentColor: MarkdownHighlightColor
  editor: HighlightEditor
  locale: AppLocale
  onOpenChange?: (open: boolean) => void
  open?: boolean
  // Read when a colour is chosen, so the range is the editor's at that moment.
  readRange: () => HighlightRange | null
  // Which side of the trigger the menu opens on; below it unless given.
  side?: 'top' | 'bottom'
  source: HighlightControlSource
  trigger: ReactNode
}

// Non-modal, as the block type menu: a modal menu would take the pointer
// events from the toolbar and the editor around it while open.
export function MarkdownHighlightColorMenu(props: MarkdownHighlightColorMenuProps) {
  const { currentColor, editor, locale, onOpenChange, open, readRange, side, source, trigger } = props

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange} open={open}>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-36"
        onCloseAutoFocus={(event) => keepEditorFocusAfterMenuClose(editor.domElement, event)}
        side={side}
      >
        {MARKDOWN_HIGHLIGHT_COLORS.map(color => (
          <DropdownMenuItem
            key={color}
            onPointerLeave={(event) => keepFocusWhenLeavingClosingMenuItem(open === true, event)}
            onSelect={() => applyMarkdownHighlightColor(editor, color, readRange(), source)}
          >
            <span aria-hidden="true" className={swatchVariants({ color })} />
            <span>{colorLabel(locale, color)}</span>
            {currentColor === color && <Check aria-hidden="true" className="ml-auto" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

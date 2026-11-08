import { Check } from '@phosphor-icons/react'
import { cva } from 'class-variance-authority'
import type { ReactElement } from 'react'
import type { AppLocale } from '@/lib/i18n'
import {
  MARKDOWN_HIGHLIGHT_COLORS,
  type MarkdownHighlightColor,
} from '@/kernel/markdown/markdown-highlight-markdown'
import { keepFocusWhenLeavingClosingMenuItem, returnFocusAfterMenuClose } from './toolbar-menu-state'
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
      yellow: 'bg-yellow-muted text-yellow',
      green: 'bg-green-muted text-green',
      red: 'bg-red-muted text-red',
      blue: 'bg-blue-muted text-blue',
      purple: 'bg-purple-muted text-purple',
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
  trigger: ReactElement
}

// Non-modal, as the block type menu: a modal menu would take the pointer
// events from the toolbar and the editor around it while open.
export function MarkdownHighlightColorMenu(props: MarkdownHighlightColorMenuProps) {
  const { currentColor, editor, locale, onOpenChange, open, readRange, side, source, trigger } = props

  return (
    <DropdownMenu modal={false} onOpenChange={onOpenChange} open={open}>
      <DropdownMenuTrigger render={trigger} />
      <DropdownMenuContent
        align="end"
        className="min-w-36"
        finalFocus={() => returnFocusAfterMenuClose(editor.domElement)}
        side={side}
      >
        {MARKDOWN_HIGHLIGHT_COLORS.map(color => (
          <DropdownMenuItem
            key={color}
            onPointerLeave={(event) => keepFocusWhenLeavingClosingMenuItem(open === true, event)}
            onClick={() => applyMarkdownHighlightColor(editor, color, readRange(), source)}
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

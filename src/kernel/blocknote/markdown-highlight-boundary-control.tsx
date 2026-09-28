import { Highlighter } from '@phosphor-icons/react'
import { useRef, useState } from 'react'
import { translate } from '@/lib/i18n'
import { MarkdownHighlightColorMenu } from './markdown-highlight-color-menu'
import {
  useCursorControlState,
  useDocumentLocale,
  useFocusWithinEditorOrControl,
} from './markdown-highlight-control-state'
import type { HighlightEditor } from './markdown-highlight-model'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

// Shown while the focus is in the editor, or in the button or its colour menu
// (the menu is portaled, so it counts while open).
export function HighlightBoundaryColorControl({ editor }: { editor: HighlightEditor }) {
  const locale = useDocumentLocale()
  const state = useCursorControlState(editor)
  const controlRef = useRef<HTMLDivElement>(null)
  const focused = useFocusWithinEditorOrControl(editor, controlRef)
  const [menuOpen, setMenuOpen] = useState(false)
  if (!state || !editor.isEditable || !(focused || menuOpen)) return null

  const label = translate(locale, 'editor.formatting.highlightChangeColor')

  return (
    <div
      ref={controlRef}
      className="fixed z-sticky -translate-y-1/2"
      style={{ left: state.left, top: state.top }}
    >
      {/* The tooltip trigger is the menu trigger's child, so the menu's open / closed data-state is the one the button keeps. */}
      <Tooltip>
        <MarkdownHighlightColorMenu
          currentColor={state.color}
          editor={editor}
          locale={locale}
          onOpenChange={setMenuOpen}
          readRange={() => state}
          source="cursor"
          trigger={(
            <TooltipTrigger asChild>
              <Button
                aria-label={label}
                className="bg-surface-popover text-text-primary border-hairline border-border-popover shadow-menu"
                data-test="highlightBoundaryColorMenu"
                onMouseDown={event => event.preventDefault()}
                size="icon-xs"
                variant="ghost"
              >
                <Highlighter aria-hidden="true" />
              </Button>
            </TooltipTrigger>
          )}
        />
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </div>
  )
}

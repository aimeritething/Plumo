import { Highlighter } from '@phosphor-icons/react'
import { useMemo, useRef, useState } from 'react'
import { translate } from '@/lib/i18n'
import { MarkdownHighlightColorMenu } from './markdown-highlight-color-menu'
import {
  CONTROL_GAP,
  useCursorControlState,
  useDocumentLocale,
  useFocusWithinEditorOrControl,
} from './markdown-highlight-control-state'
import type { HighlightEditor } from './markdown-highlight-model'
import { Button } from '@/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/ui/popover'
import { SimpleTooltip } from '@/ui/tooltip'

// The popover only places the button; the focus stays in the editor, so it
// neither takes the focus when it shows nor hands it back when it goes.
function keepFocusInEditor(event: Event) {
  event.preventDefault()
}

// The popover's layer marks an Esc as handled (preventDefault) right after
// this as it closes on it, and the editor then ignores that Esc (it selects
// the caret's Block, the find bar closes). This popover never closes on Esc
// (it has no onOpenChange), so that one mark is skipped; the next listener's
// preventDefault is the event's own again.
function leaveEscapeToEditor(event: KeyboardEvent) {
  event.preventDefault = () => {
    Reflect.deleteProperty(event, 'preventDefault')
  }
}

// Shown while the focus is in the editor, or in the button or its colour menu
// (the menu is portaled, so it counts while open). A popover anchored on the
// highlight end's line places it, above the line or below it, inside the
// scroll area's left and right edges. The menu and the tooltip open away from
// the highlight's line, on the side the button sits.
export function HighlightBoundaryColorControl({ editor }: { editor: HighlightEditor }) {
  const locale = useDocumentLocale()
  const state = useCursorControlState(editor)
  const controlRef = useRef<HTMLDivElement>(null)
  const focused = useFocusWithinEditorOrControl(editor, controlRef)
  const [menuOpen, setMenuOpen] = useState(false)
  // A new anchor whenever the line box moves, so the popover places it again.
  const anchorRect = state?.anchor
  const anchor = useMemo(() => ({ current: anchorRect ? { getBoundingClientRect: () => anchorRect } : null }), [anchorRect])
  if (!state || !editor.isEditable || !(focused || menuOpen)) return null

  const label = translate(locale, 'editor.formatting.highlightChangeColor')

  return (
    // Open for as long as it is shown, with no onOpenChange: a press in the
    // editor, the editor's focus and Esc are all "outside" the popover, and
    // none of them may close it.
    <Popover open>
      <PopoverAnchor virtualRef={anchor} />
      <PopoverContent
        ref={controlRef}
        align="center"
        collisionBoundary={state.boundary}
        data-test="highlightBoundaryControl"
        onCloseAutoFocus={keepFocusInEditor}
        onEscapeKeyDown={leaveEscapeToEditor}
        onOpenAutoFocus={keepFocusInEditor}
        role={undefined}
        side={state.side}
        sideOffset={CONTROL_GAP}
        variant="menu"
      >
        {/* The tooltip sits inside the menu trigger, so the menu's open / closed state is the one the button keeps. */}
        <MarkdownHighlightColorMenu
          currentColor={state.color}
          editor={editor}
          locale={locale}
          onOpenChange={setMenuOpen}
          readRange={() => state}
          side={state.side}
          source="cursor"
          trigger={(
            <SimpleTooltip label={label} side={state.side}>
              <Button
                aria-label={label}
                className="bg-popover text-foreground border-hairline border-border shadow-md"
                data-test="highlightBoundaryColorMenu"
                onMouseDown={event => event.preventDefault()}
                size="icon-xs"
                variant="ghost"
              >
                <Highlighter aria-hidden="true" />
              </Button>
            </SimpleTooltip>
          )}
        />
      </PopoverContent>
    </Popover>
  )
}

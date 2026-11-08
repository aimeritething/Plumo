/* eslint-disable react-refresh/only-export-components -- the toolbar's helpers sit next to its parts */
import { DotsThree } from '@phosphor-icons/react'
import { Fragment, useRef, useState, type KeyboardEvent, type ReactNode, type SyntheticEvent } from 'react'
import { cn } from '@/lib/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Input } from '@/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/ui/popover'
import { Toolbar, ToolbarButton } from '@/ui/toolbar'
import { SimpleTooltip } from '@/ui/tooltip'

// The parts of a toolbar drawn on a Block, Notion's: a few buttons and a `⋯`
// menu on the shared raised toolbar card, in a corner of the Block, shown on
// hover or while the Block is selected (the Image toolbar, the File toolbar).
// It stays in the page while hidden: WebKit drops a node selection when a
// node inside it is removed (see the core patch on the resizable file block
// wrapper), so showing and hiding is opacity only. A press on it keeps the
// Block selected and the editor's caret away.

/**
 * Where the toolbar sits on its Block:
 * - inside: in the top-right corner of a picture or a player;
 * - above: just above that corner, for a Block too small to hold it;
 * - end: at the right end of a one-line Block (a file's name), centred on it.
 */
export type BlockToolbarPlacement = 'inside' | 'above' | 'end'

const PLACEMENT_CLASS: Record<BlockToolbarPlacement, string> = {
  inside: 'top-2 right-2',
  above: 'right-0 bottom-full pb-1',
  end: 'top-1/2 right-1 -translate-y-1/2',
}

/** Keeps the press off ProseMirror: the Block stays selected and the editor keeps no caret. */
export function holdSelection(event: SyntheticEvent) {
  event.preventDefault()
  event.stopPropagation()
}

/**
 * While hidden the toolbar is out of the Tab order; shown, the toolbar's roving
 * focus decides. The key is left out when shown: a `tabIndex` of undefined
 * would still override the roving one.
 */
export function hiddenFromTab(shown: boolean) {
  return shown ? {} : { tabIndex: -1 }
}

/** One of the toolbar's icon buttons, with its label as the tooltip. */
export function BlockToolbarButton({ children, disabled, label, shown, testId, onClick }: {
  children: ReactNode
  disabled?: boolean
  label: string
  shown: boolean
  testId: string
  onClick: () => void
}) {
  return (
    <SimpleTooltip label={label} side="bottom">
      <ToolbarButton aria-label={label} data-testid={testId} disabled={disabled} onClick={onClick} size="sm" {...hiddenFromTab(shown)}>
        {children}
      </ToolbarButton>
    </SimpleTooltip>
  )
}

export interface BlockToolbarMenuItem {
  key: string
  icon: ReactNode
  label: string
  onSelect: () => void
  /** Red, and after a hairline: Delete. */
  destructive?: boolean
}

/**
 * The `⋯` button and its menu. The chosen item runs once the menu has closed
 * and let go of the focus, so a popover or the File panel it opens is not
 * dismissed by the focus coming back to the trigger; closing with no choice
 * gives the editor its focus back.
 */
export function BlockToolbarMenu({ items, label, shown, testId, onPopupOpenChange, onReturnFocus }: {
  items: BlockToolbarMenuItem[]
  label: string
  shown: boolean
  testId: string
  onPopupOpenChange: (open: boolean) => void
  onReturnFocus: () => void
}) {
  const [open, setOpen] = useState(false)
  const pendingRef = useRef<(() => void) | null>(null)

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        onPopupOpenChange(next)
      }}
    >
      <SimpleTooltip label={label} side="bottom">
        <DropdownMenuTrigger render={<ToolbarButton aria-label={label} data-testid={testId} size="sm" {...hiddenFromTab(shown)} />}>
          <DotsThree aria-hidden="true" weight="bold" />
        </DropdownMenuTrigger>
      </SimpleTooltip>
      <DropdownMenuContent
        align="end"
        finalFocus={() => {
          const pending = pendingRef.current
          pendingRef.current = null
          if (pending) pending()
          else onReturnFocus()
          return false
        }}
      >
        {items.map((item) => (
          <Fragment key={item.key}>
            {item.destructive && <DropdownMenuSeparator />}
            <DropdownMenuItem
              onClick={() => { pendingRef.current = item.onSelect }}
              variant={item.destructive ? 'destructive' : 'default'}
            >
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * A one-line text field the toolbar opens beside itself (alt text, a file's
 * name). Enter and a click away both save; Esc cancels.
 */
export function useBlockToolbarField(options: {
  value: string
  onChange: (value: string) => void
  onPopupOpenChange: (open: boolean) => void
  onReturnFocus: () => void
}) {
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  const draftRef = useRef(options.value)

  return {
    open,
    show: () => {
      draftRef.current = options.value
      openRef.current = true
      setOpen(true)
      options.onPopupOpenChange(true)
    },
    close: (save: boolean) => {
      if (!openRef.current) return
      openRef.current = false
      setOpen(false)
      options.onPopupOpenChange(false)
      if (save && draftRef.current !== options.value) options.onChange(draftRef.current)
      options.onReturnFocus()
    },
    setDraft: (draft: string) => {
      draftRef.current = draft
    },
  }
}

export type BlockToolbarFieldState = ReturnType<typeof useBlockToolbarField>

export function BlockToolbarField({ field, label, placeholder, testId, value }: {
  field: BlockToolbarFieldState
  label: string
  placeholder: string
  testId: string
  value: string
}) {
  const [draft, setDraft] = useState(value)
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    field.close(true)
  }
  return (
    <Input
      aria-label={label}
      autoFocus
      data-testid={testId}
      placeholder={placeholder}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value)
        field.setDraft(event.target.value)
      }}
      onKeyDown={handleKeyDown}
    />
  )
}

/**
 * The toolbar on its Block: placed, shown or hidden, the shared raised card,
 * and the text field it may open beside itself. `data-<name>` on the placed
 * element names the placement (`data-image-toolbar="inside"`).
 */
export function BlockCornerToolbar({ children, field, fieldContent, label, name, placement, shown }: {
  children: ReactNode
  field: BlockToolbarFieldState
  fieldContent: ReactNode
  label: string
  /** The toolbar's name in the DOM: `data-<name>` and the test id. */
  name: string
  placement: BlockToolbarPlacement
  shown: boolean
}) {
  return (
    <Popover
      open={field.open}
      // Esc cancels; a click away saves.
      onOpenChange={(next, details) => { if (!next) field.close(details.reason !== 'escape-key') }}
    >
      <PopoverAnchor
        render={(
          <div
            className={cn(
              'absolute z-raised transition-opacity duration-150 ease-out',
              PLACEMENT_CLASS[placement],
              shown ? 'opacity-100' : 'pointer-events-none opacity-0',
            )}
            {...{ [`data-${name}`]: placement }}
            data-testid={name}
            contentEditable={false}
            suppressContentEditableWarning
            onMouseDown={holdSelection}
            onDoubleClick={holdSelection}
          />
        )}
      >
        <Toolbar aria-hidden={!shown} aria-label={label} {...hiddenFromTab(shown)}>
          {children}
        </Toolbar>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        variant="compact"
        finalFocus={false}
      >
        {field.open && fieldContent}
      </PopoverContent>
    </Popover>
  )
}

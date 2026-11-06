import {
  ArrowSquareOut,
  ArrowsOut,
  DotsThree,
  Globe,
  Subtitles,
  Swap,
  Textbox,
  Trash,
} from '@phosphor-icons/react'
import { useRef, useState, type KeyboardEvent, type ReactNode, type SyntheticEvent } from 'react'
import { cn } from '@/lib/cn'
import { translate, type TranslationKey } from '@/lib/i18n'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Input } from '@/ui/input'
import { Popover, PopoverAnchor, PopoverContent } from '@/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { FloatingIconGroup } from './floating-icon-group'

// The Image toolbar (CONTEXT.md): Caption, Preview image and `⋯` in the
// picture's top-right corner, or just above that corner when the picture is
// too narrow to hold them. It stays in the page while hidden: WebKit drops a
// node selection when a node inside it is removed (see the core patch on the
// resizable file block wrapper), so showing and hiding is opacity only.

const t = (key: TranslationKey) => translate('en', key)

export type ImageToolbarPlacement = 'inside' | 'above'

export interface ImageToolbarProps {
  alt: string
  placement: ImageToolbarPlacement
  previewDisabled: boolean
  remote: boolean
  shown: boolean
  onAltChange: (alt: string) => void
  onCaption: () => void
  onDelete: () => void
  onOpen: () => void
  /** A menu or the Alt text popover opened or closed: the toolbar stays while one is open. */
  onPopupOpenChange: (open: boolean) => void
  onPreview: () => void
  onReplace: () => void
  /** A popup closed without acting on the editor: give the editor its focus and the Block its selection back. */
  onReturnFocus: () => void
}

type MenuAction = 'replace' | 'alt' | 'open' | 'delete'

/** Keeps the press off ProseMirror: the picture stays selected and the editor keeps no caret. */
function holdSelection(event: SyntheticEvent) {
  event.preventDefault()
  event.stopPropagation()
}

function ToolbarTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  )
}

function AltTextForm({ alt, onDraftChange, onSave }: { alt: string; onDraftChange: (draft: string) => void; onSave: () => void }) {
  const [draft, setDraft] = useState(alt)
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    onSave()
  }
  return (
    <Input
      aria-label={t('editor.image.altText')}
      autoFocus
      data-testid="image-alt-text-input"
      placeholder={t('editor.image.altTextPlaceholder')}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value)
        onDraftChange(event.target.value)
      }}
      onKeyDown={handleKeyDown}
    />
  )
}

// Enter and a click away both save the alt text; Esc cancels (AIM-531).
function useAltTextPopover(props: Pick<ImageToolbarProps, 'alt' | 'onAltChange' | 'onPopupOpenChange' | 'onReturnFocus'>) {
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  const draftRef = useRef(props.alt)

  const show = () => {
    draftRef.current = props.alt
    openRef.current = true
    setOpen(true)
    props.onPopupOpenChange(true)
  }
  const close = (save: boolean) => {
    if (!openRef.current) return
    openRef.current = false
    setOpen(false)
    props.onPopupOpenChange(false)
    if (save && draftRef.current !== props.alt) props.onAltChange(draftRef.current)
    props.onReturnFocus()
  }

  return {
    open,
    show,
    close,
    form: (
      <AltTextForm
        alt={props.alt}
        onDraftChange={(draft) => {
          draftRef.current = draft
        }}
        onSave={() => close(true)}
      />
    ),
  }
}

function ImageToolbarMenu(props: ImageToolbarProps & { onAltText: () => void }) {
  const [open, setOpen] = useState(false)
  // The chosen action runs once the menu has closed and let go of the focus,
  // so the Alt text popover or the Upload / Embed panel it opens is not
  // dismissed by the focus coming back to the trigger.
  const pendingActionRef = useRef<MenuAction | null>(null)
  const runPendingAction = () => {
    const action = pendingActionRef.current
    pendingActionRef.current = null
    if (action === 'replace') props.onReplace()
    else if (action === 'alt') props.onAltText()
    else if (action === 'open') props.onOpen()
    else if (action === 'delete') props.onDelete()
    else props.onReturnFocus()
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        props.onPopupOpenChange(next)
      }}
    >
      <ToolbarTooltip label={t('editor.image.more')}>
        <DropdownMenuTrigger asChild>
          <Button aria-label={t('editor.image.more')} data-testid="image-toolbar-more" size="icon-xs" type="button" variant="icon">
            <DotsThree aria-hidden="true" weight="bold" />
          </Button>
        </DropdownMenuTrigger>
      </ToolbarTooltip>
      <DropdownMenuContent
        align="end"
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          runPendingAction()
        }}
      >
        <DropdownMenuItem onSelect={() => { pendingActionRef.current = 'replace' }}>
          <Swap aria-hidden="true" />
          {t('editor.image.replace')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { pendingActionRef.current = 'alt' }}>
          <Textbox aria-hidden="true" />
          {t('editor.image.altText')}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { pendingActionRef.current = 'open' }}>
          {props.remote ? <Globe aria-hidden="true" /> : <ArrowSquareOut aria-hidden="true" />}
          {t(props.remote ? 'editor.image.openInBrowser' : 'editor.image.openWithDefaultApp')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => { pendingActionRef.current = 'delete' }} variant="destructive">
          <Trash aria-hidden="true" />
          {t('editor.image.delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function ImageToolbar(props: ImageToolbarProps) {
  const altText = useAltTextPopover(props)

  return (
    <Popover open={altText.open} onOpenChange={(next) => { if (!next) altText.close(true) }}>
      <PopoverAnchor asChild>
        <div
          className={cn(
            'absolute right-2 z-raised transition-opacity duration-150 ease-out',
            props.placement === 'inside' ? 'top-2' : 'right-0 bottom-full pb-1',
            props.shown ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
          data-image-toolbar={props.placement}
          data-testid="image-toolbar"
          contentEditable={false}
          suppressContentEditableWarning
          onMouseDown={holdSelection}
          onDoubleClick={holdSelection}
        >
          <FloatingIconGroup aria-hidden={!props.shown} aria-label={t('editor.image.toolbar')} role="toolbar">
            <ToolbarTooltip label={t('editor.image.caption')}>
              <Button aria-label={t('editor.image.caption')} data-testid="image-toolbar-caption" onClick={props.onCaption}
                size="icon-xs" tabIndex={props.shown ? 0 : -1} type="button" variant="icon">
                <Subtitles aria-hidden="true" />
              </Button>
            </ToolbarTooltip>
            <ToolbarTooltip label={t('editor.image.preview')}>
              <Button aria-label={t('editor.image.preview')} data-testid="image-toolbar-preview" disabled={props.previewDisabled}
                onClick={props.onPreview} size="icon-xs" tabIndex={props.shown ? 0 : -1} type="button" variant="icon">
                <ArrowsOut aria-hidden="true" />
              </Button>
            </ToolbarTooltip>
            <ImageToolbarMenu {...props} onAltText={altText.show} />
          </FloatingIconGroup>
        </div>
      </PopoverAnchor>
      <PopoverContent
        align="end"
        className="w-64 p-2"
        onCloseAutoFocus={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          event.preventDefault()
          altText.close(false)
        }}
      >
        {altText.form}
      </PopoverContent>
    </Popover>
  )
}

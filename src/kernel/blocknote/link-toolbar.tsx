import { LinkToolbarExtension } from '@blocknote/core/extensions'
import { useDictionary, useExtension, type LinkToolbarProps } from '@blocknote/react'
import { Globe, LinkBreak, PencilSimple } from '@phosphor-icons/react'
import { useCallback, useState, type ReactNode } from 'react'
import { translate } from '@/lib/i18n'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { Toolbar, ToolbarButton, ToolbarSeparator } from '@/ui/toolbar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { LinkForm } from './link-form'

// The Link toolbar (CONTEXT.md): what shows over a link under the caret or
// the pointer, Plumo's own on the shared toolbar (ui/toolbar), as Notion's:
//
//   [🌐 the URL] | [Edit] [Remove]
//
// The URL opens the link the way ⌘+click does (onOpenLink, see
// useEditorLinkActivation). Edit opens the link form (link-form.tsx) below the
// toolbar, the URL and the text, and holds the toolbar where it is while the
// form is open (BlockNote's setToolbarPositionFrozen). Remove takes the link
// mark off and closes the toolbar. BlockNote's LinkToolbarController places it.

type OpenLink = { onOpenLink: (href: string) => void }

function LinkToolbarTooltip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function LinkToolbar({
  onOpenLink,
  range,
  setToolbarOpen,
  setToolbarPositionFrozen,
  text,
  url,
}: LinkToolbarProps & OpenLink) {
  const dict = useDictionary()
  const { deleteLink } = useExtension(LinkToolbarExtension)
  const [editing, setEditing] = useState(false)
  const setEditOpen = useCallback((open: boolean) => {
    setEditing(open)
    setToolbarPositionFrozen?.(open)
  }, [setToolbarPositionFrozen])

  const openLabel = dict.link_toolbar.open.tooltip
  const editLabel = dict.link_toolbar.edit.text
  const removeLabel = dict.link_toolbar.delete.tooltip

  return (
    <Popover open={editing} onOpenChange={setEditOpen}>
      <PopoverAnchor asChild>
        <Toolbar aria-label={translate('en', 'editor.link.toolbar')} data-link-toolbar="" variant="floating">
          <LinkToolbarTooltip label={openLabel}>
            <ToolbarButton aria-label={openLabel} data-test="openLink" onClick={() => onOpenLink(url)}>
              <Globe aria-hidden="true" />
              <span className="max-w-60 truncate">{url}</span>
            </ToolbarButton>
          </LinkToolbarTooltip>
          <ToolbarSeparator />
          {/* The tooltip trigger is the popover trigger's child, so the popover's open / closed data-state is the one the button keeps. */}
          <Tooltip>
            <PopoverTrigger asChild>
              <TooltipTrigger asChild>
                <ToolbarButton aria-label={editLabel} data-test="editLink">
                  <PencilSimple aria-hidden="true" />
                </ToolbarButton>
              </TooltipTrigger>
            </PopoverTrigger>
            <TooltipContent>{editLabel}</TooltipContent>
          </Tooltip>
          <LinkToolbarTooltip label={removeLabel}>
            <ToolbarButton
              aria-label={removeLabel}
              data-test="removeLink"
              onClick={() => {
                deleteLink(range.from)
                setToolbarOpen?.(false)
              }}
            >
              <LinkBreak aria-hidden="true" />
            </ToolbarButton>
          </LinkToolbarTooltip>
        </Toolbar>
      </PopoverAnchor>
      <PopoverContent align="start" variant="compact">
        <LinkForm
          key={`${url}\u0000${text}`}
          onDone={() => {
            setToolbarOpen?.(false)
            setEditOpen(false)
          }}
          range={range}
          showTextField
          text={text}
          url={url}
        />
      </PopoverContent>
    </Popover>
  )
}

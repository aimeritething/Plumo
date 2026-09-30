import { useRef, type ComponentProps, type ReactNode } from 'react'
import { Code, DotsThree, LinkSimple, TextAa, type Icon } from '@phosphor-icons/react'
import { APP_COMMAND_DEFINITIONS, APP_COMMAND_IDS, type AppCommandId } from '@/shell/app-command-catalog'
import type { EditorMode } from '@/types'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

/** A shortcut as the manifest writes it (`⌘\\`): Plumo v0.1 is a macOS app, like the sidebar toggle's `⌘[`. */
const shortcutOf = (id: AppCommandId) => APP_COMMAND_DEFINITIONS[id].shortcut?.display
const TOGGLE_SHORTCUT = shortcutOf(APP_COMMAND_IDS.editToggleRawEditor)
const COPY_PATH_SHORTCUT = shortcutOf(APP_COMMAND_IDS.editCopyPath)
const FIND_SHORTCUT = shortcutOf(APP_COMMAND_IDS.editFindInNote)
const CLOSE_TAB_SHORTCUT = shortcutOf(APP_COMMAND_IDS.fileCloseTab)
const MODE_LABELS: Record<EditorMode, string> = { rich: 'Rich', raw: 'Raw' }
const MODE_ICONS: Record<EditorMode, Icon> = { rich: TextAa, raw: Code }
const MODES: readonly EditorMode[] = ['rich', 'raw']

/** A Document Tab's mode, as the tab bar shows and switches it. */
export interface TabMode {
  value: EditorMode
  /** Asked for the other segment. */
  onChange: (mode: EditorMode) => void
  /** The tooltip that replaces the shortcut on the Rich segment while it is unavailable, or null when Rich can be used. */
  richDisabledReason: string | null
}

/**
 * The "…" menu's commands, each the same handler its File or Edit menu item
 * runs. One left out is shown greyed, as the menu bar greys it.
 */
export interface DocumentMenuActions {
  /** Whether the Document is in the Pinned list, which names the first item Pin or Unpin. */
  pinned?: boolean
  onTogglePin?: () => void
  onRevealInFinder?: () => void
  onOpenInDefaultApp?: () => void
  onFind?: () => void
  onCloseTab?: () => void
}

interface DocumentTabActionsProps {
  mode: TabMode
  /** Copy path, the app command (⌘⇧,). */
  onCopyPath?: () => void
  menu: DocumentMenuActions
}

/**
 * A Document Tab's controls at the tab bar's right end: Copy path, the
 * `Rich | Raw` control and "…". A landed write shows nothing here, and neither
 * does Frontmatter: Properties shows it above the body.
 */
export function DocumentTabActions({ mode, onCopyPath, menu }: DocumentTabActionsProps) {
  return (
    <div className="flex items-center gap-2" data-testid="document-tab-actions">
      {onCopyPath && <CopyPathButton onCopyPath={onCopyPath} />}
      <ModeControl mode={mode} />
      <DocumentMenu menu={menu} />
    </div>
  )
}

interface ImageTabActionsProps {
  /** `1920 × 1080 · 240 KB`, or null until the picture has loaded and there is a size to name. */
  metadata: string | null
  /** Open ↗: Open in Default App, the way to hand the picture to a real image app. */
  onOpenExternal: () => void
  onCopyPath?: () => void
}

/**
 * An Image Tab's controls: what the picture is, Open ↗ and Copy path. It has
 * no Frontmatter, no mode and no "…". The arrow is Open's label, not an icon
 * beside it.
 */
export function ImageTabActions({ metadata, onOpenExternal, onCopyPath }: ImageTabActionsProps) {
  return (
    <div className="flex items-center gap-1.5" data-testid="image-tab-actions">
      {metadata && (
        <span className="cursor-default pr-1.5 font-mono text-2xs tracking-normal whitespace-nowrap text-text-tertiary tabular-nums" data-testid="image-meta">{metadata}</span>
      )}
      <button
        type="button"
        className="flex h-6.5 flex-none items-center rounded-full px-2.5 text-sm font-medium whitespace-nowrap text-text-primary inset-ring inset-ring-border-default hover:bg-control-secondary-hover focus-visible:focus-ring"
        data-testid="image-open-external"
        onClick={onOpenExternal}
      >
        Open ↗
      </button>
      {onCopyPath && <CopyPathButton onCopyPath={onCopyPath} />}
    </div>
  )
}

/** The link button, its tooltip naming Copy path's shortcut as a chip. */
function CopyPathButton({ onCopyPath }: { onCopyPath: () => void }) {
  return (
    <TabActionTooltip label="Copy path" shortcut={COPY_PATH_SHORTCUT}>
      <Button variant="icon" size="icon-xs" aria-label="Copy path" data-testid="tab-copy-path" onClick={onCopyPath}>
        <LinkSimple aria-hidden="true" />
      </Button>
    </TabActionTooltip>
  )
}

/**
 * `Rich | Raw`: a pill track on the shade surface, two icon segments (Aa for
 * Rich, </> for Raw), the current one a raised white pill, each with a
 * tooltip naming the mode and the shortcut as a chip. Invalid Frontmatter
 * leaves the Rich segment in place but unavailable, faded, its tooltip saying
 * why. It is marked with aria-disabled rather than the disabled attribute so
 * it still takes the pointer and can show that tooltip; `aria-checked` is the
 * one source of which segment is current.
 */
function ModeControl({ mode }: { mode: TabMode }) {
  return (
    <div className="flex h-6.5 flex-none items-center gap-0.5 rounded-full bg-surface-shade p-0.5" role="radiogroup" aria-label="Editor mode" data-testid="tab-mode">
      {MODES.map((segment) => {
        const active = segment === mode.value
        const disabledReason = segment === 'rich' ? mode.richDisabledReason : null
        const SegmentIcon = MODE_ICONS[segment]
        return (
          <TabActionTooltip key={segment} label={disabledReason ?? MODE_LABELS[segment]} shortcut={disabledReason === null ? TOGGLE_SHORTCUT : undefined}>
            <button
              type="button"
              role="radio"
              className="grid h-5.5 w-7 place-items-center rounded-full text-text-tertiary transition-colors duration-150 ease-out hover:text-text-secondary focus-visible:focus-ring aria-checked:bg-surface-popover aria-checked:text-text-heading aria-checked:shadow-raised aria-disabled:text-text-muted"
              aria-label={MODE_LABELS[segment]}
              aria-checked={active}
              aria-disabled={disabledReason !== null || undefined}
              data-testid={`tab-mode-${segment}`}
              onClick={() => {
                if (active || disabledReason !== null) return
                mode.onChange(segment)
              }}
            >
              <SegmentIcon size={16} aria-hidden="true" />
            </button>
          </TabActionTooltip>
        )
      })}
    </div>
  )
}

/**
 * "…": Pin or Unpin, Reveal in Finder, Open in Default App, then Find and
 * Close Tab with their shortcuts. Every item is a manifest command, so the
 * menu bar and the Command Menu hold the same ones. Closing the menu hands
 * focus back to "…", except after Find: the find bar has just focused its
 * input, and the search is typed there.
 */
function DocumentMenu({ menu }: { menu: DocumentMenuActions }) {
  const findChosen = useRef(false)
  const onFind = menu.onFind
  return (
    <DropdownMenu>
      {/* The tooltip trigger sits inside the menu trigger, so the menu's open / closed data-state is the one the button keeps. */}
      <DropdownMenuTrigger asChild>
        <TabActionTooltip label="More">
          <Button variant="icon" size="icon-xs" aria-label="More" data-testid="tab-more">
            <DotsThree aria-hidden="true" />
          </Button>
        </TabActionTooltip>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="min-w-50"
        data-testid="tab-more-menu"
        onCloseAutoFocus={(event) => {
          if (!findChosen.current) return
          findChosen.current = false
          event.preventDefault()
        }}
      >
        <MenuItem label={menu.pinned ? 'Unpin' : 'Pin'} onSelect={menu.onTogglePin} />
        <MenuItem label="Reveal in Finder" onSelect={menu.onRevealInFinder} />
        <MenuItem label="Open in Default App" onSelect={menu.onOpenInDefaultApp} />
        <DropdownMenuSeparator />
        <MenuItem
          label="Find"
          shortcut={FIND_SHORTCUT}
          onSelect={onFind && (() => {
            findChosen.current = true
            onFind()
          })}
        />
        <MenuItem label="Close Tab" shortcut={CLOSE_TAB_SHORTCUT} onSelect={menu.onCloseTab} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MenuItem({ label, shortcut, onSelect }: { label: string; shortcut?: string; onSelect?: () => void }) {
  return (
    <DropdownMenuItem disabled={!onSelect} onSelect={onSelect}>
      {label}
      {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  )
}

function TabActionTooltip({ label, shortcut, children, ...triggerProps }: { label: string; shortcut?: string; children: ReactNode } & ComponentProps<'button'>) {
  return (
    <Tooltip>
      {/* Props a menu trigger hands down (as its Slot child) go on to the button. */}
      <TooltipTrigger asChild {...triggerProps}>{children}</TooltipTrigger>
      <TooltipContent side="bottom" shortcut={shortcut}>{label}</TooltipContent>
    </Tooltip>
  )
}

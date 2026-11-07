import { useRef } from 'react'
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
import { SimpleTooltip } from '@/ui/tooltip'
import { ToggleGroup, ToggleGroupItem } from '@/ui/toggle-group'

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
  onDuplicate?: () => void
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
 * does Frontmatter: Raw mode is where it is seen.
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
        <span className="cursor-default pr-1.5 font-mono text-2xs tracking-normal whitespace-nowrap text-muted-foreground tabular-nums" data-testid="image-meta">{metadata}</span>
      )}
      <Button variant="outline" size="pill" data-testid="image-open-external" onClick={onOpenExternal}>
        Open ↗
      </Button>
      {onCopyPath && <CopyPathButton onCopyPath={onCopyPath} />}
    </div>
  )
}

/** The link button, its tooltip naming Copy path's shortcut as a chip. */
function CopyPathButton({ onCopyPath }: { onCopyPath: () => void }) {
  return (
    <SimpleTooltip label="Copy path" shortcut={COPY_PATH_SHORTCUT} side="bottom">
      <Button variant="icon" size="icon-xs" aria-label="Copy path" data-testid="tab-copy-path" onClick={onCopyPath}>
        <LinkSimple aria-hidden="true" />
      </Button>
    </SimpleTooltip>
  )
}

/**
 * `Rich | Raw`: the segmented toggle group, two icon segments (Aa for Rich,
 * </> for Raw), each with a tooltip naming the mode and the shortcut as a
 * chip. Invalid Frontmatter leaves the Rich segment in place but unavailable,
 * faded, its tooltip saying why. It is marked with aria-disabled rather than
 * the disabled attribute so it still takes the pointer and the focus and can
 * show that tooltip; choosing it is refused here instead. A click on the
 * current segment, which a single toggle group reads as clearing the choice,
 * is refused too: a Tab is always in one mode.
 */
function ModeControl({ mode }: { mode: TabMode }) {
  const choose = (next: string) => {
    const segment = MODES.find((candidate) => candidate === next)
    if (segment === undefined) return
    if (segment === 'rich' && mode.richDisabledReason !== null) return
    mode.onChange(segment)
  }

  return (
    <ToggleGroup type="single" variant="segmented" value={mode.value} onValueChange={choose} aria-label="Editor mode" data-testid="tab-mode">
      {MODES.map((segment) => {
        const disabledReason = segment === 'rich' ? mode.richDisabledReason : null
        const SegmentIcon = MODE_ICONS[segment]
        return (
          <SimpleTooltip key={segment} label={disabledReason ?? MODE_LABELS[segment]} shortcut={disabledReason === null ? TOGGLE_SHORTCUT : undefined} side="bottom">
            <ToggleGroupItem
              value={segment}
              aria-label={MODE_LABELS[segment]}
              aria-disabled={disabledReason !== null || undefined}
              data-testid={`tab-mode-${segment}`}
            >
              <SegmentIcon aria-hidden="true" />
            </ToggleGroupItem>
          </SimpleTooltip>
        )
      })}
    </ToggleGroup>
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
        <SimpleTooltip label="More" side="bottom">
          <Button variant="icon" size="icon-xs" aria-label="More" data-testid="tab-more">
            <DotsThree aria-hidden="true" />
          </Button>
        </SimpleTooltip>
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
        <MenuItem label="Duplicate" onSelect={menu.onDuplicate} />
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


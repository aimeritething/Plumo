import { useRef } from 'react'
import { Code, DotsThree, LinkSimple } from '@phosphor-icons/react'
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
import { Toggle } from '@/ui/toggle'

/** A shortcut as the manifest writes it (`⌘\\`): Plumo v0.1 is a macOS app, like the sidebar toggle's `⌘[`. */
const shortcutOf = (id: AppCommandId) => APP_COMMAND_DEFINITIONS[id].shortcut?.display
const TOGGLE_SHORTCUT = shortcutOf(APP_COMMAND_IDS.editToggleRawEditor)
const COPY_PATH_SHORTCUT = shortcutOf(APP_COMMAND_IDS.editCopyPath)
const FIND_SHORTCUT = shortcutOf(APP_COMMAND_IDS.editFindInNote)
const CLOSE_TAB_SHORTCUT = shortcutOf(APP_COMMAND_IDS.fileCloseTab)
const SOURCE_MODE_LABEL = 'Source mode'

/** A Document Tab's mode, as the tab bar shows and switches it. */
export interface TabMode {
  value: EditorMode
  /** Asked for the other mode. */
  onChange: (mode: EditorMode) => void
  /** The tooltip that replaces the name and the shortcut while Rich mode is unavailable, or null when Rich can be used. */
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
 * Source mode button and "…". A landed write shows nothing here, and neither
 * does Frontmatter: Source mode is where it is seen.
 */
export function DocumentTabActions({ mode, onCopyPath, menu }: DocumentTabActionsProps) {
  return (
    <div className="flex items-center gap-1" data-testid="document-tab-actions">
      {onCopyPath && <CopyPathButton onCopyPath={onCopyPath} />}
      <SourceModeButton mode={mode} />
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
    <div className="flex items-center gap-1" data-testid="image-tab-actions">
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
      <Button variant="icon" size="icon" aria-label="Copy path" data-testid="tab-copy-path" onClick={onCopyPath}>
        <LinkSimple aria-hidden="true" />
      </Button>
    </SimpleTooltip>
  )
}

/**
 * The Source mode button: one `</>` icon button that is on while the Tab is in
 * Source mode (`raw` in code) and bare, like its neighbours, in Rich mode. Its
 * tooltip names the mode and the shortcut as a chip, the same in both states:
 * the fill says which mode the Tab is in. Invalid Frontmatter holds the Tab in
 * Source mode: the button stays on but faded, its tooltip saying why, and a
 * press is refused. It is marked with aria-disabled rather than the disabled
 * attribute so it still takes the pointer and the focus and can show that
 * tooltip.
 */
function SourceModeButton({ mode }: { mode: TabMode }) {
  const inSourceMode = mode.value === 'raw'
  const lockedReason = inSourceMode ? mode.richDisabledReason : null

  return (
    <SimpleTooltip label={lockedReason ?? SOURCE_MODE_LABEL} shortcut={lockedReason === null ? TOGGLE_SHORTCUT : undefined} side="bottom">
      <Toggle
        variant="icon"
        size="icon"
        pressed={inSourceMode}
        onPressedChange={(pressed) => {
          if (lockedReason === null) mode.onChange(pressed ? 'raw' : 'rich')
        }}
        aria-label={SOURCE_MODE_LABEL}
        aria-disabled={lockedReason !== null || undefined}
        data-testid="tab-mode"
      >
        <Code aria-hidden="true" />
      </Toggle>
    </SimpleTooltip>
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
      {/* The tooltip sits inside the menu trigger, so the menu's open / closed state is the one the button keeps. */}
      <DropdownMenuTrigger
        render={(
          <SimpleTooltip label="More" side="bottom">
            <Button variant="icon" size="icon" aria-label="More" data-testid="tab-more">
              <DotsThree aria-hidden="true" />
            </Button>
          </SimpleTooltip>
        )}
      />
      <DropdownMenuContent
        align="end"
        className="min-w-50"
        data-testid="tab-more-menu"
        finalFocus={() => {
          if (!findChosen.current) return true
          findChosen.current = false
          return false
        }}
      >
        <MenuItem label={menu.pinned ? 'Unpin' : 'Pin'} onClick={menu.onTogglePin} />
        <MenuItem label="Duplicate" onClick={menu.onDuplicate} />
        <MenuItem label="Reveal in Finder" onClick={menu.onRevealInFinder} />
        <MenuItem label="Open in Default App" onClick={menu.onOpenInDefaultApp} />
        <DropdownMenuSeparator />
        <MenuItem
          label="Find"
          shortcut={FIND_SHORTCUT}
          onClick={onFind && (() => {
            findChosen.current = true
            onFind()
          })}
        />
        <MenuItem label="Close Tab" shortcut={CLOSE_TAB_SHORTCUT} onClick={menu.onCloseTab} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function MenuItem({ label, shortcut, onClick }: { label: string; shortcut?: string; onClick?: () => void }) {
  return (
    <DropdownMenuItem disabled={!onClick} onClick={onClick}>
      {label}
      {shortcut && <DropdownMenuShortcut>{shortcut}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  )
}


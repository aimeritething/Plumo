import { Command as CommandIcon, FileText, Image as ImageIcon, type Icon } from '@phosphor-icons/react'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { isImeKeyEvent } from '@/lib/ime-key-event'
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus'
import { Dialog, DialogContent, DialogTitle } from '@/ui/dialog'
import { ScrollArea } from '@/ui/scroll-area'
import {
  matchCommandMenu,
  type CommandMenuEntry,
  type CommandMenuEntryKind,
  type CommandMenuMatch,
  type CommandMenuMode,
  type CommandMenuRange,
} from './command-menu-matcher'

export interface CommandMenuProps {
  open: boolean
  /** ⌘K shows commands, and files once the user types; ⌘P (Quick Open) shows files only. */
  mode: CommandMenuMode
  /** Every row the palette can show: the menu-bar commands and the Folder's files. */
  entries: readonly CommandMenuEntry[]
  onClose: () => void
  onRunCommand: (commandId: string) => void
  /** ↵ opens; ⌘↵ asks for Raw, which only a Document honours. */
  onOpenFile: (path: string, options: { raw: boolean }) => void
}

type CommandMenuPanelProps = Omit<CommandMenuProps, 'open' | 'onClose'>

const ROW_ICONS: Record<CommandMenuEntryKind, Icon> = {
  command: CommandIcon,
  document: FileText,
  image: ImageIcon,
}

const TYPE_LABELS: Record<CommandMenuEntryKind, string> = {
  command: 'Command',
  document: 'Document',
  image: 'Image',
}

const PLACEHOLDERS: Record<CommandMenuMode, string> = {
  commands: 'Search commands and files…',
  files: 'Search files by name…',
}

const TITLES: Record<CommandMenuMode, string> = {
  commands: 'Command Menu',
  files: 'Quick Open',
}

const FOOTER = '↵ open · ⌘↵ open in Raw · esc close'
const LIST_ID = 'plumo-command-menu-list'

function rowId(index: number): string {
  return `plumo-command-menu-row-${index}`
}

/** The name with the matched characters emphasised: bold, no highlight box. */
function emphasised(name: string, ranges: readonly CommandMenuRange[]): ReactNode[] {
  const parts: ReactNode[] = []
  let cursor = 0
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(name.slice(cursor, start))
    parts.push(<mark key={start} className="bg-transparent font-semibold text-text-heading">{name.slice(start, end)}</mark>)
    cursor = end
  }
  if (cursor < name.length) parts.push(name.slice(cursor))
  return parts
}

function wrap(index: number, length: number): number {
  return (index + length) % length
}

function isEnabled(entry: CommandMenuEntry): boolean {
  return entry.enabled !== false
}

interface CommandMenuRowProps {
  match: CommandMenuMatch
  index: number
  active: boolean
  onHover: (index: number) => void
  onPick: (entry: CommandMenuEntry, event: MouseEvent) => void
}

/**
 * One 40px row: icon, name, the muted detail, the shortcut in the menu
 * sub-theme's Inter 11/500, and the 64px right-aligned type column. The
 * highlighted row is the one `aria-selected`; a disabled command is dimmed.
 */
function CommandMenuRow({ match, index, active, onHover, onPick }: CommandMenuRowProps) {
  const { entry, ranges } = match
  const RowIcon = ROW_ICONS[entry.kind]
  const enabled = isEnabled(entry)
  return (
    <li
      id={rowId(index)}
      role="option"
      aria-selected={active}
      aria-disabled={enabled ? undefined : true}
      className="group flex h-10 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-sm whitespace-nowrap aria-selected:bg-menu-item-hover aria-selected:text-text-heading aria-disabled:opacity-45"
      data-testid="command-menu-row"
      data-kind={entry.kind}
      data-id={entry.id}
      onMouseMove={() => onHover(index)}
      onClick={(event) => onPick(entry, event)}
    >
      <RowIcon size={16} className="flex-none text-text-secondary group-aria-selected:text-text-primary" aria-hidden="true" />
      <span className="min-w-0 flex-initial truncate" data-testid="command-menu-row-name">{emphasised(entry.name, ranges)}</span>
      {entry.detail && (
        <span className="min-w-0 flex-auto truncate text-xs text-text-muted" data-testid="command-menu-row-detail">{entry.detail}</span>
      )}
      {entry.shortcut && (
        <span className="ml-auto flex-none font-sans text-2xs font-medium text-menu-shortcut" data-testid="command-menu-row-shortcut">{entry.shortcut}</span>
      )}
      {/* Without a shortcut the type column pushes itself to the right edge. */}
      <span className={cn('w-16 flex-none text-right text-2xs text-text-muted', !entry.shortcut && 'ml-auto')} data-testid="command-menu-row-type">
        {TYPE_LABELS[entry.kind]}
      </span>
    </li>
  )
}

/**
 * The palette's body: the 56px input row, the results in a scroll area under
 * it with no group header, the mono footer. Mounted only while open, so the
 * query and the selection start fresh every time; a mode switch while open
 * keeps the query.
 */
function CommandMenuPanel({ mode, entries, onRunCommand, onOpenFile }: CommandMenuPanelProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const listRef = useRef<HTMLUListElement | null>(null)
  const matches = useMemo(() => matchCommandMenu(entries, query, mode), [entries, mode, query])
  const activeIndex = matches.length === 0 ? -1 : Math.min(selectedIndex, matches.length - 1)

  useEffect(() => {
    if (activeIndex < 0) return
    const row = listRef.current?.querySelector<HTMLElement>(`#${rowId(activeIndex)}`)
    row?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

  const pick = (entry: CommandMenuEntry, raw: boolean) => {
    if (entry.kind === 'command' && !isEnabled(entry)) return
    if (entry.kind === 'command') onRunCommand(entry.id)
    else onOpenFile(entry.id, { raw: raw && entry.kind === 'document' })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // While a candidate window is open, ↵ and the arrows are the input method's.
    if (isImeKeyEvent(event.nativeEvent)) return
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (matches.length === 0) return
      setSelectedIndex(wrap(activeIndex + (event.key === 'ArrowDown' ? 1 : -1), matches.length))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      const match = matches[activeIndex]
      if (match) pick(match.entry, event.metaKey)
    }
  }

  return (
    <>
      <DialogTitle className="sr-only">{TITLES[mode]}</DialogTitle>
      <input
        // 17px light with a touch of negative tracking: the palette's one display size, outside the four-tier UI scale.
        className="h-14 flex-none border-b-hairline border-border-popover bg-transparent px-5 text-[17px] font-light tracking-[-0.01em] text-text-heading outline-none placeholder:text-text-tertiary"
        data-testid="command-menu-input"
        role="combobox"
        aria-expanded="true"
        aria-controls={LIST_ID}
        aria-activedescendant={activeIndex >= 0 ? rowId(activeIndex) : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        placeholder={PLACEHOLDERS[mode]}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          setSelectedIndex(0)
        }}
        onKeyDown={onKeyDown}
      />
      <ScrollArea className="max-h-100 min-h-0 flex-auto">
        <ul id={LIST_ID} ref={listRef} role="listbox" aria-label={TITLES[mode]} className="list-none p-1.5">
          {matches.length === 0 && (
            <li className="flex h-10 items-center px-2.5 text-sm text-text-tertiary" data-testid="command-menu-empty" aria-disabled="true">No matches</li>
          )}
          {matches.map((match, index) => (
            <CommandMenuRow
              key={`${match.entry.kind}:${match.entry.id}`}
              match={match}
              index={index}
              active={index === activeIndex}
              onHover={setSelectedIndex}
              onPick={(entry, event) => pick(entry, event.metaKey)}
            />
          ))}
        </ul>
      </ScrollArea>
      <footer className="flex h-8 flex-none items-center border-t-hairline border-border-popover px-4 font-mono text-2xs text-text-secondary" data-testid="command-menu-footer">
        {FOOTER}
      </footer>
    </>
  )
}

/**
 * The Command Menu and Quick Open: one palette, two
 * modes, over the whole window. The `palette` dialog gives it the backdrop,
 * the focus trap, esc and its place a quarter of the way down; the rows and
 * the matcher are Plumo's own. New Plumo code on the shared command manifest.
 */
export function CommandMenu({ open, mode, entries, onClose, onRunCommand, onOpenFile }: CommandMenuProps) {
  // Esc, a click outside and a row that ran something which takes no focus
  // hand focus back to where it was; a row that ran a find bar, a rename or
  // opened a Document leaves the focus that took (AIM-457).
  const returnFocus = useDialogReturnFocus()
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        variant="palette"
        className="w-140 max-w-[calc(100vw-32px)] max-h-[calc(76%-24px)] overflow-hidden"
        data-testid="command-menu"
        data-mode={mode}
        data-command-palette="true"
        aria-describedby={undefined}
        // Esc cancelling a candidate does not close the palette.
        onEscapeKeyDown={(event) => { if (isImeKeyEvent(event)) event.preventDefault() }}
        {...returnFocus}
      >
        <CommandMenuPanel mode={mode} entries={entries} onRunCommand={onRunCommand} onOpenFile={onOpenFile} />
      </DialogContent>
    </Dialog>
  )
}

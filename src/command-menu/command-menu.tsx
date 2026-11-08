import { Command as CommandIcon, FileText, Image as ImageIcon, type Icon } from '@phosphor-icons/react'
import { useMemo, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import { isImeKeyEvent } from '@/lib/ime-key-event'
import { useDialogReturnFocus } from '@/lib/use-dialog-return-focus'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/ui/command'
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

const DESCRIPTIONS: Record<CommandMenuMode, string> = {
  commands: 'Search the commands and the Folder’s files.',
  files: 'Search the Folder’s files by name.',
}

const FOOTER = '↵ open · ⌘↵ open in Raw · esc close'

/** The name with the matched characters emphasised: bold, no highlight box. */
function emphasised(name: string, ranges: readonly CommandMenuRange[]): ReactNode[] {
  const parts: ReactNode[] = []
  let cursor = 0
  for (const [start, end] of ranges) {
    if (start > cursor) parts.push(name.slice(cursor, start))
    parts.push(<mark key={start} className="bg-transparent font-semibold text-foreground">{name.slice(start, end)}</mark>)
    cursor = end
  }
  if (cursor < name.length) parts.push(name.slice(cursor))
  return parts
}

function isEnabled(entry: CommandMenuEntry): boolean {
  return entry.enabled !== false
}

interface CommandMenuRowProps {
  match: CommandMenuMatch
  onPick: (entry: CommandMenuEntry) => void
  /** Notes whether ⌘ was held on the click that is about to pick this row. */
  onPointerPick: (raw: boolean) => void
}

/**
 * One row: icon, name, the muted detail, the shortcut, and the 64px
 * right-aligned type column. A disabled command is dimmed, and the arrows
 * and the pointer pass over it.
 */
function CommandMenuRow({ match, onPick, onPointerPick }: CommandMenuRowProps) {
  const { entry, ranges } = match
  const RowIcon = ROW_ICONS[entry.kind]
  return (
    <CommandItem
      value={`${entry.kind}:${entry.id}`}
      disabled={!isEnabled(entry)}
      onSelect={() => onPick(entry)}
      // cmdk owns the row's click and hands `onSelect` no event, so the
      // modifier is read on the way down, before its click handler runs.
      onClickCapture={(event) => onPointerPick(event.metaKey)}
      data-testid="command-menu-row"
      data-kind={entry.kind}
      data-id={entry.id}
    >
      <RowIcon aria-hidden="true" />
      <span className="min-w-0 flex-initial truncate" data-testid="command-menu-row-name">{emphasised(entry.name, ranges)}</span>
      {entry.detail && (
        <span className="min-w-0 flex-auto truncate text-xs text-subtle-foreground" data-testid="command-menu-row-detail">{entry.detail}</span>
      )}
      {entry.shortcut && <CommandShortcut data-testid="command-menu-row-shortcut">{entry.shortcut}</CommandShortcut>}
      {/* Without a shortcut the type column pushes itself to the right edge. */}
      <span className={cn('w-16 flex-none text-right text-2xs text-subtle-foreground', !entry.shortcut && 'ml-auto')} data-testid="command-menu-row-type">
        {TYPE_LABELS[entry.kind]}
      </span>
    </CommandItem>
  )
}

/**
 * The palette's body: the input row, the results under it in one group with
 * no header, the mono footer. Mounted only while open, so the query and the
 * selection start fresh every time; a mode switch while open keeps the query.
 * The matcher filters and ranks, so cmdk shows the rows as given; it moves
 * the highlight, and leaves ↵ and the arrows alone while the input method is
 * composing.
 */
function CommandMenuPanel({ mode, entries, onRunCommand, onOpenFile }: CommandMenuPanelProps) {
  const [query, setQuery] = useState('')
  const matches = useMemo(() => matchCommandMenu(entries, query, mode), [entries, mode, query])
  // Whether the ↵ or the click that picks a row had ⌘ held: cmdk calls
  // `onSelect` with the row's value only.
  const rawRef = useRef(false)

  const pick = (entry: CommandMenuEntry) => {
    if (entry.kind === 'command') {
      if (isEnabled(entry)) onRunCommand(entry.id)
      return
    }
    onOpenFile(entry.id, { raw: rawRef.current && entry.kind === 'document' })
  }

  return (
    <>
      <CommandInput
        data-testid="command-menu-input"
        autoCapitalize="off"
        placeholder={PLACEHOLDERS[mode]}
        value={query}
        onValueChange={setQuery}
        onKeyDown={(event) => {
          if (event.key === 'Enter') rawRef.current = event.metaKey
        }}
      />
      <CommandList aria-label={TITLES[mode]}>
        <CommandEmpty data-testid="command-menu-empty">No matches</CommandEmpty>
        <CommandGroup>
          {matches.map((match) => (
            <CommandMenuRow
              key={`${match.entry.kind}:${match.entry.id}`}
              match={match}
              onPick={pick}
              onPointerPick={(raw) => { rawRef.current = raw }}
            />
          ))}
        </CommandGroup>
      </CommandList>
      <footer className="flex h-8 flex-none items-center border-t-hairline border-border px-4 font-mono text-2xs text-muted-foreground" data-testid="command-menu-footer">
        {FOOTER}
      </footer>
    </>
  )
}

/**
 * The Command Menu and Quick Open: one palette, two modes, over the whole
 * window. The dialog gives it the backdrop, the focus trap, esc and its place
 * a quarter of the way down; the rows and the matcher are Plumo's own.
 */
export function CommandMenu({ open, mode, entries, onClose, onRunCommand, onOpenFile }: CommandMenuProps) {
  // Esc, a click outside and a row that ran something which takes no focus
  // hand focus back to where it was; a row that ran a find bar, a rename or
  // opened a Document leaves the focus that took (AIM-457).
  const returnFocus = useDialogReturnFocus()
  return (
    <CommandDialog
      open={open}
      onOpenChange={(next, details) => {
        // Esc cancelling a candidate does not close the palette.
        if (!next && details.reason === 'escape-key' && isImeKeyEvent(details.event)) {
          details.cancel()
          return
        }
        if (!next) onClose()
      }}
      title={TITLES[mode]}
      description={DESCRIPTIONS[mode]}
      contentProps={{
        'data-testid': 'command-menu',
        'data-mode': mode,
        'data-command-palette': 'true',
        ...returnFocus,
      }}
      commandProps={{
        label: TITLES[mode],
        shouldFilter: false,
        loop: true,
        // ⌃N, ⌃P, ⌃J and ⌃K stay the text field's, as in every other macOS field.
        vimBindings: false,
      }}
    >
      <CommandMenuPanel mode={mode} entries={entries} onRunCommand={onRunCommand} onOpenFile={onOpenFile} />
    </CommandDialog>
  )
}

import { useSidebarInlineRenameInput } from '@/shell/sidebar-hooks'
import { stripBlockedNameCharacters, type ExplorerRowKind } from '@/folder/explorer-names'
import { EXPLORER_ROW_ICONS, explorerNameIndent, explorerRowIndent } from './explorer-row'
import { ExplorerDisclosureSlot } from './explorer-disclosure'
import { SidebarRow, SidebarRowIcon } from '@/shell/sidebar-row'

/**
 * The in-row inline input behind creation and Rename…; it edits the stem
 * only: the extension beside it is dim static text and is never editable, so
 * a Document cannot be renamed out of the tree. `/` never makes it in;
 * everything else the filesystem refuses is reported on commit, as a red
 * hairline ring and one muted line under the row.
 *
 * Enter commits, Escape cancels, and blur commits a changed name — the carried
 * inline-rename hook holds the Enter/blur double-fire guard.
 */

interface ExplorerNameInputProps {
  stem: string
  extension: string
  kind: ExplorerRowKind
  depth: number
  /** The inline message under the row, or null while the name is fine. */
  error: string | null
  onSubmit: (stem: string) => Promise<boolean>
  onCancel: () => void
  /** Enter or Escape ended the rename: the row, or the editor, is to take focus. */
  onKeyboardEnd?: () => void
}

export function ExplorerNameInput(props: ExplorerNameInputProps) {
  const { stem, extension, kind, depth, error, onSubmit, onCancel, onKeyboardEnd } = props
  const Icon = EXPLORER_ROW_ICONS[kind]
  const { handleKeyDown, inputRef, setValue, submitValue, value } = useSidebarInlineRenameInput({
    initialValue: stem,
    onCancel,
    onSubmit,
    onKeyboardEnd,
  })

  // The row's indent and the message's are runtime numbers, so they stay inline.
  return (
    <div>
      <SidebarRow className="mb-0.5" style={{ paddingLeft: explorerRowIndent(depth) }}>
        <ExplorerDisclosureSlot />
        <SidebarRowIcon icon={Icon} />
        <input
          ref={inputRef}
          className="h-5 min-w-0 flex-1 rounded-sm border-hairline border-border-default bg-surface-card px-1 text-text-primary outline-none focus:border-state-focus-ring aria-invalid:border-chroma-red"
          data-testid="explorer-rename-input"
          aria-label="Name"
          aria-invalid={error ? true : undefined}
          value={value}
          onChange={(event) => setValue(stripBlockedNameCharacters(event.target.value))}
          onBlur={() => { void submitValue() }}
          onKeyDown={handleKeyDown}
        />
        {extension && <span className="flex-none text-text-muted">{extension}</span>}
      </SidebarRow>
      {error && (
        <div
          className="pr-2 pb-0.5 text-2xs text-text-muted wrap-anywhere"
          role="alert"
          data-testid="explorer-rename-error"
          style={{ paddingLeft: explorerNameIndent(depth) }}
        >
          {error}
        </div>
      )}
    </div>
  )
}

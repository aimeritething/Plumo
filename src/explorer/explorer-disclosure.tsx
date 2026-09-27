import { CaretDown, CaretRight } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { SIDEBAR_ROW_ICON_COLORS } from '@/shell/sidebar-row'

/** The 12px column before an Explorer row's icon: a folder's caret, a file's empty slot. */

const DISCLOSURE = 'flex h-5 w-3 flex-none items-center justify-center'

/** A file row's empty disclosure column, so its icon lines up with a folder's. */
export function ExplorerDisclosureSlot() {
  return <span className={DISCLOSURE} />
}

interface ExplorerDisclosureProps {
  name: string
  expanded: boolean
  onToggle: () => void
}

/** A folder row's caret: expands or collapses the folder without selecting it (a click on the rest of the row does both). */
export function ExplorerDisclosure({ name, expanded, onToggle }: ExplorerDisclosureProps) {
  return (
    <button
      type="button"
      className={cn(DISCLOSURE, SIDEBAR_ROW_ICON_COLORS)}
      tabIndex={-1}
      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${name}`}
      onClick={(event) => { event.stopPropagation(); onToggle() }}
    >
      {expanded ? <CaretDown size={12} /> : <CaretRight size={12} />}
    </button>
  )
}

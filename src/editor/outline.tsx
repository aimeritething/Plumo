import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { cn } from '@/lib/cn'
import { translate, type AppLocale } from '@/lib/i18n'
import type { RichEditor } from '@/kernel/blocknote/block-note-dom'
import { railLayout, type OutlineEntry } from './outline-entries'
import { useOutline, type Outline as OutlineState } from './use-outline'

/** A pointer passing over the rail on its way to the sidebar does not open the card. */
const OPEN_DELAY_MS = 100
/** Long enough to cross from the rail onto the card without it closing. */
const CLOSE_DELAY_MS = 150
/** Dash length by depth: the deeper the heading, the shorter. */
const DASH_WIDTHS = [10, 7, 5, 4] as const
/** How far the rail fades at an end where it leaves entries out. */
const RAIL_FADE = '16px'

function dashWidth(depth: number): number {
  return DASH_WIDTHS[Math.min(depth, DASH_WIDTHS.length - 1)]
}

function useHoverIntent() {
  const [open, setOpen] = useState(false)
  const timer = useRef<number | undefined>(undefined)
  const settle = useCallback((next: boolean, delay: number) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setOpen(next), delay)
  }, [])
  const close = useCallback(() => {
    window.clearTimeout(timer.current)
    setOpen(false)
  }, [])
  useEffect(() => () => window.clearTimeout(timer.current), [])
  return {
    open,
    close,
    hover: {
      onPointerEnter: () => settle(true, open ? 0 : OPEN_DELAY_MS),
      onPointerLeave: () => settle(false, CLOSE_DELAY_MS),
    },
  }
}

function railMask(clippedTop: boolean, clippedBottom: boolean): string | undefined {
  if (!clippedTop && !clippedBottom) return undefined
  const top = clippedTop ? `transparent, black ${RAIL_FADE}` : 'black'
  const bottom = clippedBottom ? `black calc(100% - ${RAIL_FADE}), transparent` : 'black'
  return `linear-gradient(to bottom, ${top}, ${bottom})`
}

function OutlineRail({ outline }: { outline: OutlineState }) {
  const { entries, activeId, hiddenIds, maxHeight } = outline
  const activeIndex = entries.findIndex((entry) => entry.id === activeId)
  const { pitch, start, end } = railLayout(entries.length, activeIndex, maxHeight)
  const mask = railMask(start > 0, end < entries.length)

  return (
    <div className="flex flex-col" style={{ maskImage: mask, WebkitMaskImage: mask }}>
      {entries.slice(start, end).map((entry) => (
        <div key={entry.id} className="flex items-center" style={{ height: pitch }}>
          <span
            className={cn(
              'h-0.5 rounded-full',
              entry.id === activeId ? 'bg-text-secondary' : 'bg-border-strong',
              hiddenIds.has(entry.id) && 'opacity-40',
            )}
            style={{ width: dashWidth(entry.depth) }}
          />
        </div>
      ))}
    </div>
  )
}

function OutlineRow({ entry, active, hidden, onPick }: {
  entry: OutlineEntry
  active: boolean
  hidden: boolean
  onPick: (id: string) => void
}) {
  return (
    <button
      type="button"
      data-outline-entry={entry.id}
      aria-current={active ? 'location' : undefined}
      // The editor keeps its focus until the jump moves the caret.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onPick(entry.id)}
      className={cn(
        'flex h-7 shrink-0 cursor-default items-center rounded-md pr-2 text-left text-[13px] outline-none',
        'hover:bg-menu-item-hover hover:text-text-heading focus-visible:bg-menu-item-hover',
        active ? 'font-medium text-text-heading' : hidden ? 'text-text-muted' : 'text-text-tertiary',
      )}
      style={{ paddingLeft: 8 + entry.depth * 12 }}
    >
      <span className="min-w-0 truncate">{entry.text}</span>
    </button>
  )
}

/**
 * The Outline: a rail of dashes at the left of the Rich surface, one per
 * heading, that opens into a card of the headings on hover. Picking one
 * jumps there with the caret. It sits beside the scroll area, not in it, so
 * it stays put while the Document scrolls, and above the side menu, which
 * the pointer over it leaves where it was.
 */
export function Outline({ editor, scrollAreaRef, locale = 'en' }: {
  editor: RichEditor
  scrollAreaRef: RefObject<HTMLElement | null>
  locale?: AppLocale
}) {
  const outline = useOutline(editor, scrollAreaRef)
  const { open, close, hover } = useHoverIntent()
  const listRef = useRef<HTMLDivElement>(null)
  const { activeId, jumpTo } = outline

  // Opening shows the current Section's row, however long the list.
  useLayoutEffect(() => {
    const list = listRef.current
    if (!open || !list || !activeId) return
    const row = list.querySelector<HTMLElement>(`[data-outline-entry="${activeId}"]`)
    if (row) list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2
  }, [activeId, open])

  const pick = useCallback((id: string) => {
    close()
    jumpTo(id)
  }, [close, jumpTo])

  if (!outline.shown) return null

  return (
    // `data-side-menu-inert`: the Kernel's side menu stays where it is while the pointer is over the Outline.
    <div className="pointer-events-none absolute inset-y-0 left-0 z-overlay" data-side-menu-inert="">
      <div {...hover} className="pointer-events-auto absolute top-1/2 left-0 -translate-y-1/2 py-3 pr-4 pl-4" aria-hidden="true">
        <OutlineRail outline={outline} />
      </div>
      <nav
        {...hover}
        ref={listRef}
        aria-label={translate(locale, 'editor.outline.label')}
        data-open={open || undefined}
        inert={!open}
        className={cn(
          // As wide as its longest heading, within bounds, so short headings leave the text beside it uncovered.
          'absolute top-1/2 left-2 flex w-max max-w-64 min-w-40 origin-left -translate-y-1/2 flex-col gap-px overflow-y-auto',
          'rounded-xl border-hairline border-border-popover bg-surface-popover p-1.5 shadow-menu',
          'pointer-events-none scale-95 opacity-0 transition-[opacity,scale] duration-150 ease-out motion-reduce:scale-100',
          'data-open:pointer-events-auto data-open:scale-100 data-open:opacity-100',
        )}
        style={{ maxHeight: outline.maxHeight }}
      >
        {outline.entries.map((entry) => (
          <OutlineRow
            key={entry.id}
            entry={entry}
            active={entry.id === activeId}
            hidden={outline.hiddenIds.has(entry.id)}
            onPick={pick}
          />
        ))}
      </nav>
    </div>
  )
}

import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { cn } from '@/lib/cn'
import { translate, type AppLocale } from '@/lib/i18n'
import type { RichEditor } from '@/kernel/blocknote/block-note-dom'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/ui/hover-card'
import { ScrollArea } from '@/ui/scroll-area'
import { railLayout, type OutlineEntry } from './outline-entries'
import { useOutline, type Outline as OutlineState } from './use-outline'

/** A pointer passing over the rail on its way to the sidebar does not open the card. */
const OPEN_DELAY_MS = 100
/** Long enough to cross from the rail onto the card without it closing. */
const CLOSE_DELAY_MS = 150
/** Dash length by depth: the deeper the heading, the shorter. */
const DASH_WIDTHS = [10, 7, 5, 4] as const
/** The rail's inset around its dashes: room for the pointer to land on it. */
const RAIL_INSET = 16
/**
 * The card opens over the rail, 8px in from the editor area's left edge, so
 * it sits back from the rail's right edge (the rail is as wide as its longest
 * dash and its inset on both sides).
 */
const CARD_OFFSET = 8 - (RAIL_INSET * 2 + DASH_WIDTHS[0])
/** How far the rail fades at an end where it leaves entries out. */
const RAIL_FADE = '16px'

function dashWidth(depth: number): number {
  return DASH_WIDTHS[Math.min(depth, DASH_WIDTHS.length - 1)]
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
    // As wide as the longest dash, whatever the Document's top depth, so the card always lands at the same place over it.
    <div className="flex flex-col" style={{ width: DASH_WIDTHS[0], maskImage: mask, WebkitMaskImage: mask }}>
      {entries.slice(start, end).map((entry) => (
        <div key={entry.id} className="flex items-center" style={{ height: pitch }}>
          <span
            className={cn(
              'h-0.5 rounded-full',
              entry.id === activeId ? 'bg-muted-foreground' : 'bg-input',
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
        'hover:bg-accent hover:text-foreground focus-visible:bg-accent',
        active ? 'font-medium text-foreground' : hidden ? 'text-subtle-foreground' : 'text-muted-foreground',
      )}
      style={{ paddingLeft: 8 + entry.depth * 12 }}
    >
      <span className="min-w-0 truncate">{entry.text}</span>
    </button>
  )
}

/** The card's headings: mounted as the card opens, which shows the current Section's row, however long the list. */
function OutlineList({ outline, onPick }: { outline: OutlineState, onPick: (id: string) => void }) {
  const listRef = useRef<HTMLDivElement>(null)
  const { activeId } = outline

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list || !activeId) return
    const row = list.querySelector<HTMLElement>(`[data-outline-entry="${activeId}"]`)
    if (row) list.scrollTop = row.offsetTop - (list.clientHeight - row.offsetHeight) / 2
  }, [activeId])

  return (
    <ScrollArea className="min-h-0" viewportRef={listRef} viewportClassName="p-1.5 [&>div]:flex! [&>div]:flex-col [&>div]:gap-px">
      {outline.entries.map((entry) => (
        <OutlineRow
          key={entry.id}
          entry={entry}
          active={entry.id === activeId}
          hidden={outline.hiddenIds.has(entry.id)}
          onPick={onPick}
        />
      ))}
    </ScrollArea>
  )
}

/**
 * The Outline: a rail of dashes at the left of the Rich surface, one per
 * heading, that opens into a card of the headings on hover. Picking one
 * jumps there with the caret. It sits beside the scroll area, not in it, so
 * it stays put while the Document scrolls, and above the side menu, which
 * the pointer over it leaves where it was. The card is not portaled, so it
 * stays in that place too.
 */
export function Outline({ editor, scrollAreaRef, locale = 'en' }: {
  editor: RichEditor
  scrollAreaRef: RefObject<HTMLElement | null>
  locale?: AppLocale
}) {
  const outline = useOutline(editor, scrollAreaRef)
  const [open, setOpen] = useState(false)
  const { jumpTo } = outline

  const pick = useCallback((id: string) => {
    setOpen(false)
    jumpTo(id)
  }, [jumpTo])

  if (!outline.shown) return null

  return (
    // `data-side-menu-inert`: the Kernel's side menu stays where it is while the pointer is over the Outline.
    <div className="pointer-events-none absolute inset-y-0 left-0 z-overlay" data-side-menu-inert="">
      <HoverCard open={open} onOpenChange={setOpen} openDelay={OPEN_DELAY_MS} closeDelay={CLOSE_DELAY_MS}>
        <HoverCardTrigger
          className="pointer-events-auto absolute top-1/2 left-0 -translate-y-1/2 py-3"
          style={{ paddingInline: RAIL_INSET }}
          aria-hidden="true"
        >
          <OutlineRail outline={outline} />
        </HoverCardTrigger>
        <HoverCardContent
          portal={false}
          side="right"
          sideOffset={CARD_OFFSET}
          // As wide as its longest heading, within bounds, so short headings leave the text beside it uncovered.
          className="pointer-events-auto flex w-max max-w-64 min-w-40 flex-col overflow-hidden p-0"
          style={{ maxHeight: outline.maxHeight }}
        >
          <nav aria-label={translate(locale, 'editor.outline.label')} className="flex min-h-0 flex-col">
            <OutlineList outline={outline} onPick={pick} />
          </nav>
        </HoverCardContent>
      </HoverCard>
    </div>
  )
}

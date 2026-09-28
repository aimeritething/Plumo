import { memo, useEffect, useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { Image, Plus } from '@phosphor-icons/react'
import type { Tab } from '@/types'
import { isImageFilePath } from './image-file'
import { tabParentHints } from './tab-labels'
import { CloseAffordance } from './close-affordance'
import { APP_COMMAND_DEFINITIONS, APP_COMMAND_IDS } from '@/shell/app-command-catalog'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

const MIDDLE_BUTTON = 1
const NEW_DOCUMENT_SHORTCUT = APP_COMMAND_DEFINITIONS[APP_COMMAND_IDS.fileNewNote].shortcut?.display

export interface TabBarProps {
  tabs: Tab[]
  activeTabPath: string | null
  onActivate: (path: string) => void
  onClose: (path: string) => void
  /** The "+" after the last Tab: New Document, the same as ⌘N. Without it (no Folder open) there is no "+". */
  onNewDocument?: () => void
  /** The active Tab's own controls, at the row's right end. */
  actions?: ReactNode
  /** Collapsed, the row leaves the traffic lights and the sidebar icon their room before the first tab. */
  sidebarCollapsed?: boolean
}

/**
 * The tab bar: the editor's 52px top row, level with the sidebar's top row.
 * One Tab per open Document or Image file, then the "+", then, at the right
 * end, the active Tab's controls. Hidden with no Tab open. The row itself is
 * the window drag region; the tabs and buttons are not, so a click on one
 * lands on it. An Image file's Tab carries the image icon before its name, a
 * Document's nothing; two Tabs with the same name each add their parent
 * folder's name, dimmed. With the sidebar collapsed the editor reaches the
 * window's left edge, so this row starts 120px in: the traffic lights and the
 * sidebar icon sit over that room, and the first Tab follows. The inset slides
 * with the sidebar, so the first Tab rides the sidebar's edge. Too many Tabs
 * to fit shrink to 96px each, then the Tabs alone scroll sideways, with no
 * scrollbar drawn; the "+" and the controls stay put, and whichever Tab
 * becomes active is scrolled into view.
 */
export const TabBar = memo(function TabBar({ tabs, activeTabPath, onActivate, onClose, onNewDocument, actions, sidebarCollapsed = false }: TabBarProps) {
  const hints = useMemo(() => tabParentHints(tabs.map((tab) => tab.entry.path)), [tabs])
  const stripRef = useRef<HTMLDivElement>(null)
  useActiveTabInView(stripRef, activeTabPath)
  useWheelScrollsSideways(stripRef, tabs.length > 0)
  if (tabs.length === 0) return null

  return (
    <div
      className="sidebar-slide flex h-13 flex-none items-center gap-1 overflow-hidden pr-4 pl-3 select-none data-collapsed:pl-30"
      data-testid="tab-bar"
      data-collapsed={sidebarCollapsed || undefined}
      data-tauri-drag-region
    >
      <div
        ref={stripRef}
        className="flex min-w-0 flex-initial items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Tabs"
      >
        {tabs.map(({ entry }) => (
          <TabPill
            key={entry.path}
            path={entry.path}
            filename={entry.filename}
            parentHint={hints.get(entry.path)}
            active={entry.path === activeTabPath}
            onActivate={onActivate}
            onClose={onClose}
          />
        ))}
      </div>
      {onNewDocument && <NewDocumentButton onNewDocument={onNewDocument} />}
      {actions && <div className="ml-auto flex flex-none items-center pl-3" data-testid="tab-bar-actions">{actions}</div>}
    </div>
  )
})

/**
 * Whenever another Tab becomes active (a click, an open, a shortcut, the
 * active one closing), bring it into view in the strip, at once: the nearest
 * edge, so a Tab already showing does not move.
 */
function useActiveTabInView(stripRef: RefObject<HTMLDivElement | null>, activeTabPath: string | null) {
  useEffect(() => {
    stripRef.current?.querySelector('[role="tab"][aria-selected="true"]')?.scrollIntoView({ inline: 'nearest', block: 'nearest' })
  }, [activeTabPath, stripRef])
}

/**
 * A plain mouse wheel only scrolls up and down, which the strip cannot, so
 * over overflowing Tabs its vertical turn scrolls them sideways. A trackpad's
 * sideways swipe, or Shift with the wheel, arrives sideways already and is
 * left to the browser. Not passive, so the page never also takes the turn.
 */
function useWheelScrollsSideways(stripRef: RefObject<HTMLDivElement | null>, mounted: boolean) {
  useEffect(() => {
    const strip = stripRef.current
    if (!strip) return
    const onWheel = (event: WheelEvent) => {
      if (strip.scrollWidth <= strip.clientWidth || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return
      event.preventDefault()
      strip.scrollLeft += event.deltaY
    }
    strip.addEventListener('wheel', onWheel, { passive: false })
    return () => strip.removeEventListener('wheel', onWheel)
  }, [mounted, stripRef])
}

/** "+": a 24px icon button, 2px further from the last Tab than the Tabs are from each other. */
function NewDocumentButton({ onNewDocument }: { onNewDocument: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="icon"
          size="icon-xs"
          className="ml-0.5"
          aria-label="New Document"
          data-testid="tab-bar-new-document"
          onClick={onNewDocument}
        >
          <Plus aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" shortcut={NEW_DOCUMENT_SHORTCUT}>New Document</TooltipContent>
    </Tooltip>
  )
}

interface TabPillProps {
  path: string
  filename: string
  /** The parent folder's name, when another open Tab has the same file name. */
  parentHint?: string
  active: boolean
  onActivate: (path: string) => void
  onClose: (path: string) => void
}

/**
 * One tab: 30px, 6px radius, 12px in from either side. The selected one is
 * told apart by its fill alone. Its × appears only under the pointer, after
 * the name, and the Tab grows by its width, so it never covers the name or
 * the parent folder that tells two same-name Tabs apart. However many Tabs
 * are open it keeps 96px, enough for a name to stay recognisable, cut short
 * with an ellipsis. A middle-click closes it, as the × does.
 */
function TabPill({ path, filename, parentHint, active, onActivate, onClose }: TabPillProps) {
  const isImage = isImageFilePath(path)
  return (
    <div
      className="group flex h-7.5 max-w-55 min-w-24 flex-initial cursor-default items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap text-text-secondary outline-none hover:bg-tab-hover hover:text-text-heading aria-selected:bg-tab-active aria-selected:text-text-heading focus-visible:focus-ring"
      role="tab"
      aria-selected={active}
      aria-label={parentHint ? `${filename}, ${parentHint}` : filename}
      tabIndex={active ? 0 : -1}
      title={path}
      data-testid={`tab:${path}`}
      onClick={() => onActivate(path)}
      // A middle-click closes the Tab through the same close as its ×. Both
      // halves are prevented, so the press starts no autoscroll and the click
      // pastes nothing.
      onMouseDown={(event) => {
        if (event.button === MIDDLE_BUTTON) event.preventDefault()
      }}
      onAuxClick={(event) => {
        if (event.button !== MIDDLE_BUTTON) return
        event.preventDefault()
        onClose(path)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onActivate(path)
      }}
    >
      {isImage && <Image size={13} className="flex-none text-text-secondary" aria-hidden="true" />}
      <span className="min-w-0 truncate" data-testid="tab-name">{filename}</span>
      {parentHint && <span className="min-w-0 flex-initial truncate text-text-muted" data-testid="tab-parent">{parentHint}</span>}
      <CloseAffordance name={filename} onClose={() => onClose(path)} />
    </div>
  )
}

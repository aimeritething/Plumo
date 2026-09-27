import { memo, useMemo, type ReactNode } from 'react'
import { Image, Plus } from '@phosphor-icons/react'
import type { Tab } from '@/types'
import { isImageFilePath } from './image-file'
import { tabParentHints } from './tab-labels'
import { CloseAffordance } from './close-affordance'
import { CollapsedChrome } from '@/shell/sidebar-toggle'
import { APP_COMMAND_DEFINITIONS, APP_COMMAND_IDS } from '@/shell/app-command-catalog'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

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
  /** Collapsed, the row seats the traffic lights and the sidebar icon before the first tab. */
  sidebarCollapsed?: boolean
  onShowSidebar?: () => void
}

/**
 * The tab bar: the editor's 52px top row, level with the sidebar's top row.
 * One Tab per open Document or Image file, then the "+", then, at the right
 * end, the active Tab's controls. Hidden with no Tab open. The row itself is
 * the window drag region; the tabs and buttons are not, so a click on one
 * lands on it. An Image file's Tab carries the image icon before its name, a
 * Document's nothing; two Tabs with the same name each add their parent
 * folder's name, dimmed. With the sidebar collapsed the editor reaches the
 * window's left edge, so this row is where the traffic lights land and where
 * the sidebar comes back from.
 */
export const TabBar = memo(function TabBar({ tabs, activeTabPath, onActivate, onClose, onNewDocument, actions, sidebarCollapsed = false, onShowSidebar }: TabBarProps) {
  const hints = useMemo(() => tabParentHints(tabs.map((tab) => tab.entry.path)), [tabs])
  if (tabs.length === 0) return null

  return (
    <div
      className="flex h-13 flex-none items-center gap-1 overflow-hidden pr-4 pl-3 select-none data-collapsed:pl-0"
      data-testid="tab-bar"
      data-collapsed={sidebarCollapsed || undefined}
      data-tauri-drag-region
    >
      {sidebarCollapsed && onShowSidebar && <CollapsedChrome onShowSidebar={onShowSidebar} />}
      <div className="flex min-w-0 flex-initial items-center gap-1 overflow-hidden" role="tablist" aria-label="Tabs">
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
 * the parent folder that tells two same-name Tabs apart.
 */
function TabPill({ path, filename, parentHint, active, onActivate, onClose }: TabPillProps) {
  const isImage = isImageFilePath(path)
  return (
    <div
      className="group flex h-7.5 max-w-55 min-w-0 flex-initial cursor-default items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap text-text-secondary outline-none hover:bg-tab-hover hover:text-text-heading aria-selected:bg-tab-active aria-selected:text-text-heading focus-visible:focus-ring"
      role="tab"
      aria-selected={active}
      aria-label={parentHint ? `${filename}, ${parentHint}` : filename}
      tabIndex={active ? 0 : -1}
      title={path}
      data-testid={`tab:${path}`}
      onClick={() => onActivate(path)}
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

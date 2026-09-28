import { useCallback } from 'react'
import { CaretDown, CaretRight } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { SidebarLabel } from '@/shell/sidebar-row'
import { ContextMenu, ContextMenuTrigger } from '@/ui/context-menu'
import type { ExplorerActions } from './use-explorer-actions'
import { ExplorerContextMenu } from './explorer-context-menu'
import { ExplorerHeaderActions } from './explorer-header-actions'
import type { ExplorerMenuAction } from './explorer-menu-items'
import type { FolderDropTarget } from './use-folder-drop-target'

interface ExplorerHeaderProps {
  folder: string
  /** The Folder's name, the Explorer's only title (CONTEXT.md, Explorer). */
  name: string
  collapsed: boolean
  onToggleCollapsed: () => void
  /** The id of the tree the name folds away, for `aria-controls`. */
  treeId: string
  actions: ExplorerActions
  onCollapseAll: () => void
  onCloseFolder: () => void
  /** The Folder's top level as a drop target, shared with the empty area below the tree. */
  drop: FolderDropTarget
}

/**
 * The Explorer's header: the Folder's name, which folds the whole tree away
 * and opens it again (the fold is the Session's `sidebar.collapsedSections`),
 * and the hover-only "+" and "…" on the right. Its caret shows while the
 * pointer is over the Explorer or the name has focus, as Pinned's does. The
 * Folder itself is not a row in the tree, so the header stands in for it:
 * a file dropped here moves to the Folder's top level (and a drop on a
 * top-level file row marks it too), and its right-click
 * menu is the Folder's (New Document, New Folder, Reveal in Finder, Copy Path).
 */
export function ExplorerHeader(props: ExplorerHeaderProps) {
  const { folder, name, collapsed, onToggleCollapsed, treeId, actions, onCollapseAll, onCloseFolder, drop } = props
  const Caret = collapsed ? CaretRight : CaretDown

  const onMenuAction = useCallback((action: ExplorerMenuAction) => {
    switch (action) {
      case 'newDocument': return actions.createDocumentIn(folder)
      case 'newFolder': return actions.createFolderIn(folder)
      case 'reveal': return actions.reveal(folder)
      case 'copyPath': return actions.copyPath(folder)
    }
  }, [actions, folder])

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <SidebarLabel
          className={cn(
            'justify-between gap-2 rounded-lg',
            'data-drop-target:bg-sidebar-row-active data-drop-target:text-text-heading data-drop-target:ring-1 data-drop-target:ring-accent-base data-drop-target:ring-inset',
          )}
          data-testid="explorer-header"
          data-drop-target={drop.target === folder || undefined}
          {...drop.dropProps(folder)}
        >
          <button
            type="button"
            className="flex min-w-0 cursor-default items-center gap-1 rounded-sm outline-none focus-visible:focus-ring"
            aria-expanded={!collapsed}
            aria-controls={collapsed ? undefined : treeId}
            title={folder}
            data-testid="explorer-toggle"
            onClick={onToggleCollapsed}
          >
            <span className="truncate">{name}</span>
            <Caret
              size={10}
              aria-hidden="true"
              className="flex-none text-text-muted opacity-0 transition-opacity duration-150 ease-out group-hover/explorer:opacity-100 group-focus-within/explorer:opacity-100"
              data-testid="explorer-caret"
            />
          </button>
          <ExplorerHeaderActions
            onNewDocument={actions.createDocument}
            onNewFolder={actions.createFolder}
            onCollapseAll={onCollapseAll}
            onReveal={() => actions.reveal(folder)}
            onCloseFolder={onCloseFolder}
          />
        </SidebarLabel>
      </ContextMenuTrigger>
      <ExplorerContextMenu target="root" onAction={onMenuAction} />
    </ContextMenu>
  )
}

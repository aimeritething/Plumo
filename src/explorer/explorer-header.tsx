import { useCallback } from 'react'
import { CaretDown, CaretRight } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { CollapsibleTrigger } from '@/ui/collapsible'
import { ContextMenu, ContextMenuTrigger } from '@/ui/context-menu'
import { SidebarGroupLabel, sidebarDropTargetClassName } from '@/ui/sidebar'
import type { ExplorerActions } from './use-explorer-actions'
import { ExplorerContextMenu } from './explorer-context-menu'
import { ExplorerHeaderActions } from './explorer-header-actions'
import type { ExplorerMenuAction } from './explorer-menu-items'
import type { FolderDropTarget } from './use-folder-drop-target'

interface ExplorerHeaderProps {
  folder: string
  /** The Folder's name, the Explorer's only title (CONTEXT.md, Explorer). */
  name: string
  /** The tree folded away under the name: which way the caret points. */
  collapsed: boolean
  actions: ExplorerActions
  onCollapseAll: () => void
  onCloseFolder: () => void
  /** The Folder's top level as a drop target, shared with the empty area below the tree. */
  drop: FolderDropTarget
}

/**
 * The Explorer's header: the Folder's name, the group's label and the
 * trigger of the Explorer's `Collapsible`, which folds the whole tree away and
 * opens it again (the fold is the Session's `sidebar.collapsedSections`), and
 * the hover-only "+" and "…" on the right. Its caret shows while the pointer
 * is over the Explorer or focus is in it, as Pinned's does. The
 * Folder itself is not a row in the tree, so the header stands in for it:
 * a file dropped here moves to the Folder's top level (and a drop on a
 * top-level file row marks it too), and its right-click
 * menu is the Folder's (New Document, New Folder, Reveal in Finder, Copy Path).
 */
export function ExplorerHeader(props: ExplorerHeaderProps) {
  const { folder, name, collapsed, actions, onCollapseAll, onCloseFolder, drop } = props
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
      <ContextMenuTrigger
        render={(
          <div
            className={cn('flex items-center pr-2', sidebarDropTargetClassName)}
            data-testid="explorer-header"
            data-drop-target={drop.target === folder || undefined}
            {...drop.dropProps(folder)}
          />
        )}
      >
        <SidebarGroupLabel className="min-w-0 flex-1" render={<CollapsibleTrigger data-testid="explorer-toggle" />}>
          <span>{name}</span>
          <Caret aria-hidden="true" data-testid="explorer-caret" />
        </SidebarGroupLabel>
        <ExplorerHeaderActions
          onNewDocument={actions.createDocument}
          onNewFolder={actions.createFolder}
          onCollapseAll={onCollapseAll}
          onReveal={() => actions.reveal(folder)}
          onCloseFolder={onCloseFolder}
        />
      </ContextMenuTrigger>
      <ExplorerContextMenu target="root" onAction={onMenuAction} />
    </ContextMenu>
  )
}

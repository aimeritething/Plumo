import { ContextMenuContent, ContextMenuItem, ContextMenuSeparator } from '@/ui/context-menu'
import {
  EXPLORER_MENU_LABELS,
  EXPLORER_UNPIN_LABEL,
  explorerMenuEntries,
  isDestructiveExplorerMenuAction,
  type ExplorerMenuAction,
  type ExplorerMenuTargetKind,
} from './explorer-menu-items'

/**
 * The Explorer's right-click menu: Linear-styled on Radix `ContextMenu`, never
 * the native macOS menu. It acts on the row under the cursor
 * and changes neither the selection nor the active Tab.
 */

interface ExplorerContextMenuProps {
  target: ExplorerMenuTargetKind
  /** Whether the row is pinned, which names its Pin item Unpin. */
  pinned?: boolean
  onAction: (action: ExplorerMenuAction) => void
}

export function ExplorerContextMenu({ target, pinned = false, onAction }: ExplorerContextMenuProps) {
  return (
    <ContextMenuContent data-testid={`explorer-menu:${target}`}>
      {explorerMenuEntries(target).map((entry, index) => (
        entry.kind === 'separator'
          ? <ContextMenuSeparator key={`separator-${index}`} />
          : (
            <ContextMenuItem
              key={entry.action}
              variant={isDestructiveExplorerMenuAction(entry.action) ? 'destructive' : 'default'}
              onSelect={() => onAction(entry.action)}
            >
              {entry.action === 'pin' && pinned ? EXPLORER_UNPIN_LABEL : EXPLORER_MENU_LABELS[entry.action]}
            </ContextMenuItem>
          )
      ))}
    </ContextMenuContent>
  )
}

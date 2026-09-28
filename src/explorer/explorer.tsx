import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, type DragEvent, type RefObject } from 'react'
import { ContextMenu, ContextMenuTrigger } from '@/ui/context-menu'
import type { SidebarSelection } from '@/types'
import { holdsDocument, type ExplorerNode } from '@/folder/explorer'
import { noteRootForPath } from '@/folder/note-entry'
import type { ExplorerActions } from './use-explorer-actions'
import { isPathInsideVaultRoot } from '@/lib/vault-path-containment'
import { cn } from '@/lib/cn'
import { clearDraggedNotePath, writeNoteDragData } from './note-drag-drop'
import { ancestorTreePaths } from './folder-tree-utils'
import { useFolderTreeDisclosure } from './use-folder-tree-disclosure'
import type { ExplorerMemory } from './use-explorer-memory'
import { ExplorerContextMenu } from './explorer-context-menu'
import { ExplorerHeader } from './explorer-header'
import { useFolderDropTarget, type FolderDropProps, type FolderDropTarget } from './use-folder-drop-target'
import { ExplorerNameInput } from './explorer-name-input'
import { EXPLORER_ROW_ICONS, explorerRowIndent } from './explorer-row'
import { ExplorerDisclosure, ExplorerDisclosureSlot } from './explorer-disclosure'
import type { ExplorerMenuAction, ExplorerMenuTargetKind } from './explorer-menu-items'
import { Button } from '@/ui/button'
import { Kbd } from '@/ui/kbd'
import { ScrollArea } from '@/ui/scroll-area'
import { ONE_OPEN_PER_DOUBLE_CLICK_PROPS, SidebarRow, SidebarRowIcon, SidebarRowName } from '@/shell/sidebar-row'

const NO_FOLDER_SELECTION: SidebarSelection = { kind: 'filter', filter: 'all' }

interface ExplorerProps {
  folder: string | null
  /** The tree App builds from the Folder listing; null with no Folder open. */
  tree: ExplorerNode | null
  activeTabPath: string | null
  /** A Document or an Image file row was activated; both open a real Tab. */
  onOpenFile: (path: string) => void
  actions: ExplorerActions
  /** What outlives the Explorer while the sidebar is collapsed: the folders opened by hand, the scroll position. */
  memory: ExplorerMemory
  onCloseFolder: () => void
  /** The Open Folder button's click, the same as ⌘O. */
  onOpenFolder: () => void
  /** "Folder not found: <path>", from a restore that lost its Folder or an Open Folder that would not list. */
  error?: string | null
  /** Pin/Unpin from a Document's or an Image file's context menu. */
  pins?: ExplorerPins
  /** The whole tree folded away under the header (the Session's `sidebar.collapsedSections`). */
  collapsed?: boolean
  /** The header's name: folds the tree away, or opens it again. */
  onToggleCollapsed?: () => void
  /** A row entering rename opens a folded tree, so the name being typed is seen. */
  onExpand?: () => void
  /** A Document just created was named from the keyboard: the editor takes focus, as ⌘N promised (AIM-457). */
  onFocusEditor?: () => void
}

/** What the Explorer's context menu needs of the Pinned list. */
export interface ExplorerPins {
  isPinned: (path: string) => boolean
  toggle: (path: string) => void
}

type LoadedProps = ExplorerProps & { folder: string; tree: ExplorerNode }

/**
 * The Explorer: the Folder as a tree of Documents, sub-folders and Image
 * files, with the write operations over it — creation, inline rename, Move to
 * Trash and the drag-and-drop move, all reached from the Linear-styled context
 * menu or the row itself. It is headed by the Folder's name; the Folder itself
 * is not a row (CONTEXT.md, Explorer), so the tree starts at the Folder's top
 * level. The section is a named `group` so the header's hover-only actions can
 * read the pointer over any of it, and it takes the rest of the sidebar so the
 * empty area below the tree reaches the bottom.
 */
export const Explorer = memo(function Explorer(props: ExplorerProps) {
  const { folder, tree, error, onOpenFolder } = props
  if (!folder || !tree) return <NoFolder error={error} onOpenFolder={onOpenFolder} />
  return (
    <section className="group/explorer mt-3 flex min-h-0 flex-1 flex-col" data-testid="explorer">
      <ExplorerBody key={folder} {...props} folder={folder} tree={tree} />
    </section>
  )
})

/**
 * The No-Folder state, identical on first launch: what to do
 * next, as a button and the drop hint, straight under the sidebar's top row.
 * A restore that lost its Folder names it above the button until any Folder
 * is opened.
 */
function NoFolder({ error, onOpenFolder }: { error?: string | null; onOpenFolder: () => void }) {
  return (
    <section className="flex min-h-0 flex-col pt-1" data-testid="explorer">
      <div className="flex cursor-default flex-col items-start px-2 pt-1" data-testid="explorer-no-folder">
        <h4 className="text-sm leading-5 font-medium text-text-heading">No folder open</h4>
        <p className="pt-1 text-sm leading-5 font-normal text-text-tertiary">Plumo reads Markdown from one folder at a time. Open one to browse it here.</p>
        {error && (
          <p className="pt-2 font-mono text-2xs leading-normal font-normal text-chroma-red-text wrap-anywhere" role="status" data-testid="explorer-folder-missing">
            {error}
          </p>
        )}
        <Button type="button" className="mt-3.5 h-7.5 rounded-lg pr-2 pl-3" aria-label="Open Folder ⌘O" onClick={onOpenFolder} data-testid="explorer-open-folder">
          Open Folder<Kbd className="bg-text-inverse/12 px-1.25 font-normal text-text-inverse/80">⌘O</Kbd>
        </Button>
        <p className="flex items-center gap-1 pt-3 text-xs leading-4 font-normal text-text-muted">
          or drop a <code className="font-mono text-2xs">.md</code> file onto the window
        </p>
      </div>
    </section>
  )
}

/** Every sub-folder's tree key, so Collapse All shuts the ones never touched too. */
function folderKeys(node: ExplorerNode, folder: string, keys: string[] = []): string[] {
  if (node.kind !== 'folder') return keys
  if (node.path !== folder) keys.push(node.path.slice(folder.length + 1))
  for (const child of node.children) folderKeys(child, folder, keys)
  return keys
}

const SCROLL_VIEWPORT_SELECTOR = '[data-slot="scroll-area-viewport"]'

/** The tree's scroll position, put back when the sidebar, or the folded tree, is shown again. */
function useRememberedScroll(treeRef: RefObject<HTMLDivElement | null>, view: ExplorerMemory['view'], shown: boolean) {
  useLayoutEffect(() => {
    const viewport = treeRef.current?.querySelector<HTMLElement>(SCROLL_VIEWPORT_SELECTOR)
    if (!viewport) return
    viewport.scrollTop = view().scrollTop
    const remember = () => { view().scrollTop = viewport.scrollTop }
    viewport.addEventListener('scroll', remember, { passive: true })
    return () => {
      // Once more on the way out, while the viewport is still in the document.
      if (viewport.isConnected) remember()
      viewport.removeEventListener('scroll', remember)
    }
  }, [shown, treeRef, view])
}

/**
 * A rename ended from the keyboard leaves its input, and focus, behind. The
 * row it leaves takes focus: the same row on Escape, or the row under the new
 * name once the listing has it, which is the selected row either way. A
 * Document just created goes to the editor instead, and a blur goes nowhere:
 * focus went where the click went.
 */
function useRowFocusAfterRename(treeRef: RefObject<HTMLDivElement | null>, actions: ExplorerActions, tree: ExplorerNode, onFocusEditor: (() => void) | undefined) {
  const pendingRef = useRef(false)
  const { selected, editing } = actions

  const onRenameKeyboardEnd = useCallback((created: boolean) => {
    if (created) onFocusEditor?.()
    else pendingRef.current = true
  }, [onFocusEditor])

  useEffect(() => {
    if (!pendingRef.current || editing) return
    const row = treeRef.current?.querySelector<HTMLElement>('[role="treeitem"][aria-selected="true"] > [tabindex]')
    if (!row) return
    pendingRef.current = false
    row.focus({ preventScroll: true })
  }, [editing, selected, tree, treeRef])

  return onRenameKeyboardEnd
}

interface RowIntoViewOptions {
  treeRef: RefObject<HTMLDivElement | null>
  folder: string
  tree: ExplorerNode
  selected: string | null
  editingPath: string | null
  expanded: Record<string, boolean>
  expandFolder: (key: string) => void
  view: ExplorerMemory['view']
  /** The tree folded away under the header: a row waits for it to open again. */
  collapsed: boolean
}

/**
 * A row that has just been selected (a click, the active Tab) or has just
 * entered rename is brought into view: the folders above it open, and the tree
 * scrolls to it once, when its row is there. That can be a render later (the
 * folders have to open first) or a refresh later (a new file is selected
 * before it is listed). Nothing else scrolls the tree: not a folder opening or
 * shutting, not a refresh from the watcher, not a rename ending, and not the
 * sidebar coming back with the same rows it left with.
 */
function useRowBroughtIntoView({ treeRef, folder, tree, selected, editingPath, expanded, expandFolder, view, collapsed }: RowIntoViewOptions) {
  const pendingRef = useRef<'selected' | 'editing' | null>(null)

  useEffect(() => {
    const seen = view()
    const pending = editingPath && editingPath !== seen.revealedEditing ? 'editing'
      : selected && selected !== seen.revealedSelected ? 'selected'
        : null
    seen.revealedEditing = editingPath
    seen.revealedSelected = selected
    if (!pending) return

    const path = pending === 'editing' ? editingPath : selected
    if (!path || !isPathInsideVaultRoot(path, folder)) return
    pendingRef.current = pending
    for (const ancestor of ancestorTreePaths(path.slice(folder.length + 1))) expandFolder(ancestor)
  }, [editingPath, expandFolder, folder, selected, view])

  useEffect(() => {
    const pending = pendingRef.current
    if (!pending) return
    const row = treeRef.current?.querySelector(pending === 'editing' ? '[data-testid="explorer-rename-input"]' : '[aria-selected="true"]')
    if (!row) return
    pendingRef.current = null
    row.scrollIntoView?.({ block: 'nearest' })
  }, [collapsed, editingPath, expanded, selected, tree, treeRef])
}

/**
 * The Folder's header and tree, remounted per Folder so the disclosure state
 * starts fresh when the Folder changes. The tree scrolls inside a
 * `ScrollArea`; the section shrinks to give it the room. The header and the
 * empty area below the tree are one drop target, the Folder's top level,
 * which the header marks while a file is over either (or over a top-level
 * file row).
 */
function ExplorerBody(props: LoadedProps) {
  const { folder, tree, actions, memory, onCloseFolder, error, collapsed = false, onToggleCollapsed, onExpand } = props
  const { collapseAll, expanded, expandFolder, toggleFolder } = useFolderTreeDisclosure({
    selection: NO_FOLDER_SELECTION,
    expandedState: [memory.manualExpanded, memory.setManualExpanded],
  })
  const treeRef = useRef<HTMLDivElement>(null)
  const keys = useMemo(() => folderKeys(tree, folder), [folder, tree])
  const handleCollapseAll = useCallback(() => collapseAll(keys), [collapseAll, keys])
  const drop = useFolderDropTarget(actions.moveInto)
  const treeId = useId()
  const editingPath = actions.editing?.path ?? null

  useEffect(() => {
    if (editingPath && collapsed) onExpand?.()
  }, [collapsed, editingPath, onExpand])

  // Folding away an open rename gives it up first, as Escape would: a rename
  // holds the tree open, so it would otherwise undo the fold at once and come
  // back with the typed name gone.
  const { editing, cancelRename } = actions
  const handleToggleCollapsed = useCallback(() => {
    if (!collapsed && editing) cancelRename()
    onToggleCollapsed?.()
  }, [cancelRename, collapsed, editing, onToggleCollapsed])

  useRememberedScroll(treeRef, memory.view, !collapsed)
  const onRenameKeyboardEnd = useRowFocusAfterRename(treeRef, actions, tree, props.onFocusEditor)
  useRowBroughtIntoView({
    treeRef, folder, tree, expanded, expandFolder, collapsed,
    selected: actions.selected,
    editingPath,
    view: memory.view,
  })

  return (
    <>
      <ExplorerHeader
        folder={folder}
        name={tree.name}
        collapsed={collapsed}
        onToggleCollapsed={handleToggleCollapsed}
        treeId={treeId}
        actions={actions}
        onCollapseAll={handleCollapseAll}
        onCloseFolder={onCloseFolder}
        drop={drop}
      />
      {!collapsed && (
        <ScrollArea ref={treeRef} id={treeId} className="min-h-0" role="tree" aria-label={tree.name}>
          {tree.children.map((child) => (
            <ExplorerRow key={child.path} {...props} node={child} depth={0} expanded={expanded} onToggle={toggleFolder} expandFolder={expandFolder}
              drop={drop} onRenameKeyboardEnd={onRenameKeyboardEnd} />
          ))}
          {/* The empty-Folder line: no `.md` anywhere in the Folder. It goes with the first ⌘N. */}
          {!holdsDocument(tree) && (
            <div className="cursor-default py-1 pr-2 pl-4 font-mono text-2xs font-normal text-text-muted" data-testid="explorer-no-documents">
              No documents yet · ⌘N
            </div>
          )}
        </ScrollArea>
      )}
      {error && <div className="p-2 text-xs leading-normal wrap-anywhere" role="status">{error}</div>}
      <EmptyArea actions={actions} folder={folder} dropProps={drop.dropProps(folder)} />
    </>
  )
}

interface EmptyAreaProps {
  actions: ExplorerActions
  folder: string
  dropProps: FolderDropProps
}

/**
 * The area below the tree, down to the bottom of the sidebar: New Document
 * and New Folder, both at the Folder's top level, and a drop there moves a
 * file to the top level too.
 */
function EmptyArea({ actions, folder, dropProps }: EmptyAreaProps) {
  const onAction = useCallback((action: ExplorerMenuAction) => {
    if (action === 'newDocument') actions.createDocumentIn(folder)
    if (action === 'newFolder') actions.createFolderIn(folder)
  }, [actions, folder])

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className="min-h-6 flex-1" data-testid="explorer-empty-area" {...dropProps} />
      </ContextMenuTrigger>
      <ExplorerContextMenu target="empty" onAction={onAction} />
    </ContextMenu>
  )
}

interface RowProps extends LoadedProps {
  node: ExplorerNode
  depth: number
  expanded: Record<string, boolean>
  onToggle: (path: string) => void
  /** Opens a folder and never shuts one: a dragged file resting on a shut folder. */
  expandFolder: (path: string) => void
  drop: FolderDropTarget
  onRenameKeyboardEnd: (created: boolean) => void
}

function useRowMenuAction(node: ExplorerNode, actions: ExplorerActions, pins: ExplorerPins | undefined) {
  return useCallback((action: ExplorerMenuAction) => {
    switch (action) {
      case 'pin': return pins?.toggle(node.path)
      case 'newDocument': return actions.createDocumentIn(node.path)
      case 'newFolder': return actions.createFolderIn(node.path)
      case 'rename': return actions.startRename(node.path, node.kind)
      case 'reveal': return actions.reveal(node.path)
      case 'copyPath': return actions.copyPath(node.path)
      case 'trash': return actions.trash(node.path, node.kind)
    }
  }, [actions, node.kind, node.path, pins])
}

/**
 * Dragging a row: a Document or an Image file is the thing dragged, and a
 * folder is never dragged itself. Every row takes a drop: a folder row into
 * that folder, and a file row into the folder it sits in, which that folder's
 * row marks (the header, at the Folder's top level). A shut folder the file
 * rests on opens. The dragged path is written to the drag and kept beside it,
 * because a browser hides the data from `dragover` and, on some platforms,
 * from the drop as well.
 */
function useRowDragAndDrop(node: ExplorerNode, isFolder: boolean, isExpanded: boolean, relative: string, drop: FolderDropTarget, expandFolder: (path: string) => void) {
  const destination = isFolder ? node.path : noteRootForPath(node.path)
  const dropProps = drop.dropProps(destination, isFolder && !isExpanded ? () => expandFolder(relative) : undefined)
  const { endDrag } = drop

  const dragProps = useMemo(() => (isFolder ? {} : {
    draggable: true,
    onDragStart: (event: DragEvent<HTMLDivElement>) => writeNoteDragData(event.dataTransfer, node.path),
    onDragEnd: () => {
      clearDraggedNotePath()
      endDrag()
    },
  }), [endDrag, isFolder, node.path])

  return { dragProps, dropProps, isDropTarget: isFolder && drop.target === node.path }
}

function ExplorerRow(props: RowProps) {
  const { node, folder, depth, expanded, onToggle, expandFolder, drop, onOpenFile, actions, pins, onRenameKeyboardEnd } = props
  const isFolder = node.kind === 'folder'
  const relative = node.path.slice(folder.length + 1)
  const isExpanded = expanded[relative] ?? false
  const selected = actions.selected === node.path
  const Icon = EXPLORER_ROW_ICONS[node.kind]
  const onMenuAction = useRowMenuAction(node, actions, pins)
  const target: ExplorerMenuTargetKind = node.kind
  const editing = actions.editing?.path === node.path ? actions.editing : null
  const { dragProps, dropProps, isDropTarget } = useRowDragAndDrop(node, isFolder, isExpanded, relative, drop, expandFolder)

  // A Document and an Image file both open a real Tab; a folder opens or
  // shuts, as its caret does. Right-click does neither.
  const select = () => {
    actions.select(node.path)
    if (isFolder) onToggle(relative)
    else onOpenFile(node.path)
  }

  const children = isFolder && isExpanded && (
    <div role="group">
      {node.children.map((child) => <ExplorerRow key={child.path} {...props} node={child} depth={depth + 1} />)}
    </div>
  )

  if (editing) {
    return (
      <div role="treeitem" aria-label={node.name} aria-level={depth + 1}>
        <ExplorerNameInput
          stem={editing.stem}
          extension={editing.extension}
          kind={editing.kind}
          depth={depth}
          error={actions.error}
          onSubmit={actions.commitRename}
          onCancel={actions.cancelRename}
          onEdit={actions.clearError}
          onKeyboardEnd={() => onRenameKeyboardEnd(editing.created)}
        />
        {children}
      </div>
    )
  }

  // The selection is the treeitem's `aria-selected`, right above the row. The
  // row reads that parent and only that parent (`in-aria-selected:` would match
  // any ancestor, and a selected folder's children sit inside its treeitem).
  // The folder row a dragged file would land in takes the selected colours and
  // an inset ring, so it is clear which folder that is.
  return (
    <div role="treeitem" aria-label={node.name} aria-selected={selected} aria-expanded={isFolder ? isExpanded : undefined}
      aria-level={depth + 1}>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <SidebarRow
            className={cn(
              'mb-0.5 [[aria-selected=true]>&]:bg-sidebar-row-active [[aria-selected=true]>&]:text-text-heading',
              'data-drop-target:bg-sidebar-row-active data-drop-target:text-text-heading data-drop-target:ring-1 data-drop-target:ring-accent-base data-drop-target:ring-inset',
              // WebKit will not start an HTML5 drag from inside `user-select: none` (the whole shell) without this.
              !isFolder && '[-webkit-user-drag:element]',
            )}
            style={{ paddingLeft: explorerRowIndent(depth) }}
            data-drop-target={isDropTarget || undefined}
            data-testid={`explorer-row:${node.path}`} tabIndex={0} title={node.path}
            {...ONE_OPEN_PER_DOUBLE_CLICK_PROPS}
            {...dragProps} {...dropProps}
            onClick={select} onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select() }
              if (isFolder && ((event.key === 'ArrowRight' && !isExpanded) || (event.key === 'ArrowLeft' && isExpanded))) {
                event.preventDefault(); onToggle(relative)
              }
            }}>
            {isFolder ? <ExplorerDisclosure name={node.name} expanded={isExpanded} onToggle={() => onToggle(relative)} /> : <ExplorerDisclosureSlot />}
            <SidebarRowIcon icon={Icon} className="[[aria-selected=true]>*>&]:text-text-primary" />
            <SidebarRowName>{node.name}</SidebarRowName>
          </SidebarRow>
        </ContextMenuTrigger>
        <ExplorerContextMenu target={target} pinned={!isFolder && (pins?.isPinned(node.path) ?? false)} onAction={onMenuAction} />
      </ContextMenu>
      {children}
    </div>
  )
}

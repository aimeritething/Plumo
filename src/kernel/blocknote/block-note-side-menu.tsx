import {
  CaretDown,
  CaretRight,
  DotsSixVertical as GripVertical,
  Plus,
} from '@phosphor-icons/react'
import { SideMenuExtension, SuggestionMenu } from '@blocknote/core/extensions'
import type {
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core'
import {
  DragHandleMenu as BlockNoteDragHandleMenu,
  SideMenu as BlockNoteSideMenu,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useExtension,
  useExtensionState,
  type SideMenuProps,
} from '@blocknote/react'
import { translate, type AppLocale } from '@/lib/i18n'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { richEditorBlockTypeName } from './rich-editor-block-types'
import {
  useCallback,
  type ComponentType,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from 'react'
import { usePointerBlockReorder } from './block-reorder'
import { useSideMenuTextAlignment } from './side-menu-alignment'
import {
  blockHeadingLevel,
  isCollapsibleSectionBlockForEditor,
  toggleCollapsedHeading,
  useCollapsedHeadingIds,
  useCollapsedHeadingRendering,
  type CollapsibleBlock,
} from './collapsed-sections'
import {
  liveSideMenuBlock,
  removeSideMenuSection,
  runSideMenuAction,
  type SideMenuBlock,
} from './side-menu-blocks'
import { turnBlockIntoType } from './rich-editor-block-type-commands'
import { getBlockTypeSelectItems } from './block-type-select'
import { createSlashMenuIcon } from './slash-menu-items'

type TableHeaderContent = Record<string, unknown> & {
  headerCols?: unknown
  headerRows?: unknown
}

type BlockNoteSideMenuProps = SideMenuProps & {
  locale?: AppLocale
}

function isInlineBlockEmpty(block: { content?: unknown }) {
  return Array.isArray(block.content) && block.content.length === 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function tableHeaderContent(block: unknown): TableHeaderContent | undefined {
  if (!isRecord(block) || block.type !== 'table' || !isRecord(block.content)) return undefined
  return block.content
}

function useSideMenuBlock() {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>()
  const block = useExtensionState(SideMenuExtension, {
    editor,
    selector: (state): SideMenuBlock | undefined => state?.block
      ? {
          children: state.block.children as CollapsibleBlock[] | undefined,
          content: state.block.content,
          id: state.block.id,
          props: state.block.props as Record<string, unknown> | undefined,
          type: state.block.type,
        }
      : undefined,
  })

  return { block, editor }
}

function stopSideMenuClick(event: ReactMouseEvent<Element>) {
  event.preventDefault()
  event.stopPropagation()
}

function editorElementFromSideMenuControl(control: Element): HTMLElement | undefined {
  const container = control.closest('.editor__blocknote-container')
  const editorElement = container?.querySelector('.bn-editor')
  if (editorElement instanceof HTMLElement) return editorElement

  const documentEditors = Array.from(control.ownerDocument.querySelectorAll('.bn-editor'))
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
  return documentEditors.find((element) => {
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }) ?? documentEditors.at(-1)
}

type EditorScrollSnapshot = {
  scrollArea: HTMLElement
  scrollLeft: number
  scrollTop: number
}

function visibleRichEditorScrollArea(ownerDocument: Document): HTMLElement | null {
  const scrollAreas = Array.from(ownerDocument.querySelectorAll('.editor-scroll-area'))
    .filter((element): element is HTMLElement => element instanceof HTMLElement)

  return scrollAreas.find((scrollArea) => {
    if (scrollArea.classList.contains('editor-scroll-area--sheet')) return false
    if (!scrollArea.querySelector('.editor__blocknote-container .bn-editor')) return false

    const rect = scrollArea.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  }) ?? null
}

function scrollAreaFromSideMenuControl(control: Element): HTMLElement | null {
  const directScrollArea = control.closest('.editor-scroll-area')
  if (directScrollArea instanceof HTMLElement) return directScrollArea

  const editorElement = editorElementFromSideMenuControl(control)
  const editorScrollArea = editorElement?.closest('.editor-scroll-area')
  return editorScrollArea instanceof HTMLElement
    ? editorScrollArea
    : visibleRichEditorScrollArea(control.ownerDocument)
}

function captureSideMenuScroll(control: Element): EditorScrollSnapshot | null {
  const scrollArea = scrollAreaFromSideMenuControl(control)
  return scrollArea
    ? {
        scrollArea,
        scrollLeft: scrollArea.scrollLeft,
        scrollTop: scrollArea.scrollTop,
      }
    : null
}

function restoreEditorScroll(snapshot: EditorScrollSnapshot | null) {
  if (!snapshot?.scrollArea.isConnected) return
  snapshot.scrollArea.scrollLeft = snapshot.scrollLeft
  snapshot.scrollArea.scrollTop = snapshot.scrollTop
}

function scheduleEditorScrollRestore(snapshot: EditorScrollSnapshot | null) {
  restoreEditorScroll(snapshot)
  queueMicrotask(() => restoreEditorScroll(snapshot))

  const ownerWindow = snapshot?.scrollArea.ownerDocument.defaultView
  if (!ownerWindow) return

  ownerWindow.setTimeout(() => restoreEditorScroll(snapshot), 0)
  ownerWindow.setTimeout(() => restoreEditorScroll(snapshot), 32)
  ownerWindow.setTimeout(() => restoreEditorScroll(snapshot), 96)
  ownerWindow.setTimeout(() => restoreEditorScroll(snapshot), 192)
  ownerWindow.requestAnimationFrame(() => {
    restoreEditorScroll(snapshot)
    ownerWindow.requestAnimationFrame(() => restoreEditorScroll(snapshot))
  })
}

function runSideMenuActionPreservingScroll(
  action: () => void,
  snapshot: EditorScrollSnapshot | null,
) {
  runSideMenuAction(() => {
    action()
    scheduleEditorScrollRestore(snapshot)
  })
}

function useRequiredComponentsContext() {
  const components = useComponentsContext()
  if (!components) throw new Error('BlockNote components context is unavailable')
  return components
}

function AddBlockButton() {
  const dict = useDictionary()
  const suggestionMenu = useExtension(SuggestionMenu)
  const { block, editor } = useSideMenuBlock()

  const addBlock = useCallback((snapshot: EditorScrollSnapshot | null) => {
    runSideMenuActionPreservingScroll(() => {
      const liveBlock = liveSideMenuBlock(editor, block)
      if (!liveBlock) return

      if (isInlineBlockEmpty(liveBlock)) {
        editor.setTextCursorPosition(liveBlock.id)
        suggestionMenu.openSuggestionMenu('/')
        return
      }

      const insertedBlock = editor.insertBlocks([{ type: 'paragraph' }], liveBlock.id, 'after')[0]
      if (!insertedBlock) return
      editor.setTextCursorPosition(insertedBlock.id)
      suggestionMenu.openSuggestionMenu('/')
    }, snapshot)
  }, [block, editor, suggestionMenu])
  const onButtonClick = useCallback((event: ReactMouseEvent<Element>) => {
    stopSideMenuClick(event)
    addBlock(captureSideMenuScroll(event.currentTarget))
  }, [addBlock])

  if (!block) return null

  return (
    <SideMenuTooltip label={dict.side_menu.add_block_label}>
      <Button
        aria-label={dict.side_menu.add_block_label}
        onClick={onButtonClick}
        size="icon-xs"
        variant="icon-quiet"
      >
        <Plus data-test="dragHandleAdd" />
      </Button>
    </SideMenuTooltip>
  )
}

/** A side menu button's tooltip, in the margin left of it, where the menu already is. */
function SideMenuTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="left">{label}</TooltipContent>
    </Tooltip>
  )
}

function headingCollapseButtonLabel(locale: AppLocale, isHeading: boolean, isCollapsed: boolean) {
  if (isHeading) return sectionCollapseButtonLabel(locale, isCollapsed)
  return itemCollapseButtonLabel(locale, isCollapsed)
}

function sectionCollapseButtonLabel(locale: AppLocale, isCollapsed: boolean) {
  return translate(locale, isCollapsed ? 'editor.sideMenu.expandSection' : 'editor.sideMenu.collapseSection')
}

function itemCollapseButtonLabel(locale: AppLocale, isCollapsed: boolean) {
  return translate(locale, isCollapsed ? 'editor.sideMenu.expandItem' : 'editor.sideMenu.collapseItem')
}

function HeadingCollapseButton({ locale }: { locale: AppLocale }) {
  const { block, editor } = useSideMenuBlock()
  const collapsedHeadingIds = useCollapsedHeadingIds(editor)
  const isCollapsed = Boolean(block?.id && collapsedHeadingIds.has(block.id))
  const isHeading = blockHeadingLevel(block) !== null
  const isCollapsible = isCollapsibleSectionBlockForEditor(editor, block)
  const Icon = isCollapsed ? CaretRight : CaretDown
  const label = headingCollapseButtonLabel(locale, isHeading, isCollapsed)

  const toggleHeading = useCallback((editorElement?: HTMLElement) => {
    runSideMenuAction(() => {
      const liveBlock = liveSideMenuBlock(editor, block)
      if (!liveBlock) return
      if (!isCollapsibleSectionBlockForEditor(editor, liveBlock as CollapsibleBlock | undefined)) return
      toggleCollapsedHeading(editor, liveBlock.id, editorElement)
    })
  }, [block, editor])
  const onButtonClick = useCallback((event: ReactMouseEvent<Element>) => {
    stopSideMenuClick(event)
    toggleHeading(editorElementFromSideMenuControl(event.currentTarget))
  }, [toggleHeading])

  if (!isCollapsible) return null

  return (
    <SideMenuTooltip label={label}>
      <Button
        aria-label={label}
        onClick={onButtonClick}
        size="icon-xs"
        variant="icon-quiet"
      >
        <Icon onClick={onButtonClick} data-test="headingCollapseToggle" />
      </Button>
    </SideMenuTooltip>
  )
}

function SectionControlButton({ locale }: { locale: AppLocale }) {
  const { block, editor } = useSideMenuBlock()
  if (isCollapsibleSectionBlockForEditor(editor, block)) return <HeadingCollapseButton locale={locale} />

  return <AddBlockButton />
}

function DragHandleButton({
  children,
  dragHandleMenu,
  locale = 'en',
}: SideMenuProps & { children?: ReactNode; locale?: AppLocale }) {
  const Components = useRequiredComponentsContext()
  const dict = useDictionary()
  const sideMenu = useExtension(SideMenuExtension)
  const { block, editor } = useSideMenuBlock()
  const MenuComponent: ComponentType<{ children?: ReactNode }> = dragHandleMenu ?? BlockNoteDragHandleMenu
  const { onClickCapture, onPointerDown } = usePointerBlockReorder(editor, block)

  if (!block) return null

  return (
    <Components.Generic.Menu.Root
      onOpenChange={(open: boolean) => {
        if (open) sideMenu.freezeMenu()
        else sideMenu.unfreezeMenu()
      }}
      position="left"
    >
      <Components.Generic.Menu.Trigger>
        <span
          className="inline-flex items-center justify-center"
          onPointerDown={onPointerDown}
          onClickCapture={onClickCapture}
        >
          <SideMenuTooltip label={dict.side_menu.drag_handle_label}>
            <Button
              aria-label={dict.side_menu.drag_handle_label}
              draggable={false}
              onDragEnd={sideMenu.blockDragEnd}
              onDragStart={(event) => event.preventDefault()}
              size="icon-xs"
              variant="icon-quiet"
            >
              <GripVertical data-test="dragHandle" />
            </Button>
          </SideMenuTooltip>
        </span>
      </Components.Generic.Menu.Trigger>
      {dragHandleMenu
        ? <MenuComponent>{children}</MenuComponent>
        : <DragHandleMenu locale={locale}>{children}</DragHandleMenu>}
    </Components.Generic.Menu.Root>
  )
}

function RemoveBlockItem({ children }: { children: ReactNode }) {
  const Components = useRequiredComponentsContext()
  const { block, editor } = useSideMenuBlock()

  if (!block) return null

  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      onClick={() => {
        runSideMenuAction(() => {
          removeSideMenuSection(editor, block)
        })
      }}
    >
      {children}
    </Components.Generic.Menu.Item>
  )
}

function TableHeaderItem({
  children,
  header,
}: {
  children: ReactNode
  header: 'column' | 'row'
}) {
  const Components = useRequiredComponentsContext()
  const { block, editor } = useSideMenuBlock()
  const liveBlock = liveSideMenuBlock(editor, block)
  const tableContent = tableHeaderContent(liveBlock)

  if (!tableContent || !editor.settings.tables.headers) return null

  const checked = header === 'row'
    ? Boolean(tableContent.headerRows)
    : Boolean(tableContent.headerCols)

  return (
    <Components.Generic.Menu.Item
      className="bn-menu-item"
      checked={checked}
      onClick={() => {
        runSideMenuAction(() => {
          const currentBlock = liveSideMenuBlock(editor, block)
          const currentContent = tableHeaderContent(currentBlock)
          if (!currentBlock || !currentContent) return

          editor.updateBlock(currentBlock.id, {
            content: {
              ...currentContent,
              [header === 'row' ? 'headerRows' : 'headerCols']: checked ? undefined : 1,
            } as never,
          })
        })
      }}
    >
      {children}
    </Components.Generic.Menu.Item>
  )
}

function TurnBlockIntoSubmenu({ locale }: { locale: AppLocale }) {
  const Components = useRequiredComponentsContext()
  const { block, editor } = useSideMenuBlock()

  if (!block) return null

  return (
    <Components.Generic.Menu.Root sub position="right">
      <Components.Generic.Menu.Trigger sub>
        <Components.Generic.Menu.Item className="bn-menu-item" subTrigger>
          {translate(locale, 'editor.sideMenu.turnIntoMenu')}
        </Components.Generic.Menu.Item>
      </Components.Generic.Menu.Trigger>
      {/* The submenu shrinks to its widest item instead of the menu's minimum width. */}
      <Components.Generic.Menu.Dropdown className="min-w-0" sub>
        {getBlockTypeSelectItems().map((item) => (
          <Components.Generic.Menu.Item
            key={item.key}
            className="bn-menu-item whitespace-nowrap"
            icon={createSlashMenuIcon(item.icon)}
            onClick={() => {
              runSideMenuAction(() => {
                turnBlockIntoType(editor, block.id, item, 'block_menu')
              })
            }}
          >
            {richEditorBlockTypeName(locale, item)}
          </Components.Generic.Menu.Item>
        ))}
      </Components.Generic.Menu.Dropdown>
    </Components.Generic.Menu.Root>
  )
}

function DragHandleMenu({
  children,
  locale = 'en',
}: {
  children?: ReactNode
  locale?: AppLocale
}) {
  const dict = useDictionary()

  return (
    <BlockNoteDragHandleMenu>
      {children}
      <RemoveBlockItem>{dict.drag_handle.delete_menuitem}</RemoveBlockItem>
      <TurnBlockIntoSubmenu locale={locale} />
      <TableHeaderItem header="row">{dict.drag_handle.header_row_menuitem}</TableHeaderItem>
      <TableHeaderItem header="column">{dict.drag_handle.header_column_menuitem}</TableHeaderItem>
    </BlockNoteDragHandleMenu>
  )
}

export function SideMenu({ locale = 'en', ...props }: BlockNoteSideMenuProps) {
  const { block, editor } = useSideMenuBlock()
  useSideMenuTextAlignment(editor, block)

  return (
    <BlockNoteSideMenu {...props}>
      <DragHandleButton locale={locale} />
      <SectionControlButton locale={locale} />
    </BlockNoteSideMenu>
  )
}

export function CollapsedHeadingsController() {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>()
  useCollapsedHeadingRendering(editor)

  return null
}

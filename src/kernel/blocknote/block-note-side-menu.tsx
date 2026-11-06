import {
  ArrowsClockwise,
  CaretDown,
  CaretRight,
  Check,
  Copy,
  DotsSixVertical as GripVertical,
  Plus,
  Trash,
} from '@phosphor-icons/react'
import { SideMenuExtension, SuggestionMenu } from '@blocknote/core/extensions'
import type {
  BlockSchema,
  InlineContentSchema,
  StyleSchema,
} from '@blocknote/core'
import {
  useBlockNoteEditor,
  useDictionary,
  useExtension,
  useExtensionState,
  type SideMenuProps,
} from '@blocknote/react'
import { translate, type AppLocale } from '@/lib/i18n'
import { APP_COMMAND_DEFINITIONS, APP_COMMAND_IDS } from '@/shell/app-command-catalog'
import { Button } from '@/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { richEditorBlockTypeName } from './rich-editor-block-types'
import {
  useCallback,
  useMemo,
  useRef,
  useState,
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
import { duplicateBlocksAndSelect } from './rich-editor-duplicate-blocks'
import { getBlockTypeSelectItems, type BlockTypeSelectItem } from './block-type-select'
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

/** Duplicate Block's shortcut as the manifest writes it (`⌘D`), as the tab bar's menu writes its own. */
const DUPLICATE_BLOCK_SHORTCUT = APP_COMMAND_DEFINITIONS[APP_COMMAND_IDS.editDuplicateBlock].shortcut?.display

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

/** A side menu button's tooltip, below it, as the tab bar's are. */
function SideMenuTooltip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
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

/**
 * The grip: a press that moves starts the pointer reorder (block-reorder.ts);
 * a press that does not opens the Block's menu, on the pointer's release as
 * BlockNote's menu did, so the reorder and the menu never start together. A
 * second press closes it. Enter, Space and ↓ open it from the keyboard.
 *
 * The menu is anchored on a box laid over the grip, not on the grip: Radix's
 * trigger would open on the press itself.
 */
function DragHandleButton({ locale = 'en' }: { locale?: AppLocale }) {
  const dict = useDictionary()
  const sideMenu = useExtension(SideMenuExtension)
  const { block, editor } = useSideMenuBlock()
  const { onClickCapture, onPointerDown, onPointerUpCapture } = usePointerBlockReorder(editor, block)
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  // Whether the menu was open when the press began, so its release toggles.
  const openAtPressRef = useRef(false)
  // The release opened or closed the menu; the click that follows does nothing.
  const releaseHandledRef = useRef(false)

  const setMenuOpen = useCallback((next: boolean) => {
    if (next === openRef.current) return
    openRef.current = next
    setOpen(next)
    if (next) sideMenu.freezeMenu()
    else sideMenu.unfreezeMenu()
  }, [sideMenu])

  if (!block) return null

  return (
    <DropdownMenu modal={false} open={open} onOpenChange={setMenuOpen}>
      <span
        className="relative inline-flex items-center justify-center"
        onPointerDownCapture={() => {
          openAtPressRef.current = openRef.current
          releaseHandledRef.current = false
        }}
        onPointerDown={onPointerDown}
        onPointerUpCapture={onPointerUpCapture}
        onPointerUp={(event) => {
          if (event.button !== 0) return
          releaseHandledRef.current = true
          setMenuOpen(!openAtPressRef.current)
        }}
        onClickCapture={onClickCapture}
        onClick={() => {
          if (releaseHandledRef.current) {
            releaseHandledRef.current = false
            return
          }
          setMenuOpen(!openRef.current)
        }}
      >
        <SideMenuTooltip label={dict.side_menu.drag_handle_label}>
          <Button
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label={dict.side_menu.drag_handle_label}
            data-state={open ? 'open' : 'closed'}
            draggable={false}
            onDragEnd={sideMenu.blockDragEnd}
            onDragStart={(event) => event.preventDefault()}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowDown') return
              event.preventDefault()
              setMenuOpen(true)
            }}
            ref={buttonRef}
            size="icon-xs"
            variant="icon-quiet"
          >
            <GripVertical data-test="dragHandle" />
          </Button>
        </SideMenuTooltip>
        <DropdownMenuTrigger asChild>
          <span aria-hidden="true" className="pointer-events-none absolute inset-0" tabIndex={-1} />
        </DropdownMenuTrigger>
      </span>
      <DropdownMenuContent
        align="start"
        side="left"
        onCloseAutoFocus={(event) => {
          // A choice that acts on the text focuses the editor; Escape or a
          // click away hands the focus back to the grip, as a menu button does.
          event.preventDefault()
          const editorElement = editor.domElement
          const active = editorElement?.ownerDocument.activeElement
          if (editorElement && active && editorElement.contains(active)) return
          buttonRef.current?.focus()
        }}
      >
        <BlockMenuItems locale={locale} />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Delete, last and on its own, in the red of every menu's destructive row. */
function RemoveBlockItem({ children }: { children: ReactNode }) {
  const { block, editor } = useSideMenuBlock()

  if (!block) return null

  return (
    <DropdownMenuItem
      onSelect={() => {
        runSideMenuAction(() => {
          removeSideMenuSection(editor, block)
        })
      }}
      variant="destructive"
    >
      <Trash aria-hidden="true" />
      {children}
    </DropdownMenuItem>
  )
}

/**
 * Copies the block, with its Section when it is a folded heading, right after
 * it, and puts the block selection on the copy. The editor takes the focus
 * back once the menu has closed, so the keys that act on a selection reach it.
 */
function DuplicateBlockItem({ locale }: { locale: AppLocale }) {
  const { block, editor } = useSideMenuBlock()

  if (!block) return null

  return (
    <DropdownMenuItem
      onSelect={() => {
        runSideMenuAction(() => {
          const liveBlock = liveSideMenuBlock(editor, block)
          if (!liveBlock || !duplicateBlocksAndSelect(editor, [liveBlock.id])) return
          window.setTimeout(() => editor.focus(), 0)
        })
      }}
    >
      <Copy aria-hidden="true" />
      {translate(locale, 'editor.sideMenu.duplicate')}
      {DUPLICATE_BLOCK_SHORTCUT && <DropdownMenuShortcut>{DUPLICATE_BLOCK_SHORTCUT}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  )
}

/** Header row and Header column behind their separator, for a table whose headers can be set. */
function TableHeaderItems() {
  const dict = useDictionary()
  const { block, editor } = useSideMenuBlock()

  if (!tableHeaderContent(liveSideMenuBlock(editor, block)) || !editor.settings.tables.headers) return null

  return (
    <>
      <DropdownMenuSeparator />
      <TableHeaderItem header="row">{dict.drag_handle.header_row_menuitem}</TableHeaderItem>
      <TableHeaderItem header="column">{dict.drag_handle.header_column_menuitem}</TableHeaderItem>
    </>
  )
}

function TableHeaderItem({
  children,
  header,
}: {
  children: ReactNode
  header: 'column' | 'row'
}) {
  const { block, editor } = useSideMenuBlock()
  const liveBlock = liveSideMenuBlock(editor, block)
  const tableContent = tableHeaderContent(liveBlock)

  if (!tableContent || !editor.settings.tables.headers) return null

  const checked = header === 'row'
    ? Boolean(tableContent.headerRows)
    : Boolean(tableContent.headerCols)

  return (
    <DropdownMenuCheckboxItem
      checked={checked}
      onSelect={() => {
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
    </DropdownMenuCheckboxItem>
  )
}

function isCurrentBlockType(block: SideMenuBlock, item: BlockTypeSelectItem) {
  if (item.type !== block.type) return false
  return Object.entries(item.props ?? {}).every(([name, value]) => block.props?.[name] === value)
}

/** The Block types a Block can turn into, the current one ticked, as the Formatting toolbar's block type menu lists them. */
function TurnBlockIntoSubmenu({ locale }: { locale: AppLocale }) {
  const { block, editor } = useSideMenuBlock()

  if (!block) return null

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <ArrowsClockwise aria-hidden="true" />
        {translate(locale, 'editor.sideMenu.turnIntoMenu')}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {getBlockTypeSelectItems().map((item) => (
          <DropdownMenuItem
            key={item.key}
            onSelect={() => {
              runSideMenuAction(() => {
                turnBlockIntoType(editor, block.id, item, 'block_menu')
              })
            }}
          >
            {createSlashMenuIcon(item.icon)}
            {richEditorBlockTypeName(locale, item)}
            {isCurrentBlockType(block, item) && <Check aria-hidden="true" className="ms-auto size-3" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}

/** Turn into and Duplicate, a table's header items, then Delete last on its own, as every menu puts what removes content. */
function BlockMenuItems({ locale = 'en' }: { locale?: AppLocale }) {
  const dict = useDictionary()

  return (
    <>
      <TurnBlockIntoSubmenu locale={locale} />
      <DuplicateBlockItem locale={locale} />
      <TableHeaderItems />
      <DropdownMenuSeparator />
      <RemoveBlockItem>{dict.drag_handle.delete_menuitem}</RemoveBlockItem>
    </>
  )
}

/**
 * The Block handle's attributes, as BlockNote's side menu sets them: its
 * stylesheet sizes the handle to the Block's first line by them (a heading's
 * level, a file Block with or without its file).
 */
function useSideMenuDataAttributes(): Record<string, string> {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>()
  const block = useExtensionState(SideMenuExtension, { editor, selector: (state) => state?.block })

  return useMemo(() => {
    if (!block) return {}
    const attributes: Record<string, string> = { 'data-block-type': block.type }
    const props = block.props as Record<string, unknown> | undefined
    if (block.type === 'heading') attributes['data-level'] = String(props?.level)
    if (editor.schema?.blockSpecs[block.type]?.implementation.meta?.fileBlockAccept) {
      attributes['data-url'] = props?.url ? 'true' : 'false'
    }
    return attributes
  }, [block, editor.schema])
}

/** The Block handle (CONTEXT.md): the fold or add button, then the grip that drags the Block and opens its menu. */
export function SideMenu({ locale = 'en' }: BlockNoteSideMenuProps) {
  const { block, editor } = useSideMenuBlock()
  const dataAttributes = useSideMenuDataAttributes()
  useSideMenuTextAlignment(editor, block)

  return (
    <div className="bn-side-menu" {...dataAttributes}>
      <SectionControlButton locale={locale} />
      <DragHandleButton locale={locale} />
    </div>
  )
}

export function CollapsedHeadingsController() {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>()
  useCollapsedHeadingRendering(editor)

  return null
}

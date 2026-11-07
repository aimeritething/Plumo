import { editorHasBlockWithType } from '@blocknote/core'
import { useBlockNoteEditor, useEditorState } from '@blocknote/react'
import {
  CaretDown,
  Check,
  CodeBlock,
  ListBullets,
  ListChecks,
  ListNumbers,
  Paragraph,
  Quotes,
  TextHOne,
  TextHTwo,
  TextHThree,
  TextHFour,
  TextHFive,
  TextHSix,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react'
import { useCallback, useMemo, useRef } from 'react'
import type { BlockSchema, InlineContentSchema, StyleSchema } from '@blocknote/core'
import { ToolbarButton } from '@/ui/toolbar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'
import {
  getSelectedBlocksSafely,
  type FormattingToolbarEditor,
  type SelectedBlock,
} from './formatting-toolbar-selection'
import {
  RICH_EDITOR_BLOCK_TYPE_DEFINITIONS,
  type RichEditorBlockTypeDefinition,
  type RichEditorBlockTypeKey,
} from './rich-editor-block-types'
import { turnBlocksIntoType } from './rich-editor-block-type-commands'
import {
  keepEditorFocusAfterMenuClose,
  keepFocusWhenLeavingClosingMenuItem,
  useToolbarMenu,
} from './toolbar-menu-state'

export type BlockTypeSelectItem = RichEditorBlockTypeDefinition & {
  icon: PhosphorIcon
}

type BlockTypeSelectOption = BlockTypeSelectItem & {
  isSelected: boolean
}

const BLOCK_TYPE_SELECT_ICONS: Record<RichEditorBlockTypeKey, PhosphorIcon> = {
  'bullet-list': ListBullets,
  checklist: ListChecks,
  'code-block': CodeBlock,
  'heading-1': TextHOne,
  'heading-2': TextHTwo,
  'heading-3': TextHThree,
  'heading-4': TextHFour,
  'heading-5': TextHFive,
  'heading-6': TextHSix,
  'numbered-list': ListNumbers,
  paragraph: Paragraph,
  quote: Quotes,
}

// eslint-disable-next-line react-refresh/only-export-components -- the side menu's Turn into list is the select's
export function getBlockTypeSelectItems(): BlockTypeSelectItem[] {
  return RICH_EDITOR_BLOCK_TYPE_DEFINITIONS.map((item) => ({
    ...item,
    icon: BLOCK_TYPE_SELECT_ICONS[item.key],
  }))
}

function isSelectedBlockTypeItem(item: BlockTypeSelectItem, firstSelectedBlock: SelectedBlock) {
  if (item.type !== firstSelectedBlock.type) return false

  return Object.entries(item.props || {}).every(
    ([propName, propValue]) =>
      propValue === Reflect.get(firstSelectedBlock.props, propName),
  )
}

function getBlockTypeSelectOptions(
  editor: FormattingToolbarEditor,
  firstSelectedBlock: SelectedBlock,
): BlockTypeSelectOption[] {
  return getBlockTypeSelectItems()
    .filter((item) =>
      editorHasBlockWithType(
        editor,
        item.type,
        Object.fromEntries(
          Object.entries(item.props || {}).map(([propName, propValue]) => [
            propName,
            typeof propValue,
          ]),
        ) as Record<string, 'string' | 'number' | 'boolean'>,
      ),
    )
    .map((item) => ({
      ...item,
      isSelected: isSelectedBlockTypeItem(item, firstSelectedBlock),
    }))
}

export function BlockTypeSelect() {
  const editor = useBlockNoteEditor<BlockSchema, InlineContentSchema, StyleSchema>()
  const selectedBlocks = useEditorState({
    editor,
    selector: ({ editor }): SelectedBlock[] => getSelectedBlocksSafely(editor),
  })
  const firstSelectedBlock = selectedBlocks[0] ?? null
  const selectItems = useMemo(
    () => (
      firstSelectedBlock
        ? getBlockTypeSelectOptions(editor, firstSelectedBlock)
        : []
    ),
    [editor, firstSelectedBlock],
  )
  const selectedItem = selectItems.find((item) => item.isSelected)
  // Shared with the toolbar controller, so the toolbar stays while the menu is open.
  const menuState = useToolbarMenu('blockType')
  const selectedBlockIdsRef = useRef<string[]>([])
  const captureSelectedBlockIds = useCallback(() => {
    selectedBlockIdsRef.current = selectedBlocks.map((block) => block.id)
  }, [selectedBlocks])
  const handleMenuChange = useCallback((opened: boolean) => {
    if (opened) captureSelectedBlockIds()
    menuState.setOpened(opened)
  }, [captureSelectedBlockIds, menuState])
  const handleBlockTypeChange = useCallback((item: BlockTypeSelectOption) => {
    const blockIds = selectedBlockIdsRef.current.length
      ? selectedBlockIdsRef.current
      : selectedBlocks.map((block) => block.id)
    turnBlocksIntoType({
      blockIds,
      editor,
      source: 'block_menu',
      target: item,
    })
    menuState.setOpened(false)
  }, [editor, menuState, selectedBlocks])

  if (!selectedItem || !editor.isEditable) return null

  return (
    <DropdownMenu
      modal={false}
      open={menuState.opened}
      onOpenChange={handleMenuChange}
    >
      <DropdownMenuTrigger
        render={(
          <ToolbarButton
            data-test="blockTypeSelect"
            onMouseDown={(event) => {
              captureSelectedBlockIds()
              event.preventDefault()
              event.currentTarget.focus()
            }}
          />
        )}
      >
        {selectedItem.name}
        <CaretDown aria-hidden="true" className="size-3" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        onCloseAutoFocus={(event) => keepEditorFocusAfterMenuClose(editor.domElement, event)}
      >
        {selectItems.map((item) => {
          const Icon = item.icon
          return (
            <DropdownMenuItem
              key={item.name}
              onClick={() => {
                handleBlockTypeChange(item)
              }}
              onPointerLeave={(event) => keepFocusWhenLeavingClosingMenuItem(menuState.opened, event)}
            >
              <Icon className="size-4" />
              {item.name}
              {item.isSelected && <Check aria-hidden="true" className="ms-auto size-3" />}
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

import { useBlockNoteEditor, useDictionary, type SuggestionMenuProps } from '@blocknote/react'
import { CaretRight, CircleNotch } from '@phosphor-icons/react'
import { Fragment, useCallback, useLayoutEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { isImeKeyEvent } from '@/lib/ime-key-event'
import {
  MenuList,
  MenuListEmpty,
  MenuListItem,
  MenuListLabel,
  MenuListSeparator,
  MenuListShortcut,
} from '@/ui/menu-list'
import type { SlashMenuItem } from './slash-menu-items'

// The Slash menu (CONTEXT.md), laid out like Notion's: the rows under small
// grey group labels with a hairline between the groups, each row an icon, the
// title and, at its right end, the Block's shortcut or the caret of a row that
// opens a submenu. BlockNote's SuggestionMenuController places it and owns the
// selection (the arrow keys and Enter in the editor); the rows never take the
// focus. The ids are the ones BlockNote's wrapper names in the editor's
// `aria-controls` and `aria-activedescendant`.

interface OpenSubmenu {
  key: string
  left: number
  top: number
}

type SubmenuKeyboardAction = { kind: 'close' } | { kind: 'move'; delta: number } | { kind: 'open' } | { kind: 'select' }

const SUBMENU_VIEWPORT_PADDING_PX = 8

// The submenu opens level with its row; near the bottom of the viewport that
// would run it off screen, so it slides up as far as needed (and no higher
// than the padding).
function clampedSubmenuTop(top: number, submenuHeight: number, viewportHeight: number): number {
  const maxTop = viewportHeight - submenuHeight - SUBMENU_VIEWPORT_PADDING_PX
  return Math.max(SUBMENU_VIEWPORT_PADDING_PX, Math.min(top, maxTop))
}

function stopMenuKeyboardEvent(event: KeyboardEvent) {
  event.preventDefault()
  event.stopImmediatePropagation()
}

function nextWrappedIndex(index: number, delta: number, length: number): number {
  return (index + delta + length) % length
}

/**
 * → opens a row's submenu, and so does Enter while it is shut. A row with a
 * submenu has nothing to run itself: left to BlockNote, Enter would close the
 * menu, clear the typed query and insert nothing.
 */
function openSubmenuAction({ canOpen, isOpen, key }: { canOpen: boolean; isOpen: boolean; key: string }): SubmenuKeyboardAction | null {
  if (!canOpen) return null
  return key === 'ArrowRight' || (key === 'Enter' && !isOpen) ? { kind: 'open' } : null
}

function closeSubmenuAction(key: string): SubmenuKeyboardAction | null {
  return ['ArrowLeft', 'Escape'].includes(key) ? { kind: 'close' } : null
}

function moveSubmenuAction(key: string): SubmenuKeyboardAction | null {
  if (key === 'ArrowDown') return { delta: 1, kind: 'move' }
  return key === 'ArrowUp' ? { delta: -1, kind: 'move' } : null
}

function selectSubmenuAction(key: string): SubmenuKeyboardAction | null {
  return key === 'Enter' ? { kind: 'select' } : null
}

function submenuForKey(items: SlashMenuItem[], key?: string) {
  return items.find((item) => item.key === key)?.submenuItems ?? []
}

function submenuKeyboardAction({
  canOpen,
  isOpen,
  key,
}: {
  canOpen: boolean
  isOpen: boolean
  key: string
}): SubmenuKeyboardAction | null {
  const openAction = openSubmenuAction({ canOpen, isOpen, key })
  if (openAction) return openAction
  if (!isOpen) return null
  return (
    [closeSubmenuAction(key), moveSubmenuAction(key), selectSubmenuAction(key)].find((action) => action !== null) ??
    null
  )
}

function applySubmenuKeyboardAction(options: {
  action: SubmenuKeyboardAction
  onItemClick: SuggestionMenuProps<SlashMenuItem>['onItemClick']
  openItemSubmenu: (item: SlashMenuItem) => void
  selectedItem?: SlashMenuItem
  setOpenSubmenu: Dispatch<SetStateAction<OpenSubmenu | null>>
  setSubmenuIndex: Dispatch<SetStateAction<number>>
  submenuIndex: number
  submenuItems: SlashMenuItem[]
}) {
  const {
    action,
    onItemClick,
    openItemSubmenu,
    selectedItem,
    setOpenSubmenu,
    setSubmenuIndex,
    submenuIndex,
    submenuItems,
  } = options
  switch (action.kind) {
    case 'close':
      setOpenSubmenu(null)
      break
    case 'move':
      setSubmenuIndex((current) => nextWrappedIndex(current, action.delta, submenuItems.length))
      break
    case 'open':
      if (selectedItem) openItemSubmenu(selectedItem)
      break
    case 'select': {
      const submenuItem = submenuItems.at(submenuIndex)
      if (submenuItem) onItemClick?.(submenuItem)
      setOpenSubmenu(null)
      break
    }
  }
}

export function SlashMenu({
  items,
  loadingState,
  onItemClick,
  selectedIndex,
}: SuggestionMenuProps<SlashMenuItem>) {
  const dictionary = useDictionary()
  const editor = useBlockNoteEditor()
  const itemElements = useRef(new Map<string, Element>())
  const [openSubmenu, setOpenSubmenu] = useState<OpenSubmenu | null>(null)
  const [submenuIndex, setSubmenuIndex] = useState(0)
  const submenuElement = useRef<HTMLDivElement>(null)
  const submenuItems = submenuForKey(items, openSubmenu?.key)

  useLayoutEffect(() => {
    const element = submenuElement.current
    if (!element || !openSubmenu) return
    const top = clampedSubmenuTop(openSubmenu.top, element.getBoundingClientRect().height, window.innerHeight)
    if (top !== openSubmenu.top) setOpenSubmenu({ ...openSubmenu, top })
  }, [openSubmenu])

  const openItemSubmenu = useCallback((item: SlashMenuItem) => {
    if (!item.submenuItems?.length) {
      setOpenSubmenu(null)
      return
    }
    const bounds = itemElements.current.get(item.key)?.getBoundingClientRect()
    if (!bounds) return
    setSubmenuIndex(0)
    setOpenSubmenu({ key: item.key, left: bounds.right + 4, top: bounds.top })
  }, [])

  // On the document, not on the editor element: BlockNote's own keyboard
  // navigation is a capture listener on the editor element, where Enter means
  // "run the selected row". Two capture listeners on one element run in the
  // order they registered, and this one re-registers whenever the submenu
  // opens, which put it last exactly when Enter had to pick a style. Capture on
  // the document comes first whatever the order.
  useLayoutEffect(() => {
    const element = editor.domElement
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.target instanceof Node) || !element?.contains(event.target)) return
      // `/callout` typed through an input method: its Enter confirms the letters.
      if (isImeKeyEvent(event)) return
      const selectedItem = selectedIndex === undefined ? undefined : items.at(selectedIndex)
      const action = submenuKeyboardAction({
        canOpen: Boolean(selectedItem?.submenuItems?.length),
        isOpen: Boolean(openSubmenu && submenuItems.length > 0),
        key: event.key,
      })
      if (!action) return

      stopMenuKeyboardEvent(event)
      applySubmenuKeyboardAction({
        action,
        onItemClick,
        openItemSubmenu,
        selectedItem,
        setOpenSubmenu,
        setSubmenuIndex,
        submenuIndex,
        submenuItems,
      })
    }

    const root = element?.ownerDocument
    root?.addEventListener('keydown', handleKeyDown, true)
    return () => root?.removeEventListener('keydown', handleKeyDown, true)
  }, [editor.domElement, items, onItemClick, openItemSubmenu, openSubmenu, selectedIndex, submenuIndex, submenuItems])

  const rows = items.map((item, index) => {
    const startsGroup = item.group !== items[index - 1]?.group
    const hasSubmenu = Boolean(item.submenuItems?.length)
    return (
      <Fragment key={item.key}>
        {startsGroup && index > 0 && <MenuListSeparator />}
        {startsGroup && item.group && <MenuListLabel>{item.group}</MenuListLabel>}
        <MenuListItem
          aria-haspopup={hasSubmenu ? 'menu' : undefined}
          id={`bn-suggestion-menu-item-${index}`}
          onClick={() => {
            if (hasSubmenu) openItemSubmenu(item)
            else onItemClick?.(item)
          }}
          onMouseEnter={() => {
            openItemSubmenu(item)
          }}
          ref={(element) => {
            if (element) itemElements.current.set(item.key, element)
            else itemElements.current.delete(item.key)
          }}
          selected={index === selectedIndex}
        >
          {item.icon}
          <span className="min-w-0 flex-1 truncate">{item.title}</span>
          {hasSubmenu
            ? <CaretRight aria-hidden="true" className="size-3" />
            : item.badge && <MenuListShortcut>{item.badge}</MenuListShortcut>}
        </MenuListItem>
      </Fragment>
    )
  })

  return (
    <>
      <MenuList className="w-72 max-h-104" data-slash-menu="" id="bn-suggestion-menu">
        {rows}
        {rows.length === 0 && loadingState !== 'loading-initial' && (
          <MenuListEmpty>{dictionary.suggestion_menu.no_items_title}</MenuListEmpty>
        )}
        {loadingState !== 'loaded' && (
          <MenuListEmpty aria-busy="true">
            <CircleNotch aria-hidden="true" className="animate-spin" />
          </MenuListEmpty>
        )}
      </MenuList>
      {openSubmenu &&
        submenuItems.length > 0 &&
        createPortal(
          <MenuList
            aria-label={items.find((item) => item.key === openSubmenu.key)?.title}
            className="fixed z-popover max-h-[min(26rem,calc(100vh-1rem))] min-w-40"
            ref={submenuElement}
            role="menu"
            style={{ left: openSubmenu.left, top: openSubmenu.top }}
          >
            {submenuItems.map((item, index) => (
              <MenuListItem
                key={item.key}
                onClick={() => onItemClick?.(item)}
                onMouseEnter={() => {
                  setSubmenuIndex(index)
                }}
                role="menuitem"
                selected={index === submenuIndex}
              >
                {item.icon}
                <span>{item.title}</span>
              </MenuListItem>
            ))}
          </MenuList>,
          document.body,
        )}
    </>
  )
}

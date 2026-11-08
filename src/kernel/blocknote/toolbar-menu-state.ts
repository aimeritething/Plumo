import { createContext, useCallback, useContext, useState } from 'react'

// Which of the formatting toolbar's menus is open, shared with the toolbar
// controller so the toolbar stays while one is open and can close it when the
// editor is used. One key per menu: two menus never share an open flag, or
// opening one would open the other. Outside the controller a menu keeps the
// state on its own.

export type ToolbarMenuKey = 'blockType' | 'highlightColor'

export type ToolbarMenuState = {
  openMenu: ToolbarMenuKey | null
  setMenuOpen(key: ToolbarMenuKey, opened: boolean): void
}

export const ToolbarMenuContext = createContext<ToolbarMenuState | null>(null)

// Closing only clears the key that was open: when a click on one trigger
// dismisses the other menu, the dismissal must not undo the open that the
// same click queued first.
export function toolbarMenuAfter(
  current: ToolbarMenuKey | null,
  key: ToolbarMenuKey,
  opened: boolean,
): ToolbarMenuKey | null {
  if (opened) return key
  return current === key ? null : current
}

export function useToolbarMenuState(): ToolbarMenuState {
  const [openMenu, setOpenMenu] = useState<ToolbarMenuKey | null>(null)
  const setMenuOpen = useCallback((key: ToolbarMenuKey, opened: boolean) => {
    setOpenMenu(current => toolbarMenuAfter(current, key, opened))
  }, [])
  return { openMenu, setMenuOpen }
}

export function useToolbarMenu(key: ToolbarMenuKey): {
  opened: boolean
  setOpened(opened: boolean): void
} {
  const shared = useContext(ToolbarMenuContext)
  const local = useToolbarMenuState()
  const state = shared ?? local
  const { setMenuOpen } = state
  const setOpened = useCallback((opened: boolean) => setMenuOpen(key, opened), [key, setMenuOpen])
  return { opened: state.openMenu === key, setOpened }
}

// A toolbar menu's `finalFocus`: a choice acts on the editor and focuses it,
// and handing the focus back to the trigger on close would take it from the
// text again. When the editor is not focused (Escape, a click away), the
// trigger gets it as usual.
export function returnFocusAfterMenuClose(editorElement: HTMLElement | null | undefined): boolean {
  const active = editorElement?.ownerDocument.activeElement
  return !(editorElement && active && editorElement.contains(active))
}

// Base UI hands the focus to the menu when the pointer leaves an item (so no
// item stays highlighted). After a choice the menu is closing and the editor
// has the focus, and a choice that changes the block moves the layout under
// the pointer: the leave it causes must not take the focus back from the text.
export function keepFocusWhenLeavingClosingMenuItem(
  opened: boolean,
  event: { preventBaseUIHandler(): void },
) {
  if (!opened) event.preventBaseUIHandler()
}

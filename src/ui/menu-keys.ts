import type { Menu as MenuPrimitive } from "@base-ui/react/menu"

type MenuPopupKeyDown = NonNullable<MenuPrimitive.Popup.Props["onKeyDown"]>
type MenuItemPointerLeave = NonNullable<MenuPrimitive.Item.Props["onPointerLeave"]>

/**
 * A menu's popup `onKeyDown` that refuses Tab, as Radix's menus did: the
 * menu stays open with the focus on its rows. Base UI's lets Tab carry the
 * focus past the menu, which closes it, and Shift+Tab close a submenu. A Tab
 * pressed in something the menu opened elsewhere (a dialog, through React's
 * tree) is that place's.
 */
function keepTabInMenu(onKeyDown: MenuPopupKeyDown | undefined): MenuPopupKeyDown {
  return (event) => {
    onKeyDown?.(event)
    if (event.key !== "Tab" || !event.currentTarget.contains(event.target as Node)) return
    event.preventDefault()
    event.preventBaseUIHandler()
  }
}

/**
 * A menu item's `onPointerLeave`: Base UI hands the focus to the menu when the
 * pointer leaves an item, so no item stays highlighted. Once the menu is
 * closing (a choice was made, and has put the focus in the editor), a leave
 * the choice causes by moving the layout under the pointer leaves the focus
 * where the choice put it.
 */
function keepFocusWhenLeavingClosingMenu(onPointerLeave: MenuItemPointerLeave | undefined): MenuItemPointerLeave {
  return (event) => {
    onPointerLeave?.(event)
    const popup = event.currentTarget.closest('[data-slot$="menu-content"], [data-slot$="menu-sub-content"]')
    if (popup && !popup.hasAttribute("data-open")) event.preventBaseUIHandler()
  }
}

export { keepFocusWhenLeavingClosingMenu, keepTabInMenu }

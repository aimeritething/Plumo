"use client"

import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { mergeProps } from "@base-ui/react/merge-props"
import { cn } from "@/lib/cn"
import { ScrollArea } from "./scroll-area"
import { renderWithClickAfterMenu } from "./menu-item-click"
import { MenuOpenedFrom, useMenuReturnFocus } from "./menu-return-focus"
import { surfaceVariants } from "./surface"
import { CaretRight as ChevronRightIcon, Check as CheckIcon, Circle as CircleIcon } from "@phosphor-icons/react"

// The menu look, shared with ui/menu-list.tsx (the list a text field drives,
// such as an editor's `/` menu), so the two kinds of menu read as one: the
// popover surface (ui/surface) as the card, Notion's rows, an icon then the
// label, a hint at the right end, small grey labels over the groups, hairlines
// between them.

/**
 * A row: 32px, an icon then the label, the icon in the secondary colour unless
 * it brings its own. The row is the `menu-item` group, so an icon can change
 * with the row's state (`group-hover/menu-item:`, `group-data-highlighted/menu-item:`,
 * `group-aria-selected/menu-item:`).
 */
const menuItemClassName =
  "group/menu-item relative flex h-8 cursor-default items-center gap-2 rounded-lg px-2 text-sm outline-hidden select-none [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground"

/** A group's label: small, grey, above its rows. */
const menuLabelClassName = "px-2 pt-2 pb-1 text-2xs font-medium text-muted-foreground"

/** The hint at a row's right end (a shortcut): plain text, Inter 11/500. */
const menuShortcutClassName = "ml-auto text-2xs font-medium text-subtle-foreground"

/** The hairline between two groups, edge to edge across the card's inset. */
const menuSeparatorClassName = "-mx-1.5 my-1.5 h-(--hairline) shrink-0 bg-border"

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />
}

// `openOnPress={false}` leaves the press to the trigger's own element: its
// owner opens the menu on the release or the click instead, through a
// controlled `open`. Base UI opens the menu on the press (and toggles it on a
// click with no press before it), so the menu would open as the press starts
// a drag (a Table handle and the block grip are dragged and open a menu).
// ArrowDown still opens it, Enter and Space reach the element's own click,
// and the trigger keeps aria-expanded and its open state.
function DropdownMenuTrigger({
  openOnPress = true,
  render,
  ...props
}: MenuPrimitive.Trigger.Props & {
  openOnPress?: boolean
}) {
  return (
    <MenuPrimitive.Trigger
      data-slot="dropdown-menu-trigger"
      render={openOnPress || typeof render === "function"
        ? render
        : (triggerProps) => <TriggerWithoutPress element={render} {...triggerProps} />}
      {...props}
    />
  )
}

type TriggerWithoutPressProps = React.HTMLAttributes<HTMLElement> & {
  element: React.ReactElement | undefined
  ref?: React.Ref<HTMLElement>
}

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value)
  else if (ref) ref.current = value
}

// Takes Base UI's trigger props and renders them on the trigger's element,
// all but Base UI's press and click handlers; the element's own handlers and
// ref stay.
function TriggerWithoutPress({
  element,
  ref,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
  onMouseDown: _press,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
  onPointerDown: _pointerPress,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
  onClick: _click,
  ...props
}: TriggerWithoutPressProps) {
  const elementRef = (element?.props as { ref?: React.Ref<HTMLElement> } | undefined)?.ref
  const setRefs = React.useCallback((node: HTMLElement | null) => {
    setRef(ref, node)
    setRef(elementRef, node)
  }, [ref, elementRef])
  if (!element) return <button type="button" {...props} ref={setRefs} />
  return React.cloneElement(element, {
    ...mergeProps(props, element.props as React.HTMLAttributes<HTMLElement>),
    ref: setRefs,
  } as React.HTMLAttributes<HTMLElement>)
}

// Radix's placement, which Plumo's menus were laid out with: centred on the
// trigger, no padding from the window's edge, a flip to the other side of the
// same axis and a shift along it, never an alignment flip.
const MENU_COLLISION_AVOIDANCE = { align: "shift", fallbackAxisSide: "none" } as const

type MenuPlacementProps = Pick<
  MenuPrimitive.Positioner.Props,
  "align" | "alignOffset" | "side" | "sideOffset" | "collisionPadding" | "collisionAvoidance"
>

// `matchTriggerWidth`: the menu is as wide as its trigger (the Folder
// switcher's menu, as wide as its row), not as wide as its rows.
function DropdownMenuContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  collisionPadding = 0,
  collisionAvoidance = MENU_COLLISION_AVOIDANCE,
  matchTriggerWidth = false,
  finalFocus,
  children,
  ...props
}: MenuPrimitive.Popup.Props &
  MenuPlacementProps & {
    matchTriggerWidth?: boolean
  }) {
  const returnFocus = useMenuReturnFocus()
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        data-slot="dropdown-menu-positioner"
        className="isolate z-popover outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        collisionAvoidance={collisionAvoidance}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          finalFocus={finalFocus ?? returnFocus.finalFocus}
          className={cn(
            surfaceVariants(),
            "flex max-h-(--available-height) min-w-[8rem] origin-(--transform-origin) flex-col overflow-hidden outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            matchTriggerWidth && "w-(--anchor-width)",
            className
          )}
          {...props}
        >
          {finalFocus === undefined && <MenuOpenedFrom onOpen={returnFocus.noteOpenedFrom} />}
          {/* A menu taller than the window scrolls with Plumo's bar; the inset is the viewport's. */}
          <ScrollArea className="min-h-0" viewportClassName="p-1.5">
            {children}
          </ScrollArea>
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

function DropdownMenuGroup({
  ...props
}: MenuPrimitive.Group.Props) {
  return (
    <MenuPrimitive.Group data-slot="dropdown-menu-group" {...props} />
  )
}

function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  onClick,
  render,
  ...props
}: MenuPrimitive.Item.Props & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <MenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        menuItemClassName,
        "focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-[variant=destructive]:*:[svg]:text-destructive!",
        className
      )}
      render={renderWithClickAfterMenu(onClick, render)}
      {...props}
    />
  )
}

function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  onClick,
  render,
  ...props
}: MenuPrimitive.CheckboxItem.Props) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="dropdown-menu-checkbox-item"
      className={cn(
        "relative flex h-8 cursor-default items-center gap-2 rounded-lg pr-2 pl-8 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      render={renderWithClickAfterMenu(onClick, render)}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon className="size-4" />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )
}

function DropdownMenuRadioGroup({
  ...props
}: MenuPrimitive.RadioGroup.Props) {
  return (
    <MenuPrimitive.RadioGroup
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )
}

function DropdownMenuRadioItem({
  className,
  children,
  onClick,
  render,
  ...props
}: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="dropdown-menu-radio-item"
      className={cn(
        "relative flex h-8 cursor-default items-center gap-2 rounded-lg pr-2 pl-8 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      render={renderWithClickAfterMenu(onClick, render)}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <MenuPrimitive.RadioItemIndicator>
          <CircleIcon className="size-2 fill-current" />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )
}

function DropdownMenuLabel({
  className,
  inset,
  ...props
}: MenuPrimitive.GroupLabel.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        menuLabelClassName,
        "data-[inset]:pl-8",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn(menuSeparatorClassName, className)}
      {...props}
    />
  )
}

// The one way a menu writes its shortcut.
function DropdownMenuShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="dropdown-subtle-foreground"
      className={cn(menuShortcutClassName, className)}
      {...props}
    />
  )
}

function DropdownMenuSub({
  ...props
}: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}: MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        menuItemClassName,
        "focus:bg-accent focus:text-accent-foreground data-[inset]:pl-8 data-popup-open:bg-accent data-popup-open:text-accent-foreground",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ml-auto size-4" />
    </MenuPrimitive.SubmenuTrigger>
  )
}

// A submenu opens beside its row, its first row level with it, as Radix's did.
function DropdownMenuSubContent({
  className,
  align = "start",
  alignOffset = 0,
  side = "right",
  sideOffset = 0,
  collisionPadding = 0,
  collisionAvoidance = MENU_COLLISION_AVOIDANCE,
  ...props
}: MenuPrimitive.Popup.Props & MenuPlacementProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        data-slot="dropdown-menu-sub-positioner"
        className="isolate z-popover outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        collisionAvoidance={collisionAvoidance}
      >
        <MenuPrimitive.Popup
          data-slot="dropdown-menu-sub-content"
          className={cn(
            surfaceVariants(),
            "min-w-[8rem] origin-(--transform-origin) overflow-hidden p-1.5 outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            className
          )}
          {...props}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- the menu look, shared with menu-list.tsx
export { menuItemClassName, menuLabelClassName, menuSeparatorClassName, menuShortcutClassName }

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}

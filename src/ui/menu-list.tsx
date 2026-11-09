import { useCallback, useEffect, useRef, type ComponentProps, type Ref } from "react"
import { cn } from "@/lib/cn"
import {
  menuItemClassName,
  menuLabelClassName,
  menuSeparatorClassName,
  menuShortcutClassName,
} from "./dropdown-menu"
import { ScrollArea } from "./scroll-area"
import { surfaceVariants } from "./surface"

// A menu that never takes the focus: the element that has it (a text field,
// an editor) moves the selection with its own keys and says which row is
// selected. It looks like ui/dropdown-menu (the card, the rows, the group
// labels and the hairlines are the same classes); a Base UI menu takes the
// focus and moves it from row to row, which a menu that filters as the user
// types cannot do.

/**
 * The card: rows scroll in Plumo's ScrollArea inside it, the card's inset the
 * viewport's. It fills the height its parent allows and no more. `className`
 * places and sizes it; its look is the shared menu's.
 */
function MenuList({
  className,
  children,
  role = "listbox",
  ...props
}: ComponentProps<"div">) {
  return (
    <div
      data-slot="menu-list"
      role={role}
      className={cn(surfaceVariants(), "flex min-w-[8rem] flex-col overflow-hidden", className)}
      {...props}
    >
      <ScrollArea className="min-h-0" viewportClassName="p-1.5" fade={false}>
        {children}
      </ScrollArea>
    </div>
  )
}

/** A group's label, above its rows. */
function MenuListLabel({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="menu-list-label" className={cn(menuLabelClassName, className)} {...props} />
}

/** The hairline between two groups. */
function MenuListSeparator({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      aria-hidden="true"
      data-slot="menu-list-separator"
      className={cn(menuSeparatorClassName, className)}
      {...props}
    />
  )
}

/**
 * Scrolls the menu's own viewport, and nothing else, until `row` shows. A
 * row's `scrollIntoView` also scrolls every scroller above the menu: the Slash
 * menu's first row mounts before BlockNote places its floating wrapper, at the
 * top of the Document, and the editor jumped there.
 */
function scrollRowIntoMenu(row: HTMLElement) {
  const viewport = row.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
  if (!viewport) return
  const rowBox = row.getBoundingClientRect()
  const viewportBox = viewport.getBoundingClientRect()
  if (rowBox.top < viewportBox.top) viewport.scrollTop -= viewportBox.top - rowBox.top
  else if (rowBox.bottom > viewportBox.bottom) viewport.scrollTop += rowBox.bottom - viewportBox.bottom
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value)
  else if (ref) ref.current = value
}

/**
 * A row. `selected` is the row the keys would run, tinted like the row under
 * the pointer, and scrolled into the menu's view when it becomes the selected
 * one (the menu scrolls, never the page under it). A press keeps the focus
 * where it is.
 */
function MenuListItem({
  className,
  selected = false,
  role = "option",
  onMouseDown,
  ref,
  ...props
}: ComponentProps<"div"> & { selected?: boolean }) {
  const elementRef = useRef<HTMLDivElement | null>(null)
  const setRefs = useCallback((element: HTMLDivElement | null) => {
    elementRef.current = element
    assignRef(ref, element)
  }, [ref])

  useEffect(() => {
    if (selected && elementRef.current) scrollRowIntoMenu(elementRef.current)
  }, [selected])

  return (
    <div
      ref={setRefs}
      data-slot="menu-list-item"
      role={role}
      aria-selected={selected || undefined}
      className={cn(
        menuItemClassName,
        "hover:bg-accent aria-selected:bg-accent",
        className
      )}
      onMouseDown={(event) => {
        event.preventDefault()
        onMouseDown?.(event)
      }}
      {...props}
    />
  )
}

/** The hint at a row's right end: a shortcut, or what the row answers to. */
function MenuListShortcut({ className, ...props }: ComponentProps<"span">) {
  return <span data-slot="menu-list-shortcut" className={cn(menuShortcutClassName, className)} {...props} />
}

/** The one row a list with nothing to show has, in the muted colour. */
function MenuListEmpty({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="menu-list-empty"
      className={cn(menuItemClassName, "text-subtle-foreground", className)}
      {...props}
    />
  )
}

export { MenuList, MenuListEmpty, MenuListItem, MenuListLabel, MenuListSeparator, MenuListShortcut }

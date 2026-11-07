import type { ComponentProps, ComponentType } from 'react'
import type { IconProps } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

/**
 * The sidebar's row vocabulary, shared by the groups the sidebar stacks
 * (Pinned, the Explorer): the quiet 28px label above a group in medium
 * weight, the 32px row with its 8px radius in regular weight, and the row's
 * 16px icon and name. A row's selected state
 * is its `aria-selected`; the icon reads it through the row's `group`. The
 * Explorer's rows carry their `aria-selected` on the `treeitem` above them,
 * so they read it with `in-aria-selected:` instead.
 */

/** The label above a group: 28px, 12px medium type, no interaction. */
export function SidebarLabel({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex h-7 flex-none cursor-default items-center px-2 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  )
}

/** The row's look, for a row that has to be a `<button>` (a menu's trigger). */
export const SIDEBAR_ROW_CLASSES = cn(
  'group flex h-8 cursor-default items-center gap-1.5 rounded-lg pr-1.5 pl-2 whitespace-nowrap text-sidebar-foreground outline-none',
  'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
  'data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground',
  'aria-selected:bg-sidebar-selected aria-selected:text-sidebar-foreground',
  'focus-visible:focus-ring',
)

/**
 * A row: hover and selection from the sidebar link tokens, a focus ring from
 * the keyboard. A row whose context menu is open (`data-state="open"`, from the
 * menu's trigger) keeps the hover look while the pointer is in the menu: a
 * right-click does not select, so this is the only mark on the row the menu
 * acts on, and it must not look like the selected row.
 */
export function SidebarRow({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn(SIDEBAR_ROW_CLASSES, className)} {...props} />
}

/** A row's icon colours: tertiary, a step quieter than the name, until the row is hovered or selected. */
export const SIDEBAR_ROW_ICON_COLORS = 'text-muted-foreground group-hover:text-foreground group-data-[state=open]:text-foreground group-aria-selected:text-foreground'

/** The row's 16px icon. */
export function SidebarRowIcon({ icon: Icon, className, ...props }: { icon: ComponentType<IconProps> } & IconProps) {
  return (
    <Icon
      size={16}
      aria-hidden="true"
      className={cn('flex-none', SIDEBAR_ROW_ICON_COLORS, className)}
      {...props}
    />
  )
}

/** The row's name: takes the room and ellipsises. */
export function SidebarRowName({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn('min-w-0 flex-1 truncate', className)} {...props} />
}

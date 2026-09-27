import type { ComponentProps, ComponentType } from 'react'
import type { IconProps } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

/**
 * The sidebar's row vocabulary, shared by the groups the sidebar stacks
 * (Pinned, the Explorer): the quiet 28px label above a group, the 30px
 * row with its 8px radius, and the row's icon and name. A row's selected state
 * is its `aria-selected`; the icon reads it through the row's `group`. The
 * Explorer's rows carry their `aria-selected` on the `treeitem` above them,
 * so they read it with `in-aria-selected:` instead.
 */

/** The label above a group: 28px, 12px type, no interaction. */
export function SidebarLabel({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex h-7 flex-none cursor-default items-center px-2 text-xs text-text-tertiary', className)}
      {...props}
    />
  )
}

/**
 * A row: hover and selection from the sidebar link tokens, a focus ring from
 * the keyboard. A row whose context menu is open (`data-state="open"`, from the
 * menu's trigger) keeps the hover look while the pointer is in the menu: a
 * right-click does not select, so this is the only mark on the row the menu
 * acts on, and it must not look like the selected row.
 */
export function SidebarRow({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'group flex h-7.5 cursor-default items-center gap-1.5 rounded-lg pr-1.5 pl-2 whitespace-nowrap text-text-secondary outline-none',
        'hover:bg-sidebar-row-hover hover:text-text-heading',
        'data-[state=open]:bg-sidebar-row-hover data-[state=open]:text-text-heading',
        'aria-selected:bg-sidebar-row-active aria-selected:text-text-heading',
        'focus-visible:focus-ring',
        className,
      )}
      {...props}
    />
  )
}

/** A row's icon colours: tertiary, a step quieter than the name, until the row is hovered or selected. */
export const SIDEBAR_ROW_ICON_COLORS = 'text-text-tertiary group-hover:text-text-primary group-data-[state=open]:text-text-primary group-aria-selected:text-text-primary'

/** The row's 14px icon. */
export function SidebarRowIcon({ icon: Icon, className, ...props }: { icon: ComponentType<IconProps> } & IconProps) {
  return (
    <Icon
      size={14}
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

/**
 * On a control whose click opens something: a Tab, or an Explorer folder. The
 * sidebar drops the second click of a double-click that starts on one, so a
 * double-click is one open: one Tab, one new Document from the Explorer's "+",
 * or one folder opened (not opened and shut again), however the sidebar has
 * shifted under the pointer in between (a folder opening to show the new row).
 * A plain button inside one, a folder's caret, keeps its second click.
 */
export const ONE_OPEN_PER_DOUBLE_CLICK_PROPS = { 'data-one-open': '' } as const

import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"
import { Slot } from "radix-ui"

// The icon button: tertiary at rest, hover and an open menu both take the
// tertiary-hover fill and the secondary colour, disabled goes muted without
// fading. `icon-quiet` rests one step lighter, for the block side menu.
const ICON_BUTTON_STATES =
  "transition-colors duration-150 ease-out hover:bg-accent hover:text-muted-foreground data-[state=open]:bg-accent data-[state=open]:text-muted-foreground disabled:text-subtle-foreground disabled:opacity-100"

// shadcn's names, Plumo's values: 28px controls, 13px, `rounded-sm`, the 1px
// focus ring. default is Linear's primary, secondary its filled secondary,
// outline the same with a hairline edge, ghost the tertiary button, icon the
// icon-only one. Icon sizes: icon-2xs (18px, 12px glyph) inline in a row,
// icon-xs (24px, 16px glyph) everywhere else. `placeholder` with the `row`
// size is Notion's empty slot: a full-width muted row, an icon and what to
// add, on the hover fill, a step darker on hover or when `data-selected`.
// `fill` takes its slot's whole box and its cursor: the slot is laid out (and
// says what a press does, e.g. a resize cursor) by whoever places it.
const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-sm text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border-hairline border-border bg-background text-foreground shadow-xs hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-selected",
        ghost:
          "hover:bg-accent hover:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        icon: `text-muted-foreground ${ICON_BUTTON_STATES}`,
        "icon-quiet": `text-subtle-foreground ${ICON_BUTTON_STATES}`,
        placeholder:
          "bg-muted font-normal text-muted-foreground hover:bg-selected hover:text-foreground data-[selected=true]:bg-selected",
      },
      size: {
        default: "h-7 px-3 py-1 has-[>svg]:px-2.5",
        xs: "h-6 gap-1 rounded-sm px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-sm px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-sm px-6 has-[>svg]:px-4",
        icon: "size-7 rounded-full",
        "icon-2xs": "size-4.5 rounded-sm [&_svg:not([class*='size-'])]:size-3",
        "icon-xs": "size-6 rounded-md",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
        row: "h-11 w-full justify-start gap-2.5 px-3 [&_svg:not([class*='size-'])]:size-5",
        fill: "size-full cursor-[inherit] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- shadcn/ui pattern
export { Button, buttonVariants }

import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"

import { Separator } from "./separator"

// shadcn's Item, the parts Plumo uses: a row that names something on the left
// (`ItemContent`, its `ItemTitle`) and holds what acts on it on the right
// (`ItemActions`). A row too narrow for both wraps, and the actions go under
// the name, at its left. `card` on the group is Plumo's: the rows share one
// rounded, hairlined card in the colour of what it sits on, an
// `ItemSeparator` between them, as a list of settings is drawn (the Settings
// dialog).
const itemGroupVariants = cva("group/item-group flex flex-col", {
  variants: {
    variant: {
      default: "",
      card: "rounded-xl border-hairline border-border",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

function ItemGroup({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof itemGroupVariants>) {
  return (
    <div
      data-slot="item-group"
      data-variant={variant}
      className={cn(itemGroupVariants({ variant }), className)}
      {...props}
    />
  )
}

function ItemSeparator({
  className,
  ...props
}: React.ComponentProps<typeof Separator>) {
  return (
    <Separator
      data-slot="item-separator"
      orientation="horizontal"
      className={className}
      {...props}
    />
  )
}

// The default row is 48px with a 28px control: 10px above and below it.
const itemVariants = cva(
  "group/item flex flex-wrap items-center justify-between text-sm outline-none",
  {
    variants: {
      size: {
        default: "min-h-12 gap-x-4 gap-y-2 px-4 py-2.5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function Item({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof itemVariants>) {
  return (
    <div
      data-slot="item"
      data-size={size}
      className={cn(itemVariants({ size }), className)}
      {...props}
    />
  )
}

function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-content"
      className={cn("flex min-w-0 flex-col gap-1", className)}
      {...props}
    />
  )
}

function ItemTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-title"
      className={cn("text-sm leading-5 text-foreground", className)}
      {...props}
    />
  )
}

function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-actions"
      className={cn("flex min-w-0 flex-wrap items-center gap-2", className)}
      {...props}
    />
  )
}

export { Item, ItemActions, ItemContent, ItemGroup, ItemSeparator, ItemTitle }

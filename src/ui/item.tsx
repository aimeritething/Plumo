import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"

import { Separator } from "./separator"

// shadcn's Item, the parts Plumo uses: a row that names something on the left
// (`ItemContent`: a title over a description) and holds what acts on it on the
// right (`ItemActions`). `card` on the group is Plumo's: the rows share one
// rounded, hairlined card with an `ItemSeparator` between them, as a settings
// list is drawn (the Settings dialog).
const itemGroupVariants = cva("group/item-group flex flex-col", {
  variants: {
    variant: {
      default: "",
      card: "overflow-hidden rounded-xl border-hairline border-border",
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
      role="list"
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

// A row wraps when it is too narrow for both sides: the actions go under the
// content rather than squeeze it.
function Item({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      role="listitem"
      data-slot="item"
      className={cn(
        "flex flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3.5 text-sm",
        className
      )}
      {...props}
    />
  )
}

function ItemContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-content"
      className={cn("flex min-w-40 flex-1 flex-col gap-0.5", className)}
      {...props}
    />
  )
}

function ItemTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-title"
      className={cn("text-sm leading-5 font-medium text-foreground", className)}
      {...props}
    />
  )
}

function ItemDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="item-description"
      className={cn("text-xs leading-4.5 text-balance text-muted-foreground", className)}
      {...props}
    />
  )
}

function ItemActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="item-actions"
      className={cn("flex flex-none items-center gap-2", className)}
      {...props}
    />
  )
}

export {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
}

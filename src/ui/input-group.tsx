import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"
import { nativeTextAssistanceDisabledProps } from "@/platform/native-text-assistance"

// shadcn's InputGroup, the parts Plumo uses: one frame around a text field and
// what sits beside it in the frame (`InputGroupAddon`, here a button). The
// frame, not the field, draws the edge and the focus ring. `pill` is Plumo's,
// the look of a `pill` Select trigger: a hairline edge in the card's colour,
// fully rounded, no fill of its own (the Settings dialog's hex field).
const inputGroupVariants = cva(
  "group/input-group relative flex h-7 min-w-0 items-center border text-sm transition-[color,box-shadow] has-[[data-slot=input-group-control]:focus-visible]:focus-ring has-[[data-slot=input-group-control][aria-invalid=true]]:border-destructive",
  {
    variants: {
      variant: {
        default: "rounded-lg border-input dark:bg-input/30",
        pill: "rounded-full border-hairline border-border bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function InputGroup({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupVariants>) {
  return (
    <div
      data-slot="input-group"
      data-variant={variant}
      role="group"
      className={cn(inputGroupVariants({ variant }), className)}
      {...props}
    />
  )
}

const inputGroupAddonVariants = cva(
  "flex h-full flex-none cursor-text items-center text-muted-foreground select-none",
  {
    variants: {
      align: {
        "inline-start": "order-first pl-0.5",
        "inline-end": "order-last pr-0.5",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  }
)

// A press on the addon, outside a button in it, puts the focus in the field.
function InputGroupAddon({
  className,
  align = "inline-start",
  onMouseDown,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>) {
  return (
    <div
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onMouseDown={(event) => {
        onMouseDown?.(event)
        if ((event.target as HTMLElement).closest("button")) return
        event.preventDefault()
        event.currentTarget.parentElement?.querySelector("input")?.focus()
      }}
      {...props}
    />
  )
}

function InputGroupInput({
  className,
  type = "text",
  ...props
}: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input-group-control"
      {...nativeTextAssistanceDisabledProps}
      className={cn(
        "h-full w-full min-w-0 flex-1 bg-transparent px-2 text-sm text-foreground outline-none selection:bg-selection placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
}

export { InputGroup, InputGroupAddon, InputGroupInput }

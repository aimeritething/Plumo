import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"
import { nativeTextAssistanceDisabledProps } from "@/platform/native-text-assistance"

// shadcn's input. `compact` is Plumo's: a 20px field with a hairline edge on
// the pane's colour, small enough to sit inside a 32px sidebar row (the
// Explorer's inline rename) beside the row's icon.
const inputVariants = cva(
  "w-full min-w-0 border bg-transparent text-sm transition-[color,box-shadow] outline-none selection:bg-selection file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:focus-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      size: {
        default: "h-7 rounded-lg border-input px-3 py-1 dark:bg-input/30",
        compact: "h-5 rounded-sm border-hairline border-border bg-background px-1 py-0 text-foreground",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & VariantProps<typeof inputVariants>) {
  return (
    <input
      type={type}
      data-slot="input"
      data-size={size}
      {...nativeTextAssistanceDisabledProps}
      className={cn(inputVariants({ size }), className)}
      {...props}
    />
  )
}

export { Input }

"use client"

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"

// Button's values: 28px, 13px, `rounded-sm`; on (`aria-pressed`) = the
// selected secondary. `icon` with the `icon-xs` size is Button's icon button
// that stays on: muted and bare at rest like its neighbours, the selected fill
// and the foreground colour while on. One that cannot be switched
// (`aria-disabled`) fades but keeps the pointer and the focus, for its tooltip.
const toggleVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-sm text-sm font-medium whitespace-nowrap transition-colors outline-none hover:bg-accent hover:text-accent-foreground focus-visible:focus-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 aria-pressed:bg-selected aria-pressed:text-accent-foreground dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        outline:
          "border-hairline bg-transparent hover:bg-accent hover:text-accent-foreground",
        icon: "bg-transparent text-muted-foreground duration-150 ease-out hover:text-muted-foreground aria-disabled:opacity-50 aria-pressed:hover:bg-selected aria-pressed:hover:text-accent-foreground",
      },
      size: {
        default: "h-7 min-w-7 px-2",
        sm: "h-8 min-w-8 px-1.5",
        lg: "h-10 min-w-10 px-2.5",
        "icon-xs": "size-6 rounded-md",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant,
  size,
  ...props
}: TogglePrimitive.Props & VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- shadcn/ui pattern
export { Toggle, toggleVariants }

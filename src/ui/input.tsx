import type * as React from "react"
import { cn } from "@/lib/cn"
import { nativeTextAssistanceDisabledProps } from "@/platform/native-text-assistance"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      {...nativeTextAssistanceDisabledProps}
      className={cn(
        "h-7 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1 text-sm transition-[color,box-shadow] outline-none selection:bg-selection file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30",
        "focus-visible:focus-ring",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }

import type * as React from "react"
import { cn } from "@/lib/cn"
import { nativeTextAssistanceDisabledProps } from "@/platform/native-text-assistance"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      {...nativeTextAssistanceDisabledProps}
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm transition-[color,box-shadow] outline-none selection:bg-selection placeholder:text-muted-foreground focus-visible:focus-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }

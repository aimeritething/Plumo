import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"
import { nativeTextAssistanceDisabledProps } from "@/platform/native-text-assistance"

// shadcn's input.
const inputVariants = cva(
  "w-full min-w-0 border bg-transparent text-sm transition-[color,box-shadow] outline-none selection:bg-selection file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 focus-visible:focus-ring aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      size: {
        default: "h-7 rounded-lg border-input px-3 py-1 dark:bg-input/30",
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

// Plumo's; shadcn has no field whose frame also holds text the user cannot
// edit. A name edited in place (the Explorer's inline rename): one 1px frame in
// the focus colour around the editable stem and, right after it, the locked
// suffix (a file's extension), so the name reads as the one string its row
// shows. The input is as wide as what it holds, which is what keeps the suffix
// against the stem; a stem too long for the frame scrolls inside it and the
// suffix stays in view at the frame's end. A press on the suffix or on the
// empty part of the frame puts the caret at the end of the stem.
function NameInput({
  suffix,
  value,
  className,
  ...props
}: Omit<React.ComponentProps<"input">, "size" | "type" | "value"> & {
  value: string
  /** Static text right after the editable part; never editable. */
  suffix?: string
}) {
  const caretToEnd = (event: React.MouseEvent<HTMLDivElement>) => {
    const input = event.currentTarget.querySelector("input")
    if (!input || event.target === input) return
    event.preventDefault()
    input.focus()
    input.setSelectionRange(input.value.length, input.value.length)
  }

  return (
    <div
      data-slot="name-input"
      className={cn(
        "flex h-6 min-w-0 flex-1 cursor-text items-center rounded-sm border border-ring bg-background px-1 text-sm text-foreground has-aria-invalid:border-destructive",
        className,
      )}
      onMouseDown={caretToEnd}
    >
      <span className="inline-grid min-w-px grid-cols-1 overflow-hidden">
        <span aria-hidden="true" className="invisible col-start-1 row-start-1 whitespace-pre">{value}</span>
        <input
          type="text"
          size={1}
          value={value}
          {...nativeTextAssistanceDisabledProps}
          className="col-start-1 row-start-1 w-full min-w-0 bg-transparent outline-none selection:bg-selection"
          {...props}
        />
      </span>
      {suffix && <span className="flex-none text-muted-foreground">{suffix}</span>}
    </div>
  )
}

export { Input, NameInput }

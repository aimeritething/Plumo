import type * as React from "react"
import { cn } from "@/lib/cn"

/** A shortcut chip: mono 11px on the shade surface. Menus write their shortcuts as plain text (`DropdownMenuShortcut`); everywhere else it is this. */
function Kbd({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-sm bg-muted px-1 font-mono text-2xs font-medium tracking-normal text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { Kbd }

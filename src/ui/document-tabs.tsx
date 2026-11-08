import type { ComponentProps, KeyboardEvent } from "react"
import { cva } from "class-variance-authority"
import { cn } from "@/lib/cn"

// The tab bar's Tabs: one per open Document or Image file, each closable.
// shadcn's Tabs does not fit: its trigger is a <button>, and a Tab holds its
// own × button, which a button may not; and a Tab shows no panel of its own
// (the editor pane shows the active Tab's file), so there is no TabsContent
// for it to switch. So a Tab is a `role="tab"` element that is not a button
// and runs as one: a click or Enter or Space selects it. Only the selected
// Tab is in the Tab order.

/**
 * The strip of Tabs: one row that scrolls sideways when the Tabs overflow,
 * with no scrollbar drawn.
 */
function DocumentTabList({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="document-tab-list"
      role="tablist"
      className={cn(
        "flex min-w-0 flex-initial items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      {...props}
    />
  )
}

// One Tab: 30px, 6px radius, 12px in from either side, at least 96px and at
// most 220px wide. Muted at rest; the hover fill and the foreground colour
// under the pointer; the selected one told apart by its fill alone; the 1px
// focus ring. A `group`, so what it holds (the ×) can show on its hover.
const documentTabVariants = cva(
  "group flex h-7.5 max-w-55 min-w-24 flex-initial cursor-default items-center gap-1.5 rounded-md px-3 text-sm whitespace-nowrap text-muted-foreground outline-none hover:bg-accent hover:text-foreground aria-selected:bg-selected aria-selected:text-foreground focus-visible:focus-ring"
)

/** A Tab. `onSelect` runs on a click, and on Enter or Space while it has the focus. */
function DocumentTab({
  className,
  selected = false,
  onSelect,
  onKeyDown,
  ...props
}: Omit<ComponentProps<"div">, "onSelect"> & {
  selected?: boolean
  onSelect?: () => void
}) {
  return (
    <div
      data-slot="document-tab"
      role="tab"
      aria-selected={selected}
      tabIndex={selected ? 0 : -1}
      className={cn(documentTabVariants(), className)}
      onClick={onSelect}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(event)
        if (event.key === "Enter" || event.key === " ") onSelect?.()
      }}
      {...props}
    />
  )
}

export { DocumentTab, DocumentTabList }

import { useCallback, type ComponentProps, type KeyboardEvent, type Ref } from "react"
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
 * with no scrollbar drawn, so the Tabs fade out over an edge where more of
 * them lie past it (`scroll-fade-x` in index.css), and a Tab scrolled into
 * view stops clear of the fade.
 *
 * The selected Tab's fill is one element of the strip's, not each Tab's own:
 * it lies under the selected Tab and slides from the Tab that was selected to
 * the one that now is. It only slides for a change of selection; when the
 * Tabs change size or order it is simply where the selected Tab is. While a
 * Tab is carried along the strip (`data-reordering`) it is out of sight, and
 * the carried Tab wears the fill itself.
 */
function DocumentTabList({ className, ref, children, ...props }: ComponentProps<"div">) {
  const stripRef = useStripMeasures(ref)
  return (
    <div
      ref={stripRef}
      data-slot="document-tab-list"
      role="tablist"
      className={cn(
        "scroll-fade-x relative flex min-w-0 flex-initial items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
      {...props}
    >
      <div
        data-slot="document-tab-fill"
        role="presentation"
        hidden
        className="pointer-events-none absolute inset-y-0 left-0 rounded-md bg-selected duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] in-data-reordering:invisible"
      />
      {children}
    </div>
  )
}

/**
 * The strip's two measures. How far it can still scroll towards either end,
 * written on it as `--scroll-fade-x-start` and `--scroll-fade-x-end` for its
 * fade, as Base UI's ScrollArea writes its own; and where the selected Tab
 * is, written on the fill as its offset and width. Both are measured again
 * when the strip or a Tab changes size and when a Tab opens, closes or moves,
 * the fade when the strip scrolls too, and the fill when another Tab is
 * selected, the one time it slides there. `ref` still gets the strip.
 */
function useStripMeasures(ref: Ref<HTMLDivElement> | undefined) {
  return useCallback(
    (strip: HTMLDivElement | null) => {
      setRef(ref, strip)
      if (!strip) return
      const measureEdges = () => {
        const end = strip.scrollWidth - strip.clientWidth - strip.scrollLeft
        strip.style.setProperty("--scroll-fade-x-start", `${Math.max(0, strip.scrollLeft)}px`)
        strip.style.setProperty("--scroll-fade-x-end", `${Math.max(0, end)}px`)
      }
      const placeFill = (slide: boolean) => {
        const fill = strip.querySelector<HTMLElement>(':scope > [data-slot="document-tab-fill"]')
        if (!fill) return
        const selected = strip.querySelector<HTMLElement>(':scope > [role="tab"][aria-selected="true"]')
        // Nothing to slide from when it was not showing.
        fill.style.transitionProperty = slide && !fill.hidden ? "transform, width" : "none"
        fill.hidden = !selected
        if (!selected) return
        fill.style.transform = `translateX(${selected.offsetLeft}px)`
        fill.style.width = `${selected.offsetWidth}px`
      }
      const measure = () => {
        measureEdges()
        placeFill(false)
      }
      const resize = new ResizeObserver(measure)
      const observeSizes = () => {
        resize.observe(strip)
        for (const tab of strip.children) resize.observe(tab)
      }
      const tabs = new MutationObserver((changes) => {
        observeSizes()
        measureEdges()
        placeFill(changes.some((change) => change.type === "attributes"))
      })
      observeSizes()
      tabs.observe(strip, { childList: true, subtree: true, attributeFilter: ["aria-selected"] })
      strip.addEventListener("scroll", measureEdges, { passive: true })
      measure()
      return () => {
        strip.removeEventListener("scroll", measureEdges)
        tabs.disconnect()
        resize.disconnect()
        setRef(ref, null)
      }
    },
    [ref]
  )
}

function setRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value)
  else if (ref) ref.current = value
}

// One Tab: 30px, 6px radius, 12px in from either side, and 6px from the right
// under the pointer, where its × then stands. Every Tab is the same width, whatever its name: 180px
// while they fit, all of them narrower together when they do not, down to
// 96px. So the × always comes up in the same place and the row never
// rearranges itself under the pointer. Muted at rest, with the hover fill under the
// pointer; the selected one in the foreground colour, over the strip's fill
// (see DocumentTabList); the 1px focus ring. A `group`, so what it holds (the
// ×) can show on its hover. While one Tab is carried along the strip
// (`data-reordering`) the others glide out of its way, and the carried one
// (`data-dragging`) is drawn over them with the selected fill.
const documentTabVariants = cva(
  "group relative flex h-7.5 w-45 min-w-24 shrink cursor-default items-center gap-1.5 rounded-md px-3 text-sm hover:pr-1.5 whitespace-nowrap text-muted-foreground outline-none not-aria-selected:hover:bg-accent aria-selected:text-foreground focus-visible:focus-ring in-data-reordering:transition-transform in-data-reordering:duration-200 in-data-reordering:ease-[cubic-bezier(0.32,0.72,0,1)] data-dragging:z-10 data-dragging:bg-selected data-dragging:text-foreground"
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

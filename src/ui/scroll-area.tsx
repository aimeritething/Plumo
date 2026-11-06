"use client"

import type * as React from "react"
import { cn } from "@/lib/cn"
import { ScrollArea as ScrollAreaPrimitive } from "radix-ui"

/**
 * The bar's box and its thumb, shared with the one scroller Radix cannot wrap,
 * CodeMirror's (`kernel/raw/raw-scrollbar.ts`). The bar is 12px wide and lies
 * over the content's right edge; the thumb is 6px, 8px under the pointer.
 * Hidden, the bar fades out and lets the pointer through to the content.
 */
export const SCROLLBAR_CLASS =
  "z-raised flex touch-none select-none transition-[opacity,padding] duration-150 ease-out data-[state=hidden]:pointer-events-none data-[state=hidden]:opacity-0 data-[state=hidden]:duration-300"
export const SCROLLBAR_VERTICAL_CLASS = "h-full w-3 px-0.75 py-0.5 hover:px-0.5"
export const SCROLLBAR_HORIZONTAL_CLASS = "h-3 flex-col px-0.5 py-0.75 hover:py-0.5"
export const SCROLL_THUMB_CLASS =
  "relative flex-1 rounded-full bg-scrollbar-thumb transition-colors duration-150 ease-out hover:bg-scrollbar-thumb-hover active:bg-scrollbar-thumb-hover"

type ViewportProps = React.HTMLAttributes<HTMLDivElement> & {
  [attribute: `data-${string}`]: string | undefined
}

/**
 * Plumo's one scrollbar, wherever something scrolls. Radix hides the native
 * bar and draws this one, which shows while the area scrolls or the pointer is
 * on it and fades out after, as macOS's overlay bar does, whatever System
 * Settings says, so every surface has the same bar with a mouse or without.
 *
 * The bar takes no room, so an area whose rows reach its right edge sets the
 * bar into padding it already has (the sidebar's lists: `-mr-3` on the area,
 * `pr-3` on the viewport) rather than let it cover them.
 *
 * The viewport is the element that scrolls: `viewportRef`,
 * `viewportClassName` and `viewportProps` reach it. Radix lays the content out
 * as a table so it can outgrow the viewport sideways; Plumo's lists truncate
 * instead, so the wrapper is a block (a `[&>div]:` class can make it a flex
 * column).
 */
function ScrollArea({
  className,
  children,
  type = "scroll",
  scrollHideDelay = 800,
  viewportRef,
  viewportClassName,
  viewportProps,
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.Root> & {
  viewportRef?: React.Ref<HTMLDivElement>
  viewportClassName?: string
  viewportProps?: ViewportProps
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      type={type}
      scrollHideDelay={scrollHideDelay}
      className={cn("relative flex flex-col", className)}
      {...props}
    >
      {/* The root is a flex column and the viewport its one shrinking item, so a
          `max-h-*` or a shrunk flex height on the root bounds the viewport even
          when nothing above it has a definite height (a content-sized dialog). */}
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        {...viewportProps}
        className={cn(
          "min-h-0 w-full flex-1 rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:focus-ring [&>div]:block!",
          viewportClassName
        )}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      // Kept mounted while hidden so it can fade out instead of vanishing.
      forceMount
      className={cn(
        SCROLLBAR_CLASS,
        orientation === "vertical" && SCROLLBAR_VERTICAL_CLASS,
        orientation === "horizontal" && SCROLLBAR_HORIZONTAL_CLASS,
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className={SCROLL_THUMB_CLASS}
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  )
}

export { ScrollArea, ScrollBar }

"use client"

import type * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"
import { cn } from "@/lib/cn"

/**
 * The bar's box and its thumb, shared with the one scroller Base UI cannot
 * wrap, CodeMirror's (`kernel/raw/raw-scrollbar.ts`). The bar is 12px wide and
 * lies over the content's right edge; the thumb is 6px, 8px under the pointer.
 * The bar shows while the area scrolls (`data-scrolling`, which Base UI clears
 * 500ms after the last scroll), while the pointer is on it and while its thumb
 * is held. Otherwise it fades out 400ms later, as Radix's did 900ms after a
 * scroll, and turns invisible at the end of the fade, so a hidden bar lets the
 * pointer through to the content and cannot be hovered back into view.
 */
export const SCROLLBAR_CLASS =
  "z-raised flex touch-none select-none transition-[opacity,padding,visibility] duration-150 ease-out [&:not([data-scrolling],:hover,:active)]:invisible [&:not([data-scrolling],:hover,:active)]:opacity-0 [&:not([data-scrolling],:hover,:active)]:delay-400 [&:not([data-scrolling],:hover,:active)]:duration-300"
export const SCROLLBAR_VERTICAL_CLASS = "h-full w-3 px-0.75 py-0.5 hover:px-0.5"
export const SCROLLBAR_HORIZONTAL_CLASS = "h-3 flex-col px-0.5 py-0.75 hover:py-0.5"
export const SCROLL_THUMB_CLASS =
  "relative flex-1 rounded-full bg-scrollbar-thumb transition-colors duration-150 ease-out hover:bg-scrollbar-thumb-hover active:bg-scrollbar-thumb-hover"

type ViewportProps = React.HTMLAttributes<HTMLDivElement> & {
  [attribute: `data-${string}`]: string | undefined
}

/**
 * Plumo's one scrollbar, wherever something scrolls. Base UI hides the native
 * bar and draws this one, which shows while the area scrolls or the pointer is
 * on it and fades out after, as macOS's overlay bar does, whatever System
 * Settings says, so every surface has the same bar with a mouse or without.
 *
 * The bar takes no room, so an area whose rows reach its right edge sets the
 * bar into padding it already has (the sidebar's lists: `-mr-3` on the area,
 * `pr-3` on the viewport) rather than let it cover them.
 *
 * The viewport is the element that scrolls: `viewportRef`,
 * `viewportClassName` and `viewportProps` reach it. It scrolls up and down
 * only, as there is no horizontal bar. Its one child is the content, a block
 * that Base UI watches to size the thumb (a `[&>div]:` class can make it a
 * flex column); Base UI lays it out at its content's width so it can outgrow
 * the viewport sideways, but Plumo's lists truncate instead, so it is held to
 * the viewport's width.
 *
 * The content fades out over the top and bottom edges where more of it lies
 * past them (`scroll-fade-y` in index.css), so a list that runs on shows that
 * it does. `fade={false}` leaves it out: the Document, whose text is being
 * written and whose find bar sits in the viewport, and the menus.
 */
function ScrollArea({
  className,
  children,
  viewportRef,
  viewportClassName,
  viewportProps,
  fade = true,
  ...props
}: ScrollAreaPrimitive.Root.Props & {
  fade?: boolean
  viewportRef?: React.Ref<HTMLDivElement>
  viewportClassName?: string
  viewportProps?: ViewportProps
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative flex flex-col", className)}
      {...props}
    >
      {/* The root is a flex column and the viewport its one shrinking item, so a
          `max-h-*` or a shrunk flex height on the root bounds the viewport even
          when nothing above it has a definite height (a content-sized dialog).
          No tab stop of its own, as Radix's had none: Base UI makes a viewport
          that can scroll a tab stop, which would put one between every list's
          rows and the next control. */}
      <ScrollAreaPrimitive.Viewport
        ref={viewportRef}
        data-slot="scroll-area-viewport"
        {...viewportProps}
        tabIndex={viewportProps?.tabIndex}
        style={{ overflowX: "hidden", ...viewportProps?.style }}
        className={cn(
          "min-h-0 w-full flex-1 rounded-[inherit] transition-[color,box-shadow] outline-none focus-visible:focus-ring",
          fade && "scroll-fade-y",
          viewportClassName
        )}
      >
        <ScrollAreaPrimitive.Content
          data-slot="scroll-area-content"
          style={{ minWidth: 0 }}
        >
          {children}
        </ScrollAreaPrimitive.Content>
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
}: ScrollAreaPrimitive.Scrollbar.Props) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        SCROLLBAR_CLASS,
        orientation === "vertical" && SCROLLBAR_VERTICAL_CLASS,
        orientation === "horizontal" && SCROLLBAR_HORIZONTAL_CLASS,
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className={SCROLL_THUMB_CLASS}
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }

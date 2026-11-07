"use client"

import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"
import { Popover as PopoverPrimitive } from "radix-ui"
import { escapeKeyDownHandler } from "./escape"
import { renderAsChild, type RenderProp } from "./render"
import { surfaceVariants } from "./surface"

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger> & RenderProp) {
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      {...renderAsChild(props)}
    />
  )
}

// `compact` is the inset of a popover that holds one small form (a link, an
// alt text): the inputs sit 8px from the edge instead of 16px. `menu` draws
// no card at all: it only places what it holds, a ui/menu-list that is its own
// card (the Slash menu's submenu), so the card is not drawn twice.
const popoverContentVariants = cva(
  "z-popover origin-(--radix-popover-content-transform-origin) outline-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
  {
    variants: {
      variant: {
        default: [surfaceVariants(), "w-72 p-4"],
        compact: [surfaceVariants(), "w-72 p-2"],
        menu: "",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

// `leaveEscapeUnmarked`: for a popover that never holds the focus (one that
// only places a control beside the editor), the Esc that would close it is
// left unmarked for the editor that has the focus (ui/escape).
function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  variant = "default",
  leaveEscapeUnmarked = false,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> &
  VariantProps<typeof popoverContentVariants> & {
    leaveEscapeUnmarked?: boolean
  }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        data-variant={variant}
        className={cn(popoverContentVariants({ variant }), className)}
        onEscapeKeyDown={escapeKeyDownHandler(
          onEscapeKeyDown,
          leaveEscapeUnmarked
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  )
}

/** A box the popover is placed against that is not an element: a line box, a row the caller measures. */
interface PopoverAnchorBox {
  getBoundingClientRect(): DOMRect
}

// `anchor`: the popover is placed against a box the caller measures instead of
// an element (Radix's `virtualRef` now, Base UI's positioner `anchor` later),
// read each time the popover is placed.
function PopoverAnchor({
  anchor,
  ...props
}: Omit<React.ComponentProps<typeof PopoverPrimitive.Anchor>, "virtualRef"> &
  RenderProp & {
    anchor?: React.RefObject<PopoverAnchorBox | null>
  }) {
  return (
    <PopoverPrimitive.Anchor
      data-slot="popover-anchor"
      virtualRef={anchor as React.RefObject<PopoverAnchorBox> | undefined}
      {...renderAsChild(props)}
    />
  )
}

function PopoverHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="popover-header"
      className={cn("flex flex-col gap-1 text-sm", className)}
      {...props}
    />
  )
}

function PopoverTitle({ className, ...props }: React.ComponentProps<"h2">) {
  return (
    <div
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="popover-description"
      className={cn("text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverAnchor,
  PopoverHeader,
  PopoverTitle,
  PopoverDescription,
  type PopoverAnchorBox,
}

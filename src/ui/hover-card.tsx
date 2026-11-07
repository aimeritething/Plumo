"use client"

import type * as React from "react"
import { cn } from "@/lib/cn"
import { escapeKeyDownHandler } from "./escape"
import { surfaceVariants } from "./surface"
import { HoverCard as HoverCardPrimitive } from "radix-ui"

function HoverCard({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Root>) {
  return <HoverCardPrimitive.Root data-slot="hover-card" {...props} />
}

function HoverCardTrigger({
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Trigger>) {
  return (
    <HoverCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  )
}

// `portal={false}` renders the card where it is written instead of at the end
// of the body: a card that belongs to a region (the Outline's, inside the
// editor area) keeps that region's stacking and its data attributes.
function HoverCardContent({
  className,
  align = "center",
  sideOffset = 4,
  portal = true,
  onEscapeKeyDown,
  ...props
}: React.ComponentProps<typeof HoverCardPrimitive.Content> & {
  portal?: boolean
}) {
  const content = (
    <HoverCardPrimitive.Content
      data-slot="hover-card-content"
      align={align}
      sideOffset={sideOffset}
      // A hover card never takes the focus, so the Esc that closes it is
      // left unmarked for the place that has it (ui/escape).
      onEscapeKeyDown={escapeKeyDownHandler(onEscapeKeyDown, true)}
      className={cn(
        surfaceVariants(),
        "z-popover w-64 origin-(--radix-hover-card-content-transform-origin) p-4 outline-hidden data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    />
  )
  return portal ? (
    <HoverCardPrimitive.Portal data-slot="hover-card-portal">
      {content}
    </HoverCardPrimitive.Portal>
  ) : (
    content
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }

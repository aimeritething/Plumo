"use client"

import type * as React from "react"
import { cn } from "@/lib/cn"
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

// A hover card never takes the focus, so the Esc that closes it was pressed
// in whatever has the focus (the editor, under the Outline's card), and is
// that place's too. Radix marks the Esc handled (preventDefault) as it
// dismisses the card, and the editor then ignores it; so the card still
// closes, but the one preventDefault Radix makes for it is dropped.
function leaveEscapeUnmarked(event: KeyboardEvent) {
  event.preventDefault = () => {
    Reflect.deleteProperty(event, "preventDefault")
  }
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
      onEscapeKeyDown={(event) => {
        onEscapeKeyDown?.(event)
        if (!event.defaultPrevented) leaveEscapeUnmarked(event)
      }}
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

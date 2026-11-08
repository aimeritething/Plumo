"use client"

import * as React from "react"
import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card"
import { cn } from "@/lib/cn"
import { escapeOpenChangeHandler } from "./escape"
import { surfaceVariants } from "./surface"

// A hover card never takes the focus, so the Esc that closes it is left
// unmarked for the place that has it (ui/escape).
function HoverCard({ onOpenChange, ...props }: PreviewCardPrimitive.Root.Props) {
  return (
    <PreviewCardPrimitive.Root
      data-slot="hover-card"
      onOpenChange={escapeOpenChangeHandler(onOpenChange, true)}
      {...props}
    />
  )
}

// `delay` and `closeDelay`: how long the pointer rests on the trigger before
// the card opens, and how long after it leaves before the card closes.
function HoverCardTrigger({ ...props }: PreviewCardPrimitive.Trigger.Props) {
  return (
    <PreviewCardPrimitive.Trigger data-slot="hover-card-trigger" {...props} />
  )
}

// Radix's placement: no padding from the window's edge, a flip to the other
// side of the same axis and a shift along it, never an alignment flip.
const HOVER_CARD_COLLISION_AVOIDANCE = { align: "shift", fallbackAxisSide: "none" } as const

// `portal={false}` renders the card where it is written instead of at the end
// of the body: a card that belongs to a region (the Outline's, inside the
// editor area) keeps that region's stacking and its data attributes. Base UI
// always portals, so the card is portaled into a host written in place.
function HoverCardContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  collisionPadding = 0,
  collisionAvoidance = HOVER_CARD_COLLISION_AVOIDANCE,
  portal = true,
  ...props
}: PreviewCardPrimitive.Popup.Props &
  Pick<
    PreviewCardPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "collisionPadding" | "collisionAvoidance"
  > & {
    portal?: boolean
  }) {
  const [host, setHost] = React.useState<HTMLElement | null>(null)
  const content = (
    <PreviewCardPrimitive.Portal
      data-slot="hover-card-portal"
      container={portal ? undefined : host}
    >
      <PreviewCardPrimitive.Positioner
        data-slot="hover-card-positioner"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        collisionAvoidance={collisionAvoidance}
        className="isolate z-popover"
      >
        <PreviewCardPrimitive.Popup
          data-slot="hover-card-content"
          className={cn(
            surfaceVariants(),
            "w-64 origin-(--transform-origin) p-4 outline-hidden data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
            className
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  )
  if (portal) return content
  return (
    <>
      <span ref={setHost} className="contents" data-slot="hover-card-host" />
      {host && content}
    </>
  )
}

export { HoverCard, HoverCardTrigger, HoverCardContent }

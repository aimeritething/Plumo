"use client"

import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"
import { escapeOpenChangeHandler } from "./escape"
import { surfaceVariants } from "./surface"

/** A box the popover is placed against that is not an element: a line box, a row the caller measures. */
interface PopoverAnchorBox {
  getBoundingClientRect(): DOMRect
}

// What a PopoverAnchor and the content's `leaveEscapeUnmarked` tell the Root:
// Base UI has no Anchor part, its Positioner takes the anchor instead, and its
// Esc is handled on the Root.
interface PopoverContextValue {
  anchorElement: Element | null
  setAnchorElement: (element: Element | null) => void
  anchorBox: PopoverAnchorBox | null
  setAnchorBox: (box: PopoverAnchorBox | null) => void
  setEscapeUnmarked: (unmarked: boolean) => void
}

const PopoverContext = React.createContext<PopoverContextValue | null>(null)

function usePopoverContext(part: string): PopoverContextValue {
  const context = React.useContext(PopoverContext)
  if (!context) throw new Error(`${part} must be used within a Popover`)
  return context
}

function Popover({ onOpenChange, ...props }: PopoverPrimitive.Root.Props) {
  const [anchorElement, setAnchorElement] = React.useState<Element | null>(null)
  const [anchorBox, setAnchorBox] = React.useState<PopoverAnchorBox | null>(null)
  const escapeUnmarkedRef = React.useRef(false)
  const setEscapeUnmarked = React.useCallback((unmarked: boolean) => {
    escapeUnmarkedRef.current = unmarked
  }, [])
  const context = React.useMemo(
    () => ({ anchorElement, setAnchorElement, anchorBox, setAnchorBox, setEscapeUnmarked }),
    [anchorElement, anchorBox, setEscapeUnmarked]
  )
  return (
    <PopoverContext.Provider value={context}>
      <PopoverPrimitive.Root
        data-slot="popover"
        // Always a handler, so a popover with no onOpenChange of its own (one
        // open for as long as it is shown) still leaves its Esc unmarked when
        // its content asks (`leaveEscapeUnmarked`).
        onOpenChange={(open, details) => {
          escapeOpenChangeHandler(onOpenChange, escapeUnmarkedRef.current)(open, details)
        }}
        {...props}
      />
    </PopoverContext.Provider>
  )
}

function PopoverTrigger({ ...props }: PopoverPrimitive.Trigger.Props) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

// `compact` is the inset of a popover that holds one small form (a link, an
// alt text): the inputs sit 8px from the edge instead of 16px. `menu` draws
// no card at all: it only places what it holds, a ui/menu-list that is its own
// card (the Slash menu's submenu), so the card is not drawn twice.
const popoverContentVariants = cva(
  "origin-(--transform-origin) outline-hidden data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
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

// Radix's placement, which Plumo's popovers were laid out with: no padding
// from the boundary's edge, a flip to the other side of the same axis and a
// shift along it, never an alignment flip.
const POPOVER_COLLISION_AVOIDANCE = { align: "shift", fallbackAxisSide: "none" } as const

// `leaveEscapeUnmarked`: for a popover that never holds the focus (one that
// only places a control beside the editor), the Esc that would close it is
// left unmarked for the editor that has the focus (ui/escape).
function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  collisionPadding = 0,
  collisionBoundary,
  collisionAvoidance = POPOVER_COLLISION_AVOIDANCE,
  sticky,
  positionMethod,
  variant = "default",
  leaveEscapeUnmarked = false,
  ...props
}: PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    | "align"
    | "alignOffset"
    | "side"
    | "sideOffset"
    | "collisionPadding"
    | "collisionBoundary"
    | "collisionAvoidance"
    | "sticky"
    | "positionMethod"
  > &
  VariantProps<typeof popoverContentVariants> & {
    leaveEscapeUnmarked?: boolean
  }) {
  const { anchorElement, anchorBox, setEscapeUnmarked } = usePopoverContext("PopoverContent")
  React.useLayoutEffect(() => {
    setEscapeUnmarked(leaveEscapeUnmarked)
  }, [leaveEscapeUnmarked, setEscapeUnmarked])
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Positioner
        data-slot="popover-positioner"
        anchor={anchorBox ?? anchorElement ?? undefined}
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        collisionBoundary={collisionBoundary}
        collisionAvoidance={collisionAvoidance}
        sticky={sticky}
        positionMethod={positionMethod}
        className="isolate z-popover"
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          data-variant={variant}
          className={cn(popoverContentVariants({ variant }), className)}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )
}

// What the popover is placed against when it is not its trigger. `anchor`: a
// box the caller measures instead of an element, its rect read each time the
// popover is placed; nothing is drawn. A new ref (the caller measured a new
// box) is a new anchor, so the popover is placed again. Otherwise the element
// drawn (`render`, a `div` by default) is the anchor.
function PopoverAnchor({
  anchor,
  render,
  ...props
}: useRender.ComponentProps<"div"> & {
  anchor?: React.RefObject<PopoverAnchorBox | null>
}) {
  const { setAnchorElement, setAnchorBox } = usePopoverContext("PopoverAnchor")
  React.useLayoutEffect(() => {
    if (!anchor) return
    setAnchorBox(anchor.current)
    return () => setAnchorBox(null)
  }, [anchor, setAnchorBox])
  const element = useRender({
    defaultTagName: "div",
    render,
    ref: anchor ? undefined : setAnchorElement,
    props: mergeProps<"div">({}, props),
    state: { slot: "popover-anchor" },
  })
  return anchor ? null : element
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

function PopoverTitle({ className, ...props }: PopoverPrimitive.Title.Props) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn("font-medium", className)}
      {...props}
    />
  )
}

function PopoverDescription({
  className,
  ...props
}: PopoverPrimitive.Description.Props) {
  return (
    <PopoverPrimitive.Description
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

"use client"

import { Component, type ReactNode } from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import { cn } from "@/lib/cn"

import { escapeOpenChangeHandler } from "./escape"
import { Kbd } from "./kbd"
import { markRecoveredTooltipError } from "./tooltip-recovery"

// 400ms before a tooltip shows, so a pointer passing over a row of icons does
// not flash one per icon; a hover that pauses is asking. Within 300ms of one
// closing, the move to a neighbouring icon is instant.
function TooltipProvider({
  delay = 400,
  timeout = 300,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      timeout={timeout}
      {...props}
    />
  )
}

// The one Provider sits in main.tsx, so tooltips share its delays; a Tooltip
// does not wrap its own. A tooltip never takes the focus, so the Esc that
// hides it is left to the place that has it (ui/escape).
function Tooltip({ onOpenChange, ...props }: TooltipPrimitive.Root.Props) {
  return (
    <TooltipPrimitive.Root
      data-slot="tooltip"
      onOpenChange={escapeOpenChangeHandler(onOpenChange, true)}
      {...props}
    />
  )
}

function TooltipTrigger({ ...props }: TooltipPrimitive.Trigger.Props) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

// The tooltip's content can throw when BlockNote unmounts its trigger
// mid-render; the boundary drops the content and keeps the trigger mounted.
class TooltipBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    markRecoveredTooltipError(error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

// Radix's placement: no padding from the window's edge, a flip to the other
// side of the same axis and a shift along it, never an alignment flip.
const TOOLTIP_COLLISION_AVOIDANCE = { align: "shift", fallbackAxisSide: "none" } as const

// `role="tooltip"`: Base UI's popup has no role of its own; the label is one.
function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  collisionPadding = 0,
  collisionAvoidance = TOOLTIP_COLLISION_AVOIDANCE,
  shortcut,
  children,
  ...props
}: TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "collisionPadding" | "collisionAvoidance"
  > & {
    /** Drawn after the label as one `Kbd` chip per key: `⌘⇧,` is three. */
    shortcut?: string
  }) {
  return (
    <TooltipBoundary>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner
          data-slot="tooltip-positioner"
          align={align}
          alignOffset={alignOffset}
          side={side}
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          collisionAvoidance={collisionAvoidance}
          className="isolate z-popover"
        >
          <TooltipPrimitive.Popup
            data-slot="tooltip-content"
            role="tooltip"
            className={cn(
              "flex w-fit items-center gap-2 origin-(--transform-origin) rounded-lg border-hairline border-border bg-popover px-2 py-[5px] text-2xs font-medium text-balance text-foreground shadow-md",
              // Only a tooltip that waited animates in, 100ms from its trigger; one
              // reached from a neighbour within the timeout, or shown on focus
              // (`data-instant`), is instant, and none animates out.
              "data-open:not-data-instant:animate-in data-open:not-data-instant:fade-in-0 data-open:not-data-instant:zoom-in-95 duration-100",
              className
            )}
            {...props}
          >
            {children}
            {/* The space keeps the text reading `label shortcut`; flex never draws it. */}
            {shortcut && (
              <>
                {" "}
                <span className="flex gap-1">
                  {Array.from(shortcut).map((key, index) => <Kbd key={index}>{key}</Kbd>)}
                </span>
              </>
            )}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipBoundary>
  )
}

/**
 * The common tooltip: one trigger, a label, an optional shortcut and side.
 * Props a parent trigger hands down (a menu, popover or dialog trigger whose
 * `render` is this) go on to the trigger, so that parent's handlers, ref and
 * open state reach the button underneath. A child with an on / off state of
 * its own (`Toggle`, `ToggleGroupItem`, a pressed `ToolbarButton`) keeps it:
 * its look reads `aria-pressed`, which the tooltip never writes.
 */
function SimpleTooltip({
  label,
  shortcut,
  side,
  children,
  ...triggerProps
}: Omit<TooltipPrimitive.Trigger.Props, "render" | "children"> & {
  label: ReactNode
  shortcut?: string
  side?: TooltipPrimitive.Positioner.Props["side"]
  children: TooltipPrimitive.Trigger.Props["render"]
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} {...triggerProps} />
      <TooltipContent side={side} shortcut={shortcut}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider, SimpleTooltip }

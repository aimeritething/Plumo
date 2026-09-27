"use client"

import { Component, type ComponentProps, type ReactNode } from "react"
import { cn } from "@/lib/cn"
import { Tooltip as TooltipPrimitive } from "radix-ui"

import { Kbd } from "./kbd"
import { markRecoveredTooltipError } from "./tooltip-recovery"

// 400ms before a tooltip shows, so a pointer passing over a row of icons does
// not flash one per icon; a hover that pauses is asking. Radix's skip delay
// (300ms) keeps the move to a neighbouring icon instant.
function TooltipProvider({
  delayDuration = 400,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

// The one Provider sits in main.tsx, so tooltips share its skip delay; a
// Tooltip does not wrap its own.
function Tooltip({
  ...props
}: ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

function TooltipTrigger({
  ...props
}: ComponentProps<typeof TooltipPrimitive.Trigger>) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

// Radix's tooltip content can throw when BlockNote unmounts its trigger
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

function TooltipContent({
  className,
  sideOffset = 4,
  shortcut,
  children,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content> & {
  /** Drawn after the label as one `Kbd` chip per key: `⌘⇧,` is three. */
  shortcut?: string
}) {
  return (
    <TooltipBoundary>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          data-slot="tooltip-content"
          sideOffset={sideOffset}
          className={cn(
            "z-popover flex w-fit items-center gap-2 origin-(--radix-tooltip-content-transform-origin) rounded-lg border-hairline border-border-popover bg-surface-popover px-2 py-[5px] text-2xs font-medium text-balance text-text-primary shadow-menu",
            // Only a tooltip that waited animates in, 100ms from its trigger; one
            // reached from a neighbour within the skip delay (`instant-open`) is
            // instant, and none animates out.
            "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 duration-100",
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
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipBoundary>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }

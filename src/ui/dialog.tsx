"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"
import { X as XIcon } from "@phosphor-icons/react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { Button } from "./button"
import { surfaceVariants } from "./surface"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-overlay bg-overlay data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

// default is the prompt: centred, on the popover surface. bare is the same
// centring with no panel at all (a lightbox). panel is the same centring on
// the popover surface, unpadded, no close button: what it holds lays out its
// own panes side by side (Settings) and sizes the dialog. palette hangs from
// 24% down, unpadded, no close button; what it holds lays itself out as a
// column.
const dialogContentVariants = cva(
  "fixed left-[50%] z-popover grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] gap-4 outline-none data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
  {
    variants: {
      variant: {
        default: [
          surfaceVariants({ elevation: "dialog" }),
          "top-[50%] translate-y-[-50%] p-6 sm:max-w-lg",
        ],
        bare: "top-[50%] w-auto translate-y-[-50%]",
        panel: [
          surfaceVariants({ elevation: "dialog" }),
          "top-[50%] flex translate-y-[-50%] gap-0 overflow-hidden p-0",
        ],
        palette: [
          surfaceVariants({ elevation: "dialog" }),
          "top-[24%] flex flex-col gap-0 p-0",
        ],
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const TABBABLE =
  'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), a[href], [contenteditable="true"], [tabindex]:not([tabindex="-1"])'

// While the dialog is open, focus that something behind it moves to the
// page it covers (an editor taking the focus as its Document finishes
// loading) goes back into the dialog, as Radix's focus trap did: Base UI's
// trap holds Tab, not a programmatic focus, and the keys typed next would
// land in the page. It goes back where it was in the dialog, or where the
// dialog puts it first. A popup opened from the dialog is not behind it.
function useFocusHeldInDialog(
  popup: HTMLElement | null,
  initialFocus: DialogPrimitive.Popup.Props["initialFocus"]
) {
  const initialFocusRef = React.useRef(initialFocus)
  React.useEffect(() => {
    initialFocusRef.current = initialFocus
  }, [initialFocus])
  React.useEffect(() => {
    if (!popup) return
    const doc = popup.ownerDocument
    let lastInside: HTMLElement | null = null
    const firstTarget = (): HTMLElement => {
      const initial = initialFocusRef.current
      if (initial && typeof initial === "object" && initial.current) return initial.current
      if (initial === false) return popup
      return popup.querySelector<HTMLElement>(TABBABLE) ?? popup
    }
    const onFocusIn = (event: FocusEvent) => {
      const target = event.target
      if (!(target instanceof HTMLElement)) return
      if (popup.contains(target)) {
        if (target !== popup) lastInside = target
        return
      }
      // Base UI marks what the open dialog covers; not during its exit. Its
      // focus guards sit outside the popup too, and Tab through one is the
      // trap wrapping the focus round, not the page taking it.
      if (!popup.hasAttribute("data-open") || !target.closest("[data-base-ui-inert]")) return
      if (target.hasAttribute("data-base-ui-focus-guard")) return
      ;(lastInside?.isConnected ? lastInside : firstTarget()).focus({ preventScroll: true })
    }
    doc.addEventListener("focusin", onFocusIn)
    return () => doc.removeEventListener("focusin", onFocusIn)
  }, [popup])
}

function DialogContent({
  className,
  children,
  variant = "default",
  showCloseButton = variant === "default",
  ref,
  initialFocus,
  ...props
}: DialogPrimitive.Popup.Props &
  VariantProps<typeof dialogContentVariants> & {
    showCloseButton?: boolean
  }) {
  const [popup, setPopup] = React.useState<HTMLDivElement | null>(null)
  useFocusHeldInDialog(popup, initialFocus)
  const setRefs = React.useCallback((node: HTMLDivElement | null) => {
    setPopup(node)
    if (typeof ref === "function") ref(node)
    else if (ref) ref.current = node
  }, [ref])
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Popup
        ref={setRefs}
        initialFocus={initialFocus}
        data-slot="dialog-content"
        data-variant={variant}
        className={cn(dialogContentVariants({ variant }), className)}
        {...props}
      >
        {children}
        {showCloseButton && (
          <Tooltip>
            <TooltipTrigger
              render={(
                <DialogPrimitive.Close
                  data-slot="dialog-close"
                  render={<Button variant="icon" size="icon-xs" className="absolute top-3 right-3" aria-label="Close" />}
                >
                  <XIcon />
                </DialogPrimitive.Close>
              )}
            />
            <TooltipContent side="bottom">Close</TooltipContent>
          </Tooltip>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn("flex flex-col gap-2 text-center sm:text-left", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-lg leading-none font-semibold", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

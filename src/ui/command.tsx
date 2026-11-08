"use client"

// shadcn's Command, on cmdk, with Plumo's palette look under shadcn's names.
// Its one user is the Command Menu (and Quick Open, its search-only mode):
// - `CommandDialog` is the `palette` dialog, hanging from 24% down and 560px
//   wide, with no close button: esc and a click outside close it. The title
//   and description sit inside the dialog's content, not beside it as
//   shadcn's do, so nothing of a closed palette stays in the page.
//   `contentProps` and `commandProps` reach the dialog's content and the cmdk
//   root, which shadcn's `CommandDialog` gives no way to.
// - the input row is 56px with no magnifier; the placeholder says what the
//   palette searches.
// - the list scrolls in Plumo's `ScrollArea`, 400px at most, and pads itself
//   once, so a group adds no padding of its own.
// - a row is 40px; the highlighted one takes the hover fill, since the
//   keyboard's highlight and the pointer's are the same highlight here.
// - a shortcut is plain text in the menu sub-theme's Inter 11/500, as the
//   menus write theirs (`DropdownMenuShortcut`).

import type * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { cn } from "@/lib/cn"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./dialog"
import { ScrollArea } from "./scroll-area"

type DataAttributes = {
  [attribute: `data-${string}`]: string | undefined
}

function Command({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex h-full min-h-0 w-full flex-col overflow-hidden rounded-md bg-popover text-popover-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  contentProps,
  commandProps,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  children?: React.ReactNode
  title?: string
  description?: string
  className?: string
  showCloseButton?: boolean
  contentProps?: Omit<
    React.ComponentProps<typeof DialogContent>,
    "children" | "className" | "variant" | "showCloseButton"
  > &
    DataAttributes
  commandProps?: Omit<React.ComponentProps<typeof Command>, "children">
}) {
  return (
    <Dialog {...props}>
      <DialogContent
        variant="palette"
        className={cn(
          "max-h-[calc(76%-24px)] w-140 max-w-[calc(100vw-32px)] overflow-hidden",
          className
        )}
        showCloseButton={showCloseButton}
        {...contentProps}
      >
        <DialogHeader className="sr-only">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Command
          {...commandProps}
          className={cn("flex-auto rounded-none", commandProps?.className)}
        >
          {children}
        </Command>
      </DialogContent>
    </Dialog>
  )
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div
      data-slot="command-input-wrapper"
      className="flex h-14 flex-none items-center border-b-hairline border-border"
    >
      <CommandPrimitive.Input
        data-slot="command-input"
        className={cn(
          // 17px light with a touch of negative tracking: the palette's one display size, outside the four-tier UI scale.
          "flex h-full w-full bg-transparent px-5 text-[17px] font-light tracking-[-0.01em] text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        {...props}
      />
    </div>
  )
}

// cmdk names its listbox from its own `label` prop (default "Suggestions")
// and writes that over any `aria-label`, so a caller's `aria-label` is passed
// on as the `label`.
function CommandList({
  className,
  label,
  "aria-label": ariaLabel,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List>) {
  return (
    <ScrollArea className="max-h-100 min-h-0 flex-auto">
      <CommandPrimitive.List
        data-slot="command-list"
        className={cn("scroll-py-1.5 p-1.5", className)}
        label={label ?? ariaLabel}
        {...props}
      />
    </ScrollArea>
  )
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn(
        "flex h-10 items-center px-2.5 text-sm text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden text-foreground [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1.5 my-1.5 h-(--hairline) bg-border", className)}
      {...props}
    />
  )
}

function CommandItem({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "relative flex h-10 cursor-default items-center gap-2.5 rounded-lg px-2.5 text-sm whitespace-nowrap outline-none select-none data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-45 data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:text-muted-foreground data-[selected=true]:[&_svg]:text-foreground [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function CommandShortcut({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto flex-none font-sans text-2xs font-medium text-subtle-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
}

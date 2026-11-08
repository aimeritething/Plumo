"use client"

// shadcn's ToggleGroup, with Plumo's three single-choice looks beside shadcn's
// default and outline: `segmented` is the Rich | Raw pill track, `card` the
// Theme setting's pictures and `swatch` the Primary color's dots. A look is
// set on the group and its items take it from the context, as shadcn's
// variant and size are. Base UI's composite gives the group one tab stop and
// moves the focus with the arrows, wrapping; Space or Enter chooses. A group
// holds an array of the chosen values, one at most unless it is `multiple`,
// and an item that is chosen has `aria-pressed`.

import * as React from "react"
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"

import { toggleVariants } from "@/ui/toggle"

const toggleGroupVariants = cva(
  "group/toggle-group flex w-fit items-center gap-[--spacing(var(--gap))] rounded-md data-[spacing=default]:data-[variant=outline]:shadow-xs",
  {
    variants: {
      variant: {
        default: "",
        outline: "",
        segmented: "h-6.5 flex-none gap-0.5 rounded-full bg-muted p-0.5",
        card: "w-full gap-4 max-[760px]:gap-3",
        swatch: "flex-wrap gap-3",
      },
    },
  }
)

// Each look's item. A segment is an icon on the track, the current one a
// raised pill; one that cannot be chosen fades but keeps the pointer, for its
// tooltip. A card is a picture over its name, the current name in the
// foreground. A swatch is a dot. Card and swatch draw their picture with
// `ToggleGroupItemPreview`.
const toggleGroupItemLookVariants = cva("", {
  variants: {
    variant: {
      segmented:
        "grid h-5.5 w-7 place-items-center rounded-full text-muted-foreground transition-colors duration-150 ease-out outline-none focus-visible:focus-ring aria-pressed:bg-popover aria-pressed:text-foreground aria-pressed:shadow-xs aria-disabled:text-subtle-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
      card: "group/toggle-group-item flex min-w-0 flex-1 cursor-default flex-col gap-2 text-left text-xs text-muted-foreground outline-none aria-pressed:font-medium aria-pressed:text-foreground",
      swatch:
        "group/toggle-group-item relative size-6 flex-none cursor-default rounded-full outline-none",
    },
  },
})

// The selection ring, one recipe for a card's picture and a swatch's dot: 2px,
// set 2px off the popover, in `--selection-ring` (the foreground for a card,
// the swatch's own colour for a swatch). The keyboard focus draws the same
// ring in the focus colour on an item that is not chosen. It sits on the
// picture, not the item, so a card's name stays outside it.
const toggleGroupItemPreviewVariants = cva(
  "block group-focus-visible/toggle-group-item:ring-2 group-focus-visible/toggle-group-item:ring-ring group-focus-visible/toggle-group-item:ring-offset-2 group-focus-visible/toggle-group-item:ring-offset-popover group-aria-pressed/toggle-group-item:ring-2 group-aria-pressed/toggle-group-item:ring-(--selection-ring) group-aria-pressed/toggle-group-item:ring-offset-2 group-aria-pressed/toggle-group-item:ring-offset-popover",
  {
    variants: {
      variant: {
        card: "relative w-full overflow-hidden rounded-lg ring-1 ring-border [--selection-ring:var(--foreground)]",
        // `--swatch` is the dot's paint, a colour or a gradient.
        swatch:
          "size-full rounded-full inset-ring inset-ring-black/10 [background:var(--swatch)] [--selection-ring:var(--swatch)]",
      },
    },
  }
)

type ToggleGroupVariant = NonNullable<
  VariantProps<typeof toggleGroupVariants>["variant"]
>
type ToggleGroupLook = Exclude<ToggleGroupVariant, "default" | "outline">

const isLook = (
  variant: ToggleGroupVariant | null | undefined
): variant is ToggleGroupLook =>
  variant === "segmented" || variant === "card" || variant === "swatch"

const ToggleGroupContext = React.createContext<
  Omit<VariantProps<typeof toggleVariants>, "variant"> & {
    variant?: ToggleGroupVariant | null
    spacing?: number
  }
>({
  size: "default",
  variant: "default",
  spacing: 0,
})

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  children,
  ...props
}: ToggleGroupPrimitive.Props &
  Omit<VariantProps<typeof toggleVariants>, "variant"> & {
    variant?: ToggleGroupVariant | null
    spacing?: number
  }) {
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(toggleGroupVariants({ variant }), className)}
      {...props}
    >
      <ToggleGroupContext.Provider value={{ variant, size, spacing }}>
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  )
}

function ToggleGroupItem({
  className,
  children,
  variant,
  size,
  ...props
}: TogglePrimitive.Props &
  Omit<VariantProps<typeof toggleVariants>, "variant"> & {
    variant?: ToggleGroupVariant | null
  }) {
  const context = React.useContext(ToggleGroupContext)
  const itemVariant = context.variant || variant

  return (
    <TogglePrimitive
      data-slot="toggle-group-item"
      data-variant={itemVariant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        isLook(itemVariant)
          ? toggleGroupItemLookVariants({ variant: itemVariant })
          : [
              toggleVariants({
                variant: itemVariant,
                size: context.size || size,
              }),
              "w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10",
              "data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l",
            ],
        className
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  )
}

// The picture inside a `card` or `swatch` item, which wears the selection
// ring. shadcn's ToggleGroup has no picture items; this is Plumo's.
function ToggleGroupItemPreview({
  className,
  ...props
}: React.ComponentProps<"span">) {
  const { variant } = React.useContext(ToggleGroupContext)
  return (
    <span
      data-slot="toggle-group-item-preview"
      className={cn(
        toggleGroupItemPreviewVariants({
          variant: variant === "card" || variant === "swatch" ? variant : null,
        }),
        className
      )}
      {...props}
    />
  )
}

export { ToggleGroup, ToggleGroupItem, ToggleGroupItemPreview }

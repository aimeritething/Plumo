import type * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"
import { Toolbar as ToolbarPrimitive } from "radix-ui"

// A row of icon buttons on a card, Notion's toolbar: one tab stop, the arrow
// keys move between the buttons (Radix Toolbar). Two cards:
// - raised: the card a toolbar sits on over the thing it acts on (a picture,
//   a code block, a board), the popover surface and the raised shadow;
// - floating: a toolbar that floats over the text, the menu material (the
//   popover hairline and the menu shadow), at the same radius and density.
// `className` places the toolbar (position, visibility); its look is the variant's.
const toolbarVariants = cva(
  "flex w-fit items-center gap-0.5 rounded-lg bg-popover p-0.5 text-foreground",
  {
    variants: {
      variant: {
        raised: "shadow-xs",
        floating: "border-hairline border-border shadow-md",
      },
    },
    defaultVariants: {
      variant: "raised",
    },
  }
)

function Toolbar({
  className,
  variant,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Root> &
  VariantProps<typeof toolbarVariants>) {
  return (
    <ToolbarPrimitive.Root
      data-slot="toolbar"
      data-variant={variant ?? "raised"}
      className={cn(toolbarVariants({ variant, className }))}
      {...props}
    />
  )
}

// The toolbar's button: an icon, or an icon and a label. Secondary text at
// rest; hover and an open menu take the tertiary-hover fill and the primary
// colour; pressed (a style that is on) the selected fill; disabled goes muted
// without fading. Sizes: default 28px (the floating toolbars), sm 24px (a
// toolbar on a Block). `segment` joins two buttons into one control, the
// second a narrow caret (a toggle and its menu).
const toolbarButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1 rounded-md text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground focus-visible:focus-ring disabled:pointer-events-none disabled:text-subtle-foreground data-[state=on]:bg-selected data-[state=on]:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      size: {
        default: "h-7 min-w-7 px-1.5",
        sm: "size-6",
      },
      segment: {
        none: "",
        start: "rounded-e-none",
        end: "w-4.5 min-w-4.5 rounded-s-none px-0 [&_svg:not([class*='size-'])]:size-3",
      },
    },
    defaultVariants: {
      size: "default",
      segment: "none",
    },
  }
)

function ToolbarButton({
  className,
  size,
  segment,
  pressed,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Button> &
  VariantProps<typeof toolbarButtonVariants> & {
    /** A toggle: `aria-pressed` and the on / off state. Left out, a plain button. */
    pressed?: boolean
  }) {
  return (
    <ToolbarPrimitive.Button
      data-slot="toolbar-button"
      className={cn(toolbarButtonVariants({ size, segment, className }))}
      {...props}
      // After the props: a tooltip trigger around the button writes its own
      // open / closed data-state, which must not hide a toggle's on / off.
      {...(pressed === undefined
        ? {}
        : { "aria-pressed": pressed, "data-state": pressed ? "on" : "off" })}
    />
  )
}

// A hairline between two groups of buttons.
function ToolbarSeparator({
  className,
  ...props
}: React.ComponentProps<typeof ToolbarPrimitive.Separator>) {
  return (
    <ToolbarPrimitive.Separator
      data-slot="toolbar-separator"
      className={cn("mx-0.5 h-4 w-(--hairline) shrink-0 bg-border", className)}
      {...props}
    />
  )
}

// A group of buttons, after a hairline when a group with buttons comes before
// it. A group whose buttons all render nothing takes no room and draws no
// hairline, so a toolbar can list every group and let each button decide
// whether it shows.
function ToolbarGroup({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      role="group"
      data-slot="toolbar-group"
      className={cn("flex items-center gap-0.5 [&:not(:has(button))]:hidden", className)}
      {...props}
    >
      <ToolbarSeparator className="hidden [[data-slot=toolbar-group]:has(button)~[data-slot=toolbar-group]>&]:block" />
      {children}
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components -- shadcn/ui pattern
export { Toolbar, ToolbarButton, ToolbarGroup, ToolbarSeparator, toolbarVariants, toolbarButtonVariants }

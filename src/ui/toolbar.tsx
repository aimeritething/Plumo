import type * as React from "react"
import { Toolbar as ToolbarPrimitive } from "@base-ui/react/toolbar"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/cn"

// A row of icon buttons on a card, Notion's toolbar: one tab stop, the arrow
// keys move between the buttons, wrapping (Base UI Toolbar). Two cards:
// - raised: the card a toolbar sits on over the thing it acts on (a picture,
//   a code block, a board), the popover surface and the raised shadow;
// - floating: a toolbar that floats over the text, the menu material (the
//   popover hairline and the menu shadow), at the same radius and density.
// `reveal` keeps a toolbar laid over a Block (an HTML block, a diagram) out of
// sight until the pointer is over the Block or the focus is in it: the Block's
// root is the `group`. A device that cannot hover always shows it.
// `className` places the toolbar; its look and visibility are the variants'.
const toolbarVariants = cva(
  "flex w-fit items-center gap-0.5 rounded-lg bg-popover p-0.5 text-foreground",
  {
    variants: {
      variant: {
        raised: "shadow-xs",
        floating: "border-hairline border-border shadow-md",
      },
      reveal: {
        true: "opacity-0 transition-opacity duration-150 ease-out group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100",
        false: "",
      },
    },
    defaultVariants: {
      variant: "raised",
      reveal: false,
    },
  }
)

function Toolbar({
  className,
  variant,
  reveal,
  onKeyDown,
  onFocus,
  ...props
}: ToolbarPrimitive.Root.Props & VariantProps<typeof toolbarVariants>) {
  return (
    <ToolbarPrimitive.Root
      data-slot="toolbar"
      data-variant={variant ?? "raised"}
      className={cn(toolbarVariants({ variant, reveal, className }))}
      // A menu or popover a button opens (the link field, the block type
      // menu) sits elsewhere in the page but inside the toolbar in React's
      // tree, so its keys and focus reach the toolbar too. They are the
      // popup's: an arrow at the field's edge does not move along the
      // toolbar, and focusing the field does not select its text.
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (!event.currentTarget.contains(event.target as Node)) event.preventBaseUIHandler()
      }}
      onFocus={(event) => {
        onFocus?.(event)
        if (!event.currentTarget.contains(event.target as Node)) event.preventBaseUIHandler()
      }}
      {...props}
    />
  )
}

// The toolbar's button: an icon, or an icon and a label. Secondary text at
// rest; hover and an open menu take the tertiary-hover fill and the primary
// colour; pressed (a style that is on, `aria-pressed`) the selected fill;
// disabled goes muted without fading. An open menu or popover is read off
// `aria-expanded`, which their triggers set. Sizes: default 28px (the floating toolbars), sm 24px (a
// toolbar on a Block). `segment` joins two buttons into one control, the
// second a narrow caret (a toggle and its menu).
const toolbarButtonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1 rounded-md text-sm font-medium whitespace-nowrap text-muted-foreground outline-none transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground focus-visible:focus-ring disabled:pointer-events-none disabled:text-subtle-foreground aria-pressed:bg-selected aria-pressed:text-foreground aria-expanded:bg-accent aria-expanded:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
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

// A disabled button is natively disabled, so it leaves the Tab order and the
// arrows skip it, as Radix's did; Base UI's default keeps it focusable.
function ToolbarButton({
  className,
  size,
  segment,
  pressed,
  focusableWhenDisabled = false,
  ...props
}: ToolbarPrimitive.Button.Props &
  VariantProps<typeof toolbarButtonVariants> & {
    /** A toggle: its on / off state as `aria-pressed`. Left out, a plain button. */
    pressed?: boolean
  }) {
  return (
    <ToolbarPrimitive.Button
      data-slot="toolbar-button"
      aria-pressed={pressed}
      focusableWhenDisabled={focusableWhenDisabled}
      className={cn(toolbarButtonVariants({ size, segment, className }))}
      {...props}
    />
  )
}

// A hairline between two groups of buttons.
function ToolbarSeparator({
  className,
  ...props
}: ToolbarPrimitive.Separator.Props) {
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

"use client"

// shadcn's ToggleGroup. Base UI's composite gives the group one tab stop and
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
      },
    },
  }
)

type ToggleGroupVariant = NonNullable<
  VariantProps<typeof toggleGroupVariants>["variant"]
>

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

// Tab into a single-choice group lands on the chosen item, as Radix's did;
// Base UI's tab stop is the item the focus last left, the first at the start.
// A press is left alone (the focus goes to the item pressed), and so is the
// focus the arrows move within the group: the group still holds it when the
// next item takes it.
function useTabLandsOnChosenItem(
  multiple: boolean | undefined,
  {
    onFocus,
    onBlur,
    onPointerDown,
  }: Pick<ToggleGroupPrimitive.Props, "onFocus" | "onBlur" | "onPointerDown">
) {
  const pressedRef = React.useRef(false)
  const holdsFocusRef = React.useRef(false)
  return {
    onPointerDown: (event: Parameters<NonNullable<typeof onPointerDown>>[0]) => {
      onPointerDown?.(event)
      pressedRef.current = true
      setTimeout(() => { pressedRef.current = false })
    },
    onBlur: (event: Parameters<NonNullable<typeof onBlur>>[0]) => {
      onBlur?.(event)
      const group = event.currentTarget
      setTimeout(() => {
        holdsFocusRef.current = group.contains(group.ownerDocument.activeElement)
      })
    },
    onFocus: (event: Parameters<NonNullable<typeof onFocus>>[0]) => {
      onFocus?.(event)
      const group = event.currentTarget
      const fromInside = holdsFocusRef.current || group.contains(event.relatedTarget as Node | null)
      const fromPress = pressedRef.current
      holdsFocusRef.current = true
      pressedRef.current = false
      if (multiple || fromPress || fromInside) return
      const chosen = group.querySelector<HTMLElement>(
        '[data-slot="toggle-group-item"][aria-pressed="true"]:not(:disabled)'
      )
      if (chosen && chosen !== event.target) chosen.focus()
    },
  }
}

function ToggleGroup({
  className,
  variant,
  size,
  spacing = 0,
  children,
  onFocus,
  onBlur,
  onPointerDown,
  ...props
}: ToggleGroupPrimitive.Props &
  Omit<VariantProps<typeof toggleVariants>, "variant"> & {
    variant?: ToggleGroupVariant | null
    spacing?: number
  }) {
  const focusHandlers = useTabLandsOnChosenItem(props.multiple, { onFocus, onBlur, onPointerDown })
  return (
    <ToggleGroupPrimitive
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(toggleGroupVariants({ variant }), className)}
      {...focusHandlers}
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
        toggleVariants({
          variant: itemVariant,
          size: context.size || size,
        }),
        "w-auto min-w-0 shrink-0 px-3 focus:z-10 focus-visible:z-10",
        "data-[spacing=0]:rounded-none data-[spacing=0]:shadow-none data-[spacing=0]:first:rounded-l-md data-[spacing=0]:last:rounded-r-md data-[spacing=0]:data-[variant=outline]:border-l-0 data-[spacing=0]:data-[variant=outline]:first:border-l",
        className
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  )
}

export { ToggleGroup, ToggleGroupItem }

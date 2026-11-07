import { cloneElement, type ReactElement, type ReactNode } from "react"

/**
 * `render`: the element a src/ui component draws itself as, such as a menu
 * trigger drawn as a ui/button or a collapsible drawn as a sidebar group. It
 * is shadcn's prop on Base UI, where Radix has `asChild`; src/ui takes it
 * already, so a feature is written once and only src/ui changes when it moves
 * to Base UI (ADR-0013). Until then it becomes Radix's `asChild` here. As on
 * Base UI, the component's own children, when it has any, go into the element.
 */
interface RenderProp {
  render?: ReactElement
}

function renderAsChild<P extends { asChild?: boolean; children?: ReactNode }>({
  render,
  ...props
}: P & RenderProp): Omit<P, "render"> {
  if (render === undefined) return props
  return {
    ...props,
    asChild: true,
    children:
      props.children === undefined
        ? render
        : cloneElement(render, undefined, props.children),
  }
}

export { renderAsChild, type RenderProp }

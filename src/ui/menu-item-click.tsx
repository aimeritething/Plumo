import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"

type ItemClick = React.MouseEventHandler<HTMLDivElement>
type ItemRender<State> =
  | React.ReactElement
  | ((props: React.HTMLAttributes<HTMLDivElement>, state: State) => React.ReactElement)

/**
 * A menu item's `render` that runs the caller's `onClick` after Base UI's own
 * click handling instead of before it. Base UI focuses the clicked item (for
 * Safari) and closes the menu on the click, so a choice that moves the focus
 * (into the editor, a find bar's field) must come after it: otherwise the
 * item takes the focus back, and the closing menu hands it to its trigger.
 * A disabled item runs nothing.
 */
function renderWithClickAfterMenu<State extends { disabled: boolean }>(
  onClick: ItemClick | undefined,
  render: ItemRender<State> | undefined
): ItemRender<State> | undefined {
  if (!onClick) return render
  return (props, state) => {
    const itemProps = {
      ...props,
      onClick: (event: React.MouseEvent<HTMLDivElement>) => {
        props.onClick?.(event)
        if (!state.disabled) onClick(event)
      },
    }
    if (render === undefined) return <div {...itemProps} />
    if (typeof render === "function") return render(itemProps, state)
    return React.cloneElement(render, mergeProps(itemProps, render.props as React.HTMLAttributes<HTMLDivElement>))
  }
}

export { renderWithClickAfterMenu }

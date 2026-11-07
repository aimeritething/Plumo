"use client"

import type * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "radix-ui"

import { renderAsChild, type RenderProp } from "./render"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root> & RenderProp) {
  return (
    <CollapsiblePrimitive.Root
      data-slot="collapsible"
      {...renderAsChild(props)}
    />
  )
}

function CollapsibleTrigger({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleTrigger>) {
  return (
    <CollapsiblePrimitive.CollapsibleTrigger
      data-slot="collapsible-trigger"
      {...props}
    />
  )
}

function CollapsibleContent({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.CollapsibleContent>) {
  return (
    <CollapsiblePrimitive.CollapsibleContent
      data-slot="collapsible-content"
      {...props}
    />
  )
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }

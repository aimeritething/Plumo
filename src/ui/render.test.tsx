import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from './collapsible'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './context-menu'

// `render` is how a feature composes src/ui, in place of Radix's `asChild`
// (ADR-0013): the component draws itself as the element, and its own children
// go into that element.
describe('render', () => {
  it('draws the component as the element, holding the component\'s children', () => {
    render(
      <Collapsible defaultOpen render={<section aria-label="Pinned" />}>
        <CollapsibleTrigger>Pinned</CollapsibleTrigger>
        <CollapsibleContent>rows</CollapsibleContent>
      </Collapsible>,
    )

    const group = screen.getByRole('region', { name: 'Pinned' })
    expect(group).toHaveAttribute('data-slot', 'collapsible')
    expect(group).toHaveTextContent('rows')

    fireEvent.click(screen.getByRole('button', { name: 'Pinned' }))
    expect(screen.queryByText('rows')).toBeNull()
  })

  it('hands the trigger\'s handlers to the element, which keeps its own', async () => {
    render(
      <ContextMenu>
        <ContextMenuTrigger render={<button type="button" data-testid="row" />}>row</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem>Rename</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>,
    )

    const row = screen.getByTestId('row')
    expect(row.tagName).toBe('BUTTON')
    expect(row).toHaveTextContent('row')

    fireEvent.contextMenu(row)
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
  })
})

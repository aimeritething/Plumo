import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ScrollArea } from './scroll-area'

describe('ScrollArea', () => {
  it('fades its content over an edge with more past it, unless told not to', () => {
    render(
      <>
        <ScrollArea data-testid="list">rows</ScrollArea>
        <ScrollArea data-testid="document" fade={false}>text</ScrollArea>
      </>,
    )
    const viewport = (id: string) => screen.getByTestId(id).querySelector('[data-slot="scroll-area-viewport"]')
    expect(viewport('list')).toHaveClass('scroll-fade-y')
    expect(viewport('document')).not.toHaveClass('scroll-fade-y')
  })
})

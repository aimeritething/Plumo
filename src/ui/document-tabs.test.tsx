import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DocumentTab, DocumentTabList } from './document-tabs'

/** Lays the strip out as `width` wide over `content` of Tabs, scrolled `left` in. */
function layOut(strip: HTMLElement, { width, content, left }: { width: number; content: number; left: number }) {
  Object.defineProperty(strip, 'clientWidth', { configurable: true, value: width })
  Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: content })
  Object.defineProperty(strip, 'scrollLeft', { configurable: true, value: left })
}

function edges(strip: HTMLElement) {
  return [strip.style.getPropertyValue('--scroll-fade-x-start'), strip.style.getPropertyValue('--scroll-fade-x-end')]
}

describe('DocumentTabList', () => {
  it('writes how far it can still scroll towards either end, for its fade', () => {
    render(
      <DocumentTabList aria-label="Tabs">
        <DocumentTab>a.md</DocumentTab>
      </DocumentTabList>,
    )
    const strip = screen.getByRole('tablist')
    expect(strip).toHaveClass('scroll-fade-x')
    expect(edges(strip)).toEqual(['0px', '0px'])

    layOut(strip, { width: 200, content: 500, left: 100 })
    fireEvent.scroll(strip)
    expect(edges(strip)).toEqual(['100px', '200px'])

    layOut(strip, { width: 200, content: 500, left: 300 })
    fireEvent.scroll(strip)
    expect(edges(strip)).toEqual(['300px', '0px'])
  })

  it('measures again when a Tab opens, without a scroll', async () => {
    const { rerender } = render(
      <DocumentTabList aria-label="Tabs">
        <DocumentTab>a.md</DocumentTab>
      </DocumentTabList>,
    )
    const strip = screen.getByRole('tablist')
    layOut(strip, { width: 200, content: 320, left: 0 })
    rerender(
      <DocumentTabList aria-label="Tabs">
        <DocumentTab>a.md</DocumentTab>
        <DocumentTab>b.md</DocumentTab>
      </DocumentTabList>,
    )
    await new Promise((resolve) => setTimeout(resolve))
    expect(edges(strip)).toEqual(['0px', '120px'])
  })

  it('still hands the strip to its ref', () => {
    const ref = createRef<HTMLDivElement>()
    const { unmount } = render(<DocumentTabList ref={ref} aria-label="Tabs" />)
    expect(ref.current).toBe(screen.getByRole('tablist'))
    unmount()
    expect(ref.current).toBeNull()
  })
})

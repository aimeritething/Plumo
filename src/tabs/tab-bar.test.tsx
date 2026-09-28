import { fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { Tab } from '@/types'
import { noteEntryForPath } from '@/folder/note-entry'
import { TabBar } from './tab-bar'
import { TooltipProvider } from '@/ui/tooltip'

// Every render sits in the one tooltip provider main.tsx gives the app.
const render = (ui: ReactElement) => renderBare(ui, { wrapper: TooltipProvider })

const tab = (path: string): Tab => ({ entry: noteEntryForPath(path, ''), content: '' })
const tabs = [tab('/n/a.md'), tab('/n/b.md'), tab('/n/c.md')]

describe('TabBar', () => {
  it('shows one Tab per open Document with the active one selected', () => {
    render(<TabBar tabs={tabs} activeTabPath="/n/b.md" onActivate={vi.fn()} onClose={vi.fn()} />)

    const rendered = screen.getAllByRole('tab')
    expect(rendered.map((element) => element.textContent)).toEqual(['a.md', 'b.md', 'c.md'])
    expect(rendered.map((element) => element.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
  })

  it('is absent with no Tab open', () => {
    render(<TabBar tabs={[]} activeTabPath={null} onActivate={vi.fn()} onClose={vi.fn()} />)

    expect(screen.queryByTestId('tab-bar')).toBeNull()
  })

  it('activates a Tab on click and closes it from its close affordance without activating it', () => {
    const onActivate = vi.fn()
    const onClose = vi.fn()
    render(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={onActivate} onClose={onClose} />)

    fireEvent.click(screen.getByRole('tab', { name: 'c.md' }))
    expect(onActivate).toHaveBeenCalledWith('/n/c.md')

    fireEvent.click(screen.getByRole('button', { name: 'Close b.md' }))
    expect(onClose).toHaveBeenCalledWith('/n/b.md')
    expect(onActivate).toHaveBeenCalledTimes(1)
  })

  it('closes a Tab on a middle-click, the way its close affordance does, without activating it', () => {
    const onActivate = vi.fn()
    const onClose = vi.fn()
    render(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={onActivate} onClose={onClose} />)
    const target = screen.getByRole('tab', { name: 'b.md' })

    const press = fireEvent.mouseDown(target, { button: 1 })
    const click = fireEvent(target, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }))

    expect(onClose).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledWith('/n/b.md')
    expect(onActivate).not.toHaveBeenCalled()
    // Prevented, so no autoscroll starts and nothing is pasted.
    expect(press).toBe(false)
    expect(click).toBe(false)
  })

  it('leaves a Tab open on a right-click', () => {
    const onClose = vi.fn()
    render(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={onClose} />)

    fireEvent(screen.getByRole('tab', { name: 'b.md' }), new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 2 }))

    expect(onClose).not.toHaveBeenCalled()
  })

  it('ends the Tabs with a "+" that runs New Document, and leaves it out with no handler', () => {
    const onNewDocument = vi.fn()
    const { rerender } = render(
      <TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={vi.fn()} onNewDocument={onNewDocument} />,
    )

    const plus = screen.getByRole('button', { name: 'New Document' })
    expect(screen.getByRole('tab', { name: 'c.md' }).compareDocumentPosition(plus) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(plus)
    expect(onNewDocument).toHaveBeenCalledTimes(1)

    rerender(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={vi.fn()} />)
    expect(screen.queryByRole('button', { name: 'New Document' })).toBeNull()
  })

  it('puts the active Tab controls at the row end, after the "+"', () => {
    render(
      <TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={vi.fn()} onNewDocument={vi.fn()} actions={<button type="button">Copy path</button>} />,
    )

    const slot = screen.getByTestId('tab-bar-actions')
    expect(slot).toContainElement(screen.getByRole('button', { name: 'Copy path' }))
    expect(screen.getByRole('button', { name: 'New Document' }).compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('adds the parent folder to two Tabs of the same name, and to no other', () => {
    const same = [tab('/n/Chinese/Everything.md'), tab('/n/Welcome.md'), tab('/n/English/Everything.md')]
    render(<TabBar tabs={same} activeTabPath="/n/Welcome.md" onActivate={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getAllByTestId('tab-parent').map((hint) => hint.textContent)).toEqual(['Chinese', 'English'])
    expect(screen.getByRole('tab', { name: 'Everything.md, Chinese' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Everything.md, English' })).toBeInTheDocument()
    expect(within(screen.getByRole('tab', { name: 'Welcome.md' })).queryByTestId('tab-parent')).toBeNull()
  })

  it('lays a Tab\'s × out after the name only under the pointer, the selected Tab\'s too', () => {
    render(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={vi.fn()} />)

    const close = screen.getByRole('button', { name: 'Close a.md' })
    expect(close).toHaveClass('hidden', 'group-hover:flex')
    expect(close.className).not.toMatch(/absolute|group-aria-selected/)
    expect(screen.getByRole('tab', { name: 'a.md' }).lastElementChild).toBe(close)
  })

  it('keeps each Tab at least 96px wide, its name cut short with an ellipsis, and scrolls the Tabs sideways with no scrollbar', () => {
    render(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={vi.fn()} />)

    const pill = screen.getByRole('tab', { name: 'a.md' })
    expect(pill).toHaveClass('min-w-24')
    expect(within(pill).getByTestId('tab-name')).toHaveClass('truncate')
    const strip = screen.getByRole('tablist')
    expect(strip).toHaveClass('overflow-x-auto', '[scrollbar-width:none]')
    // Only the Tabs scroll: the "+" and the active Tab's controls stay outside the strip.
    expect(strip).not.toContainElement(screen.queryByTestId('tab-bar-actions'))
  })

  it('scrolls the active Tab into view whenever another Tab becomes active, and not on other renders', () => {
    const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
    scrollIntoView.mockClear()
    const { rerender } = render(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={vi.fn()} />)
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('tab', { name: 'a.md' }))
    expect(scrollIntoView).toHaveBeenCalledWith({ inline: 'nearest', block: 'nearest' })

    scrollIntoView.mockClear()
    rerender(<TabBar tabs={tabs} activeTabPath="/n/c.md" onActivate={vi.fn()} onClose={vi.fn()} />)
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('tab', { name: 'c.md' }))

    // A Tab opened in the background leaves the strip where it is.
    scrollIntoView.mockClear()
    rerender(<TabBar tabs={[...tabs, tab('/n/d.md')]} activeTabPath="/n/c.md" onActivate={vi.fn()} onClose={vi.fn()} />)
    expect(scrollIntoView).not.toHaveBeenCalled()

    // Closing the active Tab makes a neighbour active, which is brought into view.
    rerender(<TabBar tabs={[tab('/n/a.md'), tab('/n/b.md'), tab('/n/d.md')]} activeTabPath="/n/d.md" onActivate={vi.fn()} onClose={vi.fn()} />)
    expect(scrollIntoView).toHaveBeenCalledOnce()
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('tab', { name: 'd.md' }))
  })

  it('turns a vertical wheel over the Tabs into a sideways scroll while they overflow', () => {
    render(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={vi.fn()} />)
    const strip = screen.getByRole('tablist')
    Object.defineProperty(strip, 'clientWidth', { configurable: true, value: 200 })
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 600 })

    const wheel = fireEvent.wheel(strip, { deltaY: 40 })
    expect(strip.scrollLeft).toBe(40)
    expect(wheel).toBe(false)

    // A sideways swipe is the browser's own to scroll.
    expect(fireEvent.wheel(strip, { deltaX: 30, deltaY: 2 })).toBe(true)
    expect(strip.scrollLeft).toBe(40)

    // Nothing to scroll: the wheel goes on its way.
    Object.defineProperty(strip, 'scrollWidth', { configurable: true, value: 200 })
    expect(fireEvent.wheel(strip, { deltaY: 40 })).toBe(true)
  })

  it('with the sidebar collapsed, leaves the traffic lights and the sidebar icon their room before the first tab', () => {
    const { rerender } = render(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={vi.fn()} sidebarCollapsed />)

    const bar = screen.getByTestId('tab-bar')
    expect(bar).toHaveAttribute('data-collapsed')

    rerender(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={vi.fn()} sidebarCollapsed={false} />)
    expect(bar).not.toHaveAttribute('data-collapsed')
  })
})

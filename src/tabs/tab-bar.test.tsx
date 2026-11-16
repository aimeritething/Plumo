import { act, fireEvent, render as renderBare, screen, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('activates a focused Tab on Enter or Space, with only the active Tab in the Tab order', () => {
    const onActivate = vi.fn()
    render(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={onActivate} onClose={vi.fn()} />)

    expect(screen.getAllByRole('tab').map((element) => element.tabIndex)).toEqual([0, -1, -1])
    fireEvent.keyDown(screen.getByRole('tab', { name: 'b.md' }), { key: 'Enter' })
    fireEvent.keyDown(screen.getByRole('tab', { name: 'c.md' }), { key: ' ' })
    fireEvent.keyDown(screen.getByRole('tab', { name: 'c.md' }), { key: 'a' })

    expect(onActivate.mock.calls).toEqual([['/n/b.md'], ['/n/c.md']])
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

  it('lays a Tab\'s × out at its right end only under the pointer, the selected Tab\'s too, in a Tab that keeps its width', () => {
    render(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={vi.fn()} />)

    const close = screen.getByRole('button', { name: 'Close a.md' })
    // At rest the name has the whole Tab; the Tab is a fixed width, so the × takes its room from the name.
    expect(close).toHaveClass('ml-auto', 'hidden', 'group-hover:flex')
    expect(close.className).not.toMatch(/opacity-0|group-aria-selected/)
    expect(screen.getByRole('tab', { name: 'a.md' })).toHaveClass('w-45')
    expect(screen.getByRole('tab', { name: 'a.md' }).lastElementChild).toBe(close)
  })

  it('makes every Tab the same width whatever its name, 180px narrowing together to 96px, its name cut short with an ellipsis, and scrolls the Tabs sideways with no scrollbar', () => {
    render(<TabBar tabs={[...tabs, tab('/n/a much longer name than the others.md')]} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={vi.fn()} />)

    for (const each of screen.getAllByRole('tab')) {
      expect(each).toHaveClass('w-45', 'min-w-24', 'shrink')
      expect(each.className).not.toMatch(/max-w-|flex-initial/)
    }
    const pill = screen.getByRole('tab', { name: 'a.md' })
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

  it('lays one fill under the selected Tab, slides it there when another Tab is selected, and only then', async () => {
    const { rerender } = render(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={vi.fn()} />)
    const strip = screen.getByRole('tablist')
    const fill = strip.querySelector<HTMLElement>('[data-slot="document-tab-fill"]')!
    screen.getAllByRole('tab').forEach((each, index) => {
      Object.defineProperty(each, 'offsetLeft', { configurable: true, value: index * 184 })
      Object.defineProperty(each, 'offsetWidth', { configurable: true, value: 180 })
    })

    // Where the selected Tab is from the first paint, with nothing to slide from.
    expect(fill.hidden).toBe(false)
    expect(fill.style.transitionProperty).toBe('none')
    for (const each of screen.getAllByRole('tab')) expect(each.className).not.toMatch(/(^| )aria-selected:bg-/)

    rerender(<TabBar tabs={tabs} activeTabPath="/n/c.md" onActivate={vi.fn()} onClose={vi.fn()} />)
    await act(async () => {})
    expect(fill.style.transform).toBe('translateX(368px)')
    expect(fill.style.width).toBe('180px')
    expect(fill.style.transitionProperty).toBe('transform, width')

    // A Tab moved in the order: the fill is simply where the selected Tab now is.
    rerender(<TabBar tabs={[tabs[2], tabs[0], tabs[1]]} activeTabPath="/n/c.md" onActivate={vi.fn()} onClose={vi.fn()} />)
    await act(async () => {})
    expect(fill.style.transitionProperty).toBe('none')
  })

  describe('carrying a Tab along the row', () => {
    afterEach(() => vi.useRealTimers())

    /** Three Tabs laid out 184px apart, as the strip lays 180px Tabs with its 4px gap. */
    function carry(props: { onReorder?: (path: string, index: number) => void } = { onReorder: vi.fn() }) {
      vi.useFakeTimers()
      const onActivate = vi.fn()
      render(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={onActivate} onClose={vi.fn()} {...props} />)
      const [a, b, c] = screen.getAllByRole('tab')
      ;[a, b, c].forEach((each, index) => Object.defineProperty(each, 'offsetLeft', { configurable: true, value: index * 184 }))
      return { a, b, c, onActivate, strip: screen.getByRole('tablist') }
    }
    const move = (clientX: number) => fireEvent(window, new PointerEvent('pointermove', { clientX }))
    const release = () => fireEvent(window, new PointerEvent('pointerup'))

    it('moves it with the pointer, the Tabs it passes stepping aside, and lets it go in its new place', () => {
      const onReorder = vi.fn()
      const { a, b, c, onActivate, strip } = carry({ onReorder })

      fireEvent.pointerDown(a, { button: 0, clientX: 50 })
      // Not yet a drag: a press that hardly travels is still a click.
      move(52)
      expect(strip).not.toHaveAttribute('data-reordering')
      expect(a.style.transform).toBe('')

      move(150)
      expect(strip).toHaveAttribute('data-reordering')
      expect(a).toHaveAttribute('data-dragging')
      expect(onActivate).toHaveBeenCalledWith('/n/a.md')
      // Under the hand exactly; past half of b's place, b steps back into a's.
      expect(a.style.transform).toBe('translateX(100px)')
      expect(a.style.transition).toBe('none')
      expect(b.style.transform).toBe('translateX(-184px)')
      expect(c.style.transform).toBe('')

      // Never carried past the last Tab's place.
      move(900)
      expect(a.style.transform).toBe('translateX(368px)')
      expect(c.style.transform).toBe('translateX(-184px)')

      release()
      // It glides into its place first; the order changes once it is there.
      expect(onReorder).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(200))
      expect(onReorder).toHaveBeenCalledWith('/n/a.md', 2)
      expect(strip).not.toHaveAttribute('data-reordering')
      expect(a).not.toHaveAttribute('data-dragging')
      for (const each of [a, b, c]) expect(each.style.transform).toBe('')
    })

    it('puts it back where it was on Escape, and leaves the order alone when it is let go where it started', () => {
      const onReorder = vi.fn()
      const { c, b } = carry({ onReorder })

      fireEvent.pointerDown(c, { button: 0, clientX: 400 })
      move(200)
      expect(b.style.transform).toBe('translateX(184px)')
      fireEvent.keyDown(window, { key: 'Escape' })
      act(() => vi.advanceTimersByTime(200))
      release()
      expect(onReorder).not.toHaveBeenCalled()
      expect(c.style.transform).toBe('')

      fireEvent.pointerDown(c, { button: 0, clientX: 400 })
      move(380)
      release()
      act(() => vi.advanceTimersByTime(200))
      expect(onReorder).not.toHaveBeenCalled()
    })

    it('picks nothing up from the ×, with another button, or with no way to reorder', () => {
      const { a, strip } = carry()
      fireEvent.pointerDown(screen.getByRole('button', { name: 'Close a.md' }), { button: 0, clientX: 50 })
      move(150)
      expect(strip).not.toHaveAttribute('data-reordering')
      release()

      fireEvent.pointerDown(a, { button: 2, clientX: 50 })
      move(150)
      expect(strip).not.toHaveAttribute('data-reordering')
    })

    it('carries nothing when the Tabs cannot be moved', () => {
      const { a, strip } = carry({})
      fireEvent.pointerDown(a, { button: 0, clientX: 50 })
      move(150)
      expect(strip).not.toHaveAttribute('data-reordering')
    })
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

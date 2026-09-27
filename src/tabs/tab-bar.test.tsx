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

  it('with the sidebar collapsed, seats the traffic lights and the sidebar icon before the first tab', () => {
    const onShowSidebar = vi.fn()
    render(
      <TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={vi.fn()} sidebarCollapsed onShowSidebar={onShowSidebar} />,
    )

    const bar = screen.getByTestId('tab-bar')
    const chrome = screen.getByTestId('collapsed-chrome')
    expect(bar).toContainElement(chrome)
    expect(chrome.compareDocumentPosition(screen.getByRole('tab', { name: 'a.md' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show sidebar' }))
    expect(onShowSidebar).toHaveBeenCalledTimes(1)
  })

  it('carries no chrome while the sidebar is shown', () => {
    render(<TabBar tabs={tabs} activeTabPath="/n/a.md" onActivate={vi.fn()} onClose={vi.fn()} sidebarCollapsed={false} onShowSidebar={vi.fn()} />)

    expect(screen.queryByTestId('collapsed-chrome')).toBeNull()
  })
})

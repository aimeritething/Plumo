import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DocumentTabActions, ImageTabActions, type DocumentMenuActions, type TabMode } from './tab-actions'
import { TooltipProvider } from '@/ui/tooltip'

function richMode(overrides: Partial<TabMode> = {}): TabMode {
  return { value: 'rich', onChange: vi.fn(), richDisabledReason: null, ...overrides }
}

function renderWithTooltips(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

/** Radix opens a dropdown from a primary-button pointer-down on its trigger. */
async function openMore() {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'More' }), { button: 0, ctrlKey: false, pointerType: 'mouse' })
  return screen.findByTestId('tab-more-menu')
}

function renderDocument(overrides: { mode?: TabMode; onCopyPath?: () => void; menu?: DocumentMenuActions } = {}) {
  return renderWithTooltips(<DocumentTabActions mode={overrides.mode ?? richMode()} onCopyPath={overrides.onCopyPath} menu={overrides.menu ?? {}} />)
}

describe('ImageTabActions', () => {
  it('shows the dimensions and size, Open ↗ and Copy path', () => {
    renderWithTooltips(<ImageTabActions metadata="1920 × 1080 · 240 KB" onOpenExternal={vi.fn()} onCopyPath={vi.fn()} />)

    expect(screen.getByTestId('image-meta')).toHaveTextContent('1920 × 1080 · 240 KB')
    expect(screen.getByRole('button', { name: 'Open ↗' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy path' })).toBeInTheDocument()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull()
  })

  it('keeps the metadata slot empty until the picture has loaded, buttons and all in place', () => {
    renderWithTooltips(<ImageTabActions metadata={null} onOpenExternal={vi.fn()} onCopyPath={vi.fn()} />)

    expect(screen.queryByTestId('image-meta')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open ↗' })).toBeInTheDocument()
  })

  it('hands the file over from either button', () => {
    const onOpenExternal = vi.fn()
    const onCopyPath = vi.fn()
    renderWithTooltips(<ImageTabActions metadata={null} onOpenExternal={onOpenExternal} onCopyPath={onCopyPath} />)

    fireEvent.click(screen.getByRole('button', { name: 'Open ↗' }))
    fireEvent.click(screen.getByRole('button', { name: 'Copy path' }))

    expect(onOpenExternal).toHaveBeenCalledTimes(1)
    expect(onCopyPath).toHaveBeenCalledTimes(1)
  })
})

describe('DocumentTabActions', () => {
  it('shows Copy path, then the Rich | Raw control, then "…"', () => {
    renderDocument({ onCopyPath: vi.fn() })

    const slot = screen.getByTestId('document-tab-actions')
    const order = Array.from(slot.querySelectorAll('[data-testid]')).map((child) => child.getAttribute('data-testid'))
    expect(order).toEqual(['tab-copy-path', 'tab-mode', 'tab-mode-rich', 'tab-mode-raw', 'tab-more'])
  })

  it('copies the path, its tooltip naming the shortcut', async () => {
    const onCopyPath = vi.fn()
    renderDocument({ onCopyPath })

    const button = screen.getByRole('button', { name: 'Copy path' })
    fireEvent.click(button)
    expect(onCopyPath).toHaveBeenCalledTimes(1)

    fireEvent.focus(button)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Copy path ⌘⇧,')
  })

  describe('the Rich | Raw control', () => {
    it('shows both segments with the current one checked and asks for the other on click', () => {
      const onChange = vi.fn()
      renderDocument({ mode: richMode({ onChange }) })

      const rich = screen.getByRole('radio', { name: 'Rich' })
      const raw = screen.getByRole('radio', { name: 'Raw' })
      expect(rich).toBeChecked()
      expect(raw).not.toBeChecked()

      fireEvent.click(raw)
      expect(onChange).toHaveBeenCalledWith('raw')
      fireEvent.click(rich)
      expect(onChange).toHaveBeenCalledTimes(1)
    })

    it('names the shortcut as a chip in the tooltip', async () => {
      renderDocument()

      fireEvent.focus(screen.getByRole('radio', { name: 'Raw' }))

      const tip = await screen.findByRole('tooltip')
      expect(tip).toHaveTextContent('Raw ⌘\\')
      expect(Array.from(tip.querySelectorAll('kbd'), (chip) => chip.textContent)).toEqual(['⌘', '\\'])
    })

    it('disables the Rich segment with the reason as its tooltip while the Frontmatter is invalid', async () => {
      const onChange = vi.fn()
      renderDocument({ mode: richMode({ value: 'raw', onChange, richDisabledReason: 'Fix the frontmatter to use Rich mode' }) })

      const rich = screen.getByRole('radio', { name: 'Rich' })
      expect(rich).toHaveAttribute('aria-disabled', 'true')
      fireEvent.click(rich)
      expect(onChange).not.toHaveBeenCalled()

      fireEvent.focus(rich)
      expect(await screen.findByRole('tooltip')).toHaveTextContent('Fix the frontmatter to use Rich mode')
    })
  })

  describe('the "…" menu', () => {
    it('holds Pin, Reveal in Finder, Open in Default App, Find and Close Tab, the last two with their shortcuts', async () => {
      renderDocument({ menu: { onTogglePin: vi.fn(), onRevealInFinder: vi.fn(), onOpenInDefaultApp: vi.fn(), onFind: vi.fn(), onCloseTab: vi.fn() } })

      await openMore()

      const items = await screen.findAllByRole('menuitem')
      expect(items.map((item) => item.textContent)).toEqual(['Pin', 'Reveal in Finder', 'Open in Default App', 'Find⌘F', 'Close Tab⌘W'])
    })

    it('names the first item Unpin for a pinned Document', async () => {
      renderDocument({ menu: { pinned: true, onTogglePin: vi.fn() } })

      await openMore()

      expect(await screen.findByRole('menuitem', { name: 'Unpin' })).toBeInTheDocument()
    })

    it('runs each item\'s command', async () => {
      const menu = { onTogglePin: vi.fn(), onRevealInFinder: vi.fn(), onOpenInDefaultApp: vi.fn(), onFind: vi.fn(), onCloseTab: vi.fn() }
      renderDocument({ menu })

      for (const [name, handler] of [
        ['Pin', menu.onTogglePin],
        ['Reveal in Finder', menu.onRevealInFinder],
        ['Open in Default App', menu.onOpenInDefaultApp],
        ['Find', menu.onFind],
        ['Close Tab', menu.onCloseTab],
      ] as const) {
        await openMore()
        fireEvent.click(await screen.findByRole('menuitem', { name: new RegExp(`^${name}`) }))
        expect(handler, name).toHaveBeenCalledTimes(1)
      }
    })

    it('greys an item whose command has no handler', async () => {
      renderDocument({ menu: { onFind: vi.fn() } })

      await openMore()

      expect(await screen.findByRole('menuitem', { name: 'Pin' })).toHaveAttribute('data-disabled')
      expect(screen.getByRole('menuitem', { name: /^Find/ })).not.toHaveAttribute('data-disabled')
    })
  })
})

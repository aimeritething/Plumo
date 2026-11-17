import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ThemeMode } from '@/shell/theme-mode'
import { pressItem } from '@/ui/open-layer.test-utils'
import { TooltipProvider } from '@/ui/tooltip'
import { SettingsDialog } from './settings-dialog'

function renderDialog(theme: ThemeMode = 'light', primaryColor = '#0082fb') {
  const props = { open: true, onClose: vi.fn(), theme, onThemeChange: vi.fn(), primaryColor, onPrimaryColorChange: vi.fn() }
  render(<SettingsDialog {...props} />, { wrapper: TooltipProvider })
  return props
}

const themeSelect = () => screen.getByRole('combobox', { name: 'Theme' })

describe('SettingsDialog', () => {
  it('is titled Settings and lists the Appearance section in one column, with no section nav', () => {
    renderDialog()

    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    const section = within(dialog).getByRole('region', { name: 'Appearance' })
    expect(within(section).getAllByRole('listitem')).toHaveLength(2)
    expect(within(dialog).queryByRole('navigation')).not.toBeInTheDocument()
    expect(within(dialog).queryByRole('tab')).not.toBeInTheDocument()
  })

  it('shows the current theme in a select that offers System, Dark and Light', async () => {
    renderDialog('dark')

    expect(themeSelect()).toHaveTextContent('Dark')
    fireEvent.click(themeSelect())
    const options = await screen.findAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['System', 'Dark', 'Light'])
    expect(screen.getByRole('option', { name: 'Dark' })).toHaveAttribute('aria-selected', 'true')
  })

  it('applies a theme at once when it is chosen', async () => {
    const props = renderDialog('light')

    fireEvent.click(themeSelect())
    pressItem(await screen.findByRole('option', { name: 'System' }))
    expect(props.onThemeChange).toHaveBeenLastCalledWith('system')
    expect(props.onThemeChange).toHaveBeenCalledOnce()
  })

  it('takes the focus itself as it opens', async () => {
    renderDialog()
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveFocus())
  })

  it('closes on Esc and on its close button', () => {
    const props = renderDialog()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })

  it('offers the Primary color as the eight presets and Custom, the current one pressed', () => {
    renderDialog('light', '#8e4ec6')

    const group = screen.getByRole('group', { name: 'Primary color' })
    expect(within(group).getAllByRole('button').map((swatch) => swatch.getAttribute('aria-label'))).toEqual(
      ['Blue', 'Purple', 'Pink', 'Red', 'Orange', 'Yellow', 'Green', 'Graphite', 'Custom'],
    )
    expect(within(group).getByRole('button', { pressed: true })).toHaveAccessibleName('Purple')
  })

  it('names a swatch in a tooltip, not a native title, and keeps its accessible name', async () => {
    renderDialog()

    const swatch = screen.getByRole('button', { name: 'Green' })
    expect(swatch).not.toHaveAttribute('title')
    fireEvent.focus(swatch)
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Green')
    expect(swatch).toHaveAccessibleName('Green')
  })

  it('applies a preset on click, never clears it, and takes any colour from the panel', () => {
    const props = renderDialog()

    fireEvent.click(screen.getByTestId('settings-primary-color:green'))
    expect(props.onPrimaryColorChange).toHaveBeenLastCalledWith('#30a46c')

    fireEvent.click(screen.getByTestId('settings-primary-color:blue'))
    expect(props.onPrimaryColorChange).toHaveBeenCalledOnce()

    fireEvent.change(screen.getByTestId('settings-primary-color-panel'), { target: { value: '#123456' } })
    expect(props.onPrimaryColorChange).toHaveBeenLastCalledWith('#123456')
  })

  it('opens the colour panel from Custom without changing the colour', () => {
    const props = renderDialog()
    const panel = screen.getByTestId('settings-primary-color-panel')
    const opened = vi.fn()
    panel.addEventListener('click', opened)

    fireEvent.click(screen.getByRole('button', { name: 'Custom' }))
    expect(opened).toHaveBeenCalledOnce()
    expect(props.onPrimaryColorChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Blue' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('presses Custom, and names the colour, for a colour that is no preset', () => {
    renderDialog('light', '#123456')

    expect(screen.getByRole('button', { name: 'Custom' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('settings-primary-color')).toHaveTextContent('#123456')
  })

  it('renders nothing while closed', () => {
    render(<SettingsDialog open={false} onClose={vi.fn()} theme="light" onThemeChange={vi.fn()} primaryColor="#0082fb" onPrimaryColorChange={vi.fn()} />, { wrapper: TooltipProvider })
    expect(screen.queryByTestId('settings-dialog')).not.toBeInTheDocument()
  })
})

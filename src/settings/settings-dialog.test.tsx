import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ThemeMode } from '@/shell/theme-mode'
import { TooltipProvider } from '@/ui/tooltip'
import { SettingsDialog } from './settings-dialog'

function renderDialog(theme: ThemeMode = 'light', primaryColor = '#0082fb') {
  const props = { open: true, onClose: vi.fn(), theme, onThemeChange: vi.fn(), primaryColor, onPrimaryColorChange: vi.fn() }
  render(<SettingsDialog {...props} />, { wrapper: TooltipProvider })
  return props
}

const themeCard = (mode: ThemeMode) => screen.getByTestId(`settings-theme:${mode}`)

describe('SettingsDialog', () => {
  it('is titled Settings and shows the Appearance section, chosen in the nav', () => {
    renderDialog()

    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    const nav = within(dialog).getByRole('navigation', { name: 'Settings sections' })
    expect(within(nav).getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-current', 'page')
    expect(within(dialog).getByRole('region', { name: 'Appearance' })).toBeInTheDocument()
    expect(within(dialog).queryByRole('tab')).not.toBeInTheDocument()
  })

  it('offers the theme as System, Dark and Light, the current one checked', () => {
    renderDialog('dark')

    const group = screen.getByRole('radiogroup', { name: 'Theme' })
    expect(within(group).getAllByRole('radio').map((radio) => radio.textContent)).toEqual(['System', 'Dark', 'Light'])
    expect(themeCard('dark')).toHaveAttribute('aria-checked', 'true')
    expect(themeCard('light')).toHaveAttribute('aria-checked', 'false')
    expect(themeCard('dark')).toHaveAttribute('tabindex', '0')
    expect(themeCard('system')).toHaveAttribute('tabindex', '-1')
  })

  it('draws each card in its own theme, System in both', () => {
    renderDialog()

    const themesIn = (mode: ThemeMode) =>
      Array.from(themeCard(mode).querySelectorAll('[data-theme]'), (window) => window.getAttribute('data-theme'))
    expect(themesIn('system')).toEqual(['light', 'dark'])
    expect(themesIn('dark')).toEqual(['dark'])
    expect(themesIn('light')).toEqual(['light'])
  })

  it('applies a choice at once, by click or by arrow key', () => {
    const props = renderDialog('light')

    fireEvent.click(themeCard('system'))
    expect(props.onThemeChange).toHaveBeenLastCalledWith('system')

    fireEvent.keyDown(themeCard('light'), { key: 'ArrowLeft' })
    expect(props.onThemeChange).toHaveBeenLastCalledWith('dark')

    fireEvent.keyDown(themeCard('light'), { key: 'ArrowRight' })
    expect(props.onThemeChange).toHaveBeenLastCalledWith('system')
  })

  it('closes on Esc and on its close button', () => {
    const props = renderDialog()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })

  it('offers the Primary color as the eight presets and Custom, the current one checked', () => {
    renderDialog('light', '#8e4ec6')

    const group = screen.getByRole('radiogroup', { name: 'Primary color' })
    expect(within(group).getAllByRole('radio').map((radio) => radio.getAttribute('aria-label'))).toEqual(
      ['Blue', 'Purple', 'Pink', 'Red', 'Orange', 'Yellow', 'Green', 'Graphite', 'Custom'],
    )
    expect(within(group).getByRole('radio', { checked: true })).toHaveAccessibleName('Purple')
  })

  it('applies a preset on click and on the arrows, and any colour from the panel', () => {
    const props = renderDialog()

    fireEvent.click(screen.getByTestId('settings-primary-color:green'))
    expect(props.onPrimaryColorChange).toHaveBeenLastCalledWith('#30a46c')

    fireEvent.keyDown(screen.getByTestId('settings-primary-color:blue'), { key: 'ArrowRight' })
    expect(props.onPrimaryColorChange).toHaveBeenLastCalledWith('#8e4ec6')

    fireEvent.change(screen.getByTestId('settings-primary-color-panel'), { target: { value: '#123456' } })
    expect(props.onPrimaryColorChange).toHaveBeenLastCalledWith('#123456')
  })

  it('checks Custom, and names the colour, for a colour that is no preset', () => {
    renderDialog('light', '#123456')

    expect(screen.getByRole('radio', { name: 'Custom' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByTestId('settings-primary-color')).toHaveTextContent('#123456')
  })

  it('renders nothing while closed', () => {
    render(<SettingsDialog open={false} onClose={vi.fn()} theme="light" onThemeChange={vi.fn()} primaryColor="#0082fb" onPrimaryColorChange={vi.fn()} />, { wrapper: TooltipProvider })
    expect(screen.queryByTestId('settings-dialog')).not.toBeInTheDocument()
  })
})

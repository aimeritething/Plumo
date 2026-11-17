import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ThemeMode } from '@/shell/theme-mode'
import { TooltipProvider } from '@/ui/tooltip'
import { SettingsDialog } from './settings-dialog'

function renderDialog(theme: ThemeMode = 'light', primaryColor = '#0082fb') {
  const props = { open: true, onClose: vi.fn(), theme, onThemeChange: vi.fn(), primaryColor, onPrimaryColorChange: vi.fn() }
  render(<SettingsDialog {...props} />, { wrapper: TooltipProvider })
  return props
}

/** The dialog with its Primary color held, as the app holds it: a change shows. */
function renderWithColor(initial = '#0082fb') {
  const onPrimaryColorChange = vi.fn()
  function Harness() {
    const [color, setColor] = useState(initial)
    return (
      <SettingsDialog
        open
        onClose={vi.fn()}
        theme="light"
        onThemeChange={vi.fn()}
        primaryColor={color}
        onPrimaryColorChange={(next) => { onPrimaryColorChange(next); setColor(next) }}
      />
    )
  }
  render(<Harness />, { wrapper: TooltipProvider })
  return onPrimaryColorChange
}

const themeSelect = () => screen.getByRole('combobox', { name: 'Theme' })
const colorSelect = () => screen.getByRole('combobox', { name: 'Primary color' })
const hexField = () => screen.queryByRole('textbox', { name: 'Custom color' })

async function optionsOf(select: HTMLElement) {
  fireEvent.click(select)
  return (await screen.findAllByRole('option')).map((option) => option.textContent)
}

/**
 * Opens `select` and chooses `name` as the keyboard would. A mouse click that
 * lands just as the list opens is one Base UI ignores (the list is laid over
 * the trigger), so the option takes the highlight first.
 */
async function choose(select: HTMLElement, name: string) {
  fireEvent.click(select)
  const option = await screen.findByRole('option', { name })
  act(() => option.focus())
  fireEvent.click(option)
  await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
}

describe('SettingsDialog', () => {
  it('is named Settings and shows the Appearance section, chosen in the nav, under its name', () => {
    renderDialog()

    const dialog = screen.getByRole('dialog', { name: 'Settings' })
    const nav = within(dialog).getByRole('navigation', { name: 'Settings sections' })
    // The title names the dialog for assistive technology alone.
    expect(within(dialog).getByText('Settings')).toHaveClass('sr-only')
    expect(within(nav).getByRole('button', { name: 'Appearance' })).toHaveAttribute('aria-current', 'page')
    expect(within(dialog).getByRole('region', { name: 'Appearance' })).toBeInTheDocument()
  })

  it('closes on Esc and on its close button, which shows no tooltip', async () => {
    const props = renderDialog()

    const close = screen.getByRole('button', { name: 'Close' })
    fireEvent.focus(close)
    fireEvent.pointerEnter(close)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledOnce()

    fireEvent.click(close)
    expect(props.onClose).toHaveBeenCalledTimes(2)
  })

  it('renders nothing while closed', () => {
    render(<SettingsDialog open={false} onClose={vi.fn()} theme="light" onThemeChange={vi.fn()} primaryColor="#0082fb" onPrimaryColorChange={vi.fn()} />, { wrapper: TooltipProvider })
    expect(screen.queryByTestId('settings-dialog')).not.toBeInTheDocument()
  })
})

describe('the Theme setting', () => {
  it('shows the current theme and offers System, Dark and Light', async () => {
    renderDialog('dark')

    expect(themeSelect()).toHaveTextContent('Dark')
    expect(await optionsOf(themeSelect())).toEqual(['System', 'Dark', 'Light'])
  })

  it('applies a choice at once', async () => {
    const props = renderDialog('light')

    await choose(themeSelect(), 'System')
    expect(props.onThemeChange).toHaveBeenLastCalledWith('system')
  })
})

describe('the Primary color setting', () => {
  it('shows the current preset and offers the eight presets, each with its dot, and Custom, with none', async () => {
    renderDialog('light', '#8e4ec6')

    expect(colorSelect()).toHaveTextContent('Purple')
    expect(hexField()).not.toBeInTheDocument()
    expect(await optionsOf(colorSelect())).toEqual(
      ['Blue', 'Purple', 'Pink', 'Red', 'Orange', 'Yellow', 'Green', 'Graphite', 'Custom'],
    )
    const green = screen.getByRole('option', { name: 'Green' })
    expect(green.querySelector('[aria-hidden="true"][style]')).toHaveStyle({ background: '#30a46c' })
    expect(screen.getByRole('option', { name: 'Custom' }).querySelector('[style]')).toBeNull()
  })

  it('applies a preset at once', async () => {
    const props = renderDialog()

    await choose(colorSelect(), 'Green')
    expect(props.onPrimaryColorChange).toHaveBeenLastCalledWith('#30a46c')
    expect(hexField()).not.toBeInTheDocument()
  })

  it('shows Custom and the hex field, upper-case, for a colour that is no preset', () => {
    renderDialog('light', '#3a83f7')

    expect(colorSelect()).toHaveTextContent('Custom')
    expect(colorSelect().querySelector('[style]')).toBeNull()
    expect(hexField()).toHaveValue('#3A83F7')
  })

  it('puts the hex field after Custom, holding the current colour, and changes nothing by itself', async () => {
    const onChange = renderWithColor('#0082fb')

    await choose(colorSelect(), 'Custom')
    expect(colorSelect()).toHaveTextContent('Custom')
    expect(hexField()).toHaveValue('#0082FB')
    expect(onChange).not.toHaveBeenCalled()

    await choose(colorSelect(), 'Red')
    expect(onChange).toHaveBeenLastCalledWith('#e5484d')
    expect(hexField()).not.toBeInTheDocument()
  })

  it('applies six hex digits as they are typed, with or without #, and nothing less', async () => {
    const onChange = renderWithColor('#123456')
    const field = hexField()!

    fireEvent.change(field, { target: { value: '#3A8' } })
    fireEvent.change(field, { target: { value: '#GG0000' } })
    expect(onChange).not.toHaveBeenCalled()
    expect(field).toHaveValue('#GG0000')

    fireEvent.change(field, { target: { value: '3a83f7' } })
    expect(onChange).toHaveBeenLastCalledWith('#3a83f7')
    // What is typed stays as typed until the field is left.
    expect(field).toHaveValue('3a83f7')

    fireEvent.blur(field)
    expect(field).toHaveValue('#3A83F7')
  })

  it('goes back to the current colour on leaving the field, or on Enter, when what was typed is no colour', () => {
    const onChange = renderWithColor('#123456')
    const field = hexField()!

    fireEvent.change(field, { target: { value: '#12' } })
    fireEvent.blur(field)
    expect(field).toHaveValue('#123456'.toUpperCase())

    fireEvent.change(field, { target: { value: 'zz' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(field).toHaveValue('#123456'.toUpperCase())
    expect(onChange).not.toHaveBeenCalled()
  })

  it('stays Custom for a typed colour that is a preset', () => {
    renderWithColor('#123456')

    fireEvent.change(hexField()!, { target: { value: '#0082fb' } })
    expect(colorSelect()).toHaveTextContent('Custom')
    expect(hexField()).toBeInTheDocument()
  })

  it('opens the colour panel from the dot, and shows the colour picked there', () => {
    const onChange = renderWithColor('#123456')
    const panel = screen.getByTestId('settings-primary-color-panel')
    const opened = vi.fn()
    panel.addEventListener('click', opened)

    fireEvent.click(screen.getByRole('button', { name: 'Pick a color' }))
    expect(opened).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.change(panel, { target: { value: '#abcdef' } })
    expect(onChange).toHaveBeenLastCalledWith('#abcdef')
    expect(hexField()).toHaveValue('#ABCDEF')
  })
})

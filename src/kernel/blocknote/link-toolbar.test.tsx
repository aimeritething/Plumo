import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/ui/tooltip'

const { deleteLinkMock, editLinkMock } = vi.hoisted(() => ({
  deleteLinkMock: vi.fn(),
  editLinkMock: vi.fn(),
}))

vi.mock('@blocknote/react', () => ({
  useDictionary: () => ({
    link_toolbar: {
      delete: { tooltip: 'Remove link' },
      edit: { text: 'Edit link', tooltip: 'Edit' },
      form: { title_placeholder: 'Edit title', url_placeholder: 'Edit URL' },
      open: { tooltip: 'Open in new tab' },
    },
  }),
  useExtension: () => ({ deleteLink: deleteLinkMock, editLink: editLinkMock }),
}))

import { LinkToolbar } from './link-toolbar'

function renderLinkToolbar() {
  const props = {
    onOpenLink: vi.fn(),
    setToolbarOpen: vi.fn(),
    setToolbarPositionFrozen: vi.fn(),
  }
  render(
    <LinkToolbar {...props} range={{ from: 3, to: 10 }} text="Plumo" url="https://plumo.app" />,
    { wrapper: TooltipProvider },
  )
  return props
}

describe('the Link toolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows the URL, and opens the link from it', () => {
    const props = renderLinkToolbar()

    const open = screen.getByRole('button', { name: 'Open in new tab' })
    expect(open).toHaveTextContent('https://plumo.app')
    expect(screen.getByRole('toolbar', { name: 'Link actions' })).toContainElement(open)

    fireEvent.click(open)
    expect(props.onOpenLink).toHaveBeenCalledWith('https://plumo.app')
  })

  it('holds its place while the edit form is open and writes the URL and text on Enter', () => {
    const props = renderLinkToolbar()

    fireEvent.click(screen.getByRole('button', { name: 'Edit link' }))
    expect(props.setToolbarPositionFrozen).toHaveBeenCalledWith(true)

    const url = screen.getByRole('textbox', { name: 'Edit URL' })
    const title = screen.getByRole('textbox', { name: 'Edit title' })
    expect(url).toHaveValue('https://plumo.app')
    expect(title).toHaveValue('Plumo')

    fireEvent.change(title, { target: { value: 'Plumo home' } })
    fireEvent.keyDown(title, { key: 'Enter' })

    expect(editLinkMock).toHaveBeenCalledWith('https://plumo.app', 'Plumo home', 3)
    expect(props.setToolbarOpen).toHaveBeenCalledWith(false)
    expect(props.setToolbarPositionFrozen).toHaveBeenLastCalledWith(false)
  })

  it('leaves the link alone on Enter while an IME composes', () => {
    renderLinkToolbar()

    fireEvent.click(screen.getByRole('button', { name: 'Edit link' }))
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Edit URL' }), { key: 'Enter', isComposing: true })

    expect(editLinkMock).not.toHaveBeenCalled()
  })

  it('removes the link and closes', () => {
    const props = renderLinkToolbar()

    fireEvent.click(screen.getByRole('button', { name: 'Remove link' }))

    expect(deleteLinkMock).toHaveBeenCalledWith(3)
    expect(props.setToolbarOpen).toHaveBeenCalledWith(false)
  })
})

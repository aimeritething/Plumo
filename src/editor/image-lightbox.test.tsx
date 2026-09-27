import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ImageLightbox } from './image-lightbox'

describe('ImageLightbox', () => {
  it('renders the selected image in a dialog', () => {
    render(
      <ImageLightbox
        image={{ src: 'https://example.com/photo.png', alt: 'A lake' }}
        onClose={() => {}}
      />,
    )

    expect(screen.getByTestId('image-lightbox')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'A lake' })).toHaveAttribute('src', 'https://example.com/photo.png')
    expect(screen.getByText('Image preview')).toHaveClass('sr-only')
  })

  it('falls back to the preview title as alt text when the image has no alt', () => {
    render(
      <ImageLightbox
        image={{ src: 'https://example.com/photo.png', alt: '' }}
        onClose={() => {}}
      />,
    )

    expect(screen.getByRole('img', { name: 'Image preview' })).toBeInTheDocument()
  })

  it('calls onClose when the dialog closes', () => {
    const onClose = vi.fn()
    render(
      <ImageLightbox
        image={{ src: 'https://example.com/photo.png', alt: 'A lake' }}
        onClose={onClose}
      />,
    )

    fireEvent.keyDown(screen.getByTestId('image-lightbox'), { key: 'Escape' })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closing hands focus back to the editor the picture was double-clicked in (AIM-457)', async () => {
    const editable = document.createElement('div')
    editable.setAttribute('contenteditable', 'true')
    editable.tabIndex = -1
    document.body.appendChild(editable)
    editable.focus()
    const image = { src: 'https://example.com/photo.png', alt: 'A lake' }
    const { rerender } = render(<ImageLightbox image={image} onClose={() => {}} />)
    expect(editable).not.toHaveFocus()

    fireEvent.keyDown(screen.getByTestId('image-lightbox'), { key: 'Escape' })
    rerender(<ImageLightbox image={null} onClose={() => {}} />)

    await waitFor(() => expect(editable).toHaveFocus())
  })
})

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { pressItem } from '@/ui/open-layer.test-utils'
import { CodeBlockLanguageControls } from './code-block-language-controls'

function codeBlockDom() {
  const editorElement = document.createElement('div')
  editorElement.className = 'bn-editor'
  editorElement.setAttribute('contenteditable', 'false')

  const blockContainer = document.createElement('div')
  blockContainer.dataset.nodeType = 'blockContainer'
  blockContainer.dataset.id = 'code-block-1'

  const blockContent = document.createElement('div')
  blockContent.className = 'bn-block-content'
  blockContent.dataset.contentType = 'codeBlock'

  const nativeControl = document.createElement('select')
  nativeControl.disabled = true
  nativeControl.append(new Option('Plain Text', 'text'), new Option('C++', 'cpp'))
  nativeControl.value = 'text'

  const controlHost = document.createElement('div')
  controlHost.appendChild(nativeControl)
  blockContent.appendChild(controlHost)
  blockContainer.appendChild(blockContent)
  editorElement.appendChild(blockContainer)
  const container = document.createElement('div')
  container.className = 'editor__blocknote-container'
  container.appendChild(editorElement)
  document.body.appendChild(container)

  return { container, editorElement, nativeControl }
}

describe('CodeBlockLanguageControls', () => {
  it('names the language of a fence written with an alias', async () => {
    const { container } = codeBlockDom()
    const editor = {
      domElement: container,
      getBlock: vi.fn(() => ({ id: 'code-block-1', type: 'codeBlock', props: { language: 'ts' } })),
      isEditable: true,
      onChange: vi.fn(() => vi.fn()),
      updateBlock: vi.fn(),
    }

    render(<CodeBlockLanguageControls editor={editor as never} />)

    await waitFor(() => {
      expect(container.querySelector('[data-slot="select-trigger"]')).toHaveTextContent('TypeScript')
    })
    container.remove()
  })

  it('replaces a stale disabled native picker with a live shadcn language control', async () => {
    const { container, editorElement, nativeControl } = codeBlockDom()
    editorElement.remove()
    const editor = {
      domElement: editorElement.parentElement,
      getBlock: vi.fn(() => ({ id: 'code-block-1', type: 'codeBlock' })),
      isEditable: false,
      onChange: vi.fn(() => vi.fn()),
      updateBlock: vi.fn(),
    }

    render(<CodeBlockLanguageControls editor={editor as never} />)

    await act(async () => {
      editor.domElement = editorElement
      container.appendChild(editorElement)
    })

    const trigger = await waitFor(() => {
      const control = document.querySelector('[data-slot="select-trigger"]')
      if (!control || control.tagName !== 'BUTTON') throw new Error('Language trigger was unavailable')
      return control
    })
    expect(trigger.closest('[data-code-block-id]')).toHaveAttribute('data-code-block-id', 'code-block-1')
    // Laid out inside the editor container, so it scrolls with its code block.
    expect(container).toContainElement(trigger as HTMLElement)
    expect(trigger).toBeDisabled()
    expect(nativeControl).toBeDisabled()

    await act(async () => {
      editor.isEditable = true
      editorElement.setAttribute('contenteditable', 'true')
    })
    await waitFor(() => expect(trigger).toBeEnabled())

    fireEvent.click(trigger)
    // The picker's list, not the native select's options it stands in for.
    pressItem(within(await screen.findByRole('listbox')).getByRole('option', { name: 'C++' }))

    expect(editor.updateBlock).toHaveBeenCalledWith('code-block-1', {
      props: { language: 'cpp' },
    })
  })
})

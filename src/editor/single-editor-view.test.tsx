import {
  createEditor,
  getSingleEditorViewTestState,
  mockOpenExternalUrl,
  mockOpenLocalFile,
} from './single-editor-view.test-utils'
import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SingleEditorView } from './single-editor-view'
import { TooltipProvider } from '@/ui/tooltip'

const state = getSingleEditorViewTestState()

describe('SingleEditorView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    state.capturedLinkToolbarProps = null
    state.capturedToolbarProps = null
    state.capturedSuggestionProps = {}
    state.capturedImageDropArgs = null
    state.capturedBlockNoteOnChange = null
    state.blockNoteViewError = null
    state.blockNoteViewErrorOnce = false
    state.imageDropState.isDragOver = false
    mockOpenExternalUrl.mockClear()
    mockOpenLocalFile.mockClear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.classList.remove('dark')
    delete window.__plumoTest
  })

  it('repairs the live editor document before remounting after a stale missing-id block error', async () => {
    state.blockNoteViewError = new Error("Block doesn't have id")
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const editor = createEditor()
    editor.document = [
      {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Recovered body', styles: {} }],
        children: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Recovered child', styles: {} }],
            children: [],
          },
        ],
      },
    ]

    try {
      render(
        <SingleEditorView
          editor={editor as never}
          onNavigateWikilink={vi.fn()}
        />,
        { wrapper: TooltipProvider, onRecoverableError: () => {} },
      )

      await waitFor(() => {
        expect(screen.getByTestId('blocknote-view')).toBeInTheDocument()
      })
      expect(screen.getByTestId('blocknote-view')).toHaveAttribute('data-editable', 'true')
      expect(editor.replaceBlocks).toHaveBeenCalledTimes(1)
      expect(editor.replaceBlocks.mock.calls[0][1]).toEqual([
        expect.objectContaining({
          id: expect.any(String),
          children: [],
        }),
        expect.objectContaining({
          id: expect.any(String),
          content: [{ type: 'text', text: 'Recovered child', styles: {} }],
          children: [],
        }),
      ])
    } finally {
      consoleError.mockRestore()
    }
  })

  it('remounts after a BlockNote table row index render error', async () => {
    state.blockNoteViewError = new RangeError(
      'Index 1 out of range for <tableRow(tableCell(tableParagraph("A")))>',
    )
    state.blockNoteViewErrorOnce = true
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const editor = createEditor()

    try {
      render(
        <SingleEditorView
          editor={editor as never}
          onNavigateWikilink={vi.fn()}
        />,
        { wrapper: TooltipProvider, onRecoverableError: () => {} },
      )

      await waitFor(() => {
        expect(screen.getByTestId('blocknote-view')).toBeInTheDocument()
      })
      expect(screen.getByTestId('blocknote-view')).toHaveAttribute('data-editable', 'true')
      expect(editor.replaceBlocks).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('registers the seeded BlockNote test bridge, applies column widths, and cleans it up on unmount', async () => {
    const editor = createEditor()
    const { unmount } = render(
      <SingleEditorView
        editor={editor as never}
        onNavigateWikilink={vi.fn()}
      />,
    )

    expect(typeof window.__plumoTest?.seedBlockNoteTable).toBe('function')

    await act(async () => {
      await window.__plumoTest?.seedBlockNoteTable?.([120, null, 80])
    })

    expect(editor.blocksToHTMLLossy).toHaveBeenCalledWith([
      expect.objectContaining({
        type: 'table',
        content: expect.objectContaining({
          type: 'tableContent',
          columnWidths: [120, null, 80],
        }),
      }),
      expect.objectContaining({ type: 'paragraph' }),
    ])
    expect(editor._tiptapEditor.commands.setContent).toHaveBeenCalledWith('<table>seeded</table>')
    expect(editor.focus).toHaveBeenCalled()

    unmount()

    expect(window.__plumoTest?.seedBlockNoteTable).toBeUndefined()
  })

  it('shows the drag overlay and inserts dropped images, in order, beside the block they were dropped on', () => {
    state.imageDropState.isDragOver = true
    const editor = createEditor()
    const headingBlock = editor.document[0]
    editor.getBlock.mockImplementation((id: string) => (id === headingBlock.id ? headingBlock : null) as never)

    render(
      <SingleEditorView
        editor={editor as never}
        onNavigateWikilink={vi.fn()}
        vaultPath="/vault"
      />,
    )

    expect(screen.getByText('Drop image here')).toBeInTheDocument()

    act(() => {
      (state.capturedImageDropArgs?.onImagesDropped as (urls: string[], target: unknown) => void)(
        ['https://example.com/one.png', 'https://example.com/two.png'],
        { blockId: headingBlock.id, placement: 'before' },
      )
    })

    expect(editor.insertBlocks).toHaveBeenCalledWith(
      [
        { type: 'image', props: { url: 'https://example.com/one.png' } },
        { type: 'image', props: { url: 'https://example.com/two.png' } },
      ],
      headingBlock,
      'before',
    )
  })

  it('wires the toolbar mouse guard', () => {
    const editor = createEditor()
    render(
      <SingleEditorView
        editor={editor as never}
        onNavigateWikilink={vi.fn()}
      />,
    )

    expect(state.hoverGuardMock).toHaveBeenCalledOnce()
    expect(state.linkActivationMock).toHaveBeenCalledOnce()
    expect(screen.getByTestId('blocknote-view')).toHaveAttribute('data-link-toolbar', 'false')
    expect(state.capturedLinkToolbarProps).toEqual(expect.objectContaining({
      linkToolbar: expect.any(Function),
      floatingUIOptions: expect.objectContaining({
        elementProps: expect.objectContaining({
          onMouseDownCapture: expect.any(Function),
        }),
      }),
    }))

    const onMouseDownCapture = (
      (state.capturedToolbarProps?.floatingUIOptions as { elementProps: { onMouseDownCapture: (event: { target: HTMLElement; preventDefault: () => void }) => void } })
    ).elementProps.onMouseDownCapture
    const menuTrigger = document.createElement('button')
    menuTrigger.setAttribute('aria-haspopup', 'menu')
    const menuPreventDefault = vi.fn()
    onMouseDownCapture({ target: menuTrigger, preventDefault: menuPreventDefault })
    expect(menuPreventDefault).not.toHaveBeenCalled()

    const normalTarget = document.createElement('div')
    const normalPreventDefault = vi.fn()
    onMouseDownCapture({ target: normalTarget, preventDefault: normalPreventDefault })
    expect(normalPreventDefault).toHaveBeenCalledOnce()

    const linkToolbarMouseDownCapture = (
      (state.capturedLinkToolbarProps?.floatingUIOptions as { elementProps: { onMouseDownCapture: (event: { target: HTMLElement; preventDefault: () => void }) => void } })
    ).elementProps.onMouseDownCapture
    const linkInput = document.createElement('input')
    const linkInputPreventDefault = vi.fn()
    linkToolbarMouseDownCapture({ target: linkInput, preventDefault: linkInputPreventDefault })
    expect(linkInputPreventDefault).not.toHaveBeenCalled()

    const linkActionTarget = document.createElement('button')
    const linkActionPreventDefault = vi.fn()
    linkToolbarMouseDownCapture({ target: linkActionTarget, preventDefault: linkActionPreventDefault })
    expect(linkActionPreventDefault).toHaveBeenCalledOnce()
  })

  it('passes the active document theme to BlockNote', () => {
    document.documentElement.setAttribute('data-theme', 'dark')
    document.documentElement.classList.add('dark')

    render(
      <SingleEditorView
        editor={createEditor() as never}
        onNavigateWikilink={vi.fn()}
      />,
    )

    expect(screen.getByTestId('blocknote-view')).toHaveAttribute('theme', 'dark')
  })

})

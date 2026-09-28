import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

const COVERAGE_SHARD_TEST_TIMEOUT_MS = 30_000

const {
  blockHasTypeMock,
  editorHasBlockWithTypeMock,
  formattingToolbarStore,
  hoverGuardMock,
  showSelectionExtension,
  showSelectionMock,
  positionPopoverState,
  showState,
  useBlockNoteEditorMock,
} = vi.hoisted(() => ({
  blockHasTypeMock: vi.fn(() => true),
  editorHasBlockWithTypeMock: vi.fn(() => true),
  formattingToolbarStore: { setState: vi.fn() },
  hoverGuardMock: vi.fn(),
  showSelectionExtension: Symbol('ShowSelectionExtension'),
  showSelectionMock: vi.fn(),
  positionPopoverState: { lastProps: null as null | Record<string, unknown> },
  showState: { value: true },
  useBlockNoteEditorMock: vi.fn(),
}))

function MockIcon() {
  return <svg data-testid="mock-icon" />
}

vi.mock('@blocknote/react', () => ({
  FormattingToolbar: ({ children }: { children?: ReactNode }) => (
    <div data-testid="mock-formatting-toolbar">{children}</div>
  ),
  getFormattingToolbarItems: () => [
    <div key="blockTypeSelect" />,
    <div key="boldStyleButton" />,
    <div key="italicStyleButton" />,
    <div key="strikeStyleButton" />,
    <div key="fileDownloadButton" />,
    <div key="nestBlockButton" />,
    <div key="unnestBlockButton" />,
    <div key="createLinkButton" />,
  ],
  EditLinkMenuItems: () => <div data-testid="mock-link-form" />,
  useComponentsContext: () => ({
    Generic: {
      Popover: {
        Root: ({ children, open }: { children?: ReactNode; open?: boolean }) => <div data-testid="mock-link-popover" data-open={open}>{children}</div>,
        Trigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
        Content: ({ children }: { children?: ReactNode }) => <>{children}</>,
      },
    },
  }),
  PositionPopover: (props: Record<string, unknown> & { children?: ReactNode }) => {
    positionPopoverState.lastProps = props
    return <div data-testid="mock-position-popover">{props.children}</div>
  },
  useBlockNoteEditor: useBlockNoteEditorMock,
  useDictionary: () => ({
    formatting_toolbar: {
      file_download: {
        tooltip: {
          file: 'Download file',
          image: 'Download image',
        },
      },
      link: { tooltip: 'Create link' },
      nest: { tooltip: 'Nest block' },
      unnest: { tooltip: 'Unnest block' },
    },
  }),
  useEditorState: ({ editor, selector }: { editor: unknown; selector: (context: { editor: unknown }) => unknown }) => selector({ editor }),
  useExtension: (extension: unknown) => (
    extension === showSelectionExtension
      ? { showSelection: showSelectionMock }
      : { store: formattingToolbarStore }
  ),
  useExtensionState: () => showState.value,
}))

vi.mock('@blocknote/core', () => ({
  blockHasType: blockHasTypeMock,
  createExtension: (factory: unknown) => factory,
  defaultProps: { textAlignment: 'left' },
  editorHasBlockWithType: editorHasBlockWithTypeMock,
  isTableCellSelection: () => false,
}))

vi.mock('@blocknote/core/extensions', () => ({
  FormattingToolbarExtension: Symbol('FormattingToolbarExtension'),
  ShowSelectionExtension: showSelectionExtension,
}))

vi.mock('@/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: ReactNode }) => <div data-testid="block-type-menu">{children}</div>,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuContent: ({ children, onCloseAutoFocus, ...props }: { children?: ReactNode; onCloseAutoFocus?: unknown }) => {
    void onCloseAutoFocus
    return <div {...props}>{children}</div>
  },
  DropdownMenuItem: ({ children, ...props }: { children?: ReactNode }) => <button type="button" {...props}>{children}</button>,
}))

vi.mock('@/ui/tooltip', () => ({
  Tooltip: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  TooltipContent: () => null,
}))

vi.mock('@phosphor-icons/react', () => ({
  ArrowSquareOut: MockIcon,
  CaretDown: MockIcon,
  Check: MockIcon,
  Code: MockIcon,
  CodeBlock: MockIcon,
  Highlighter: MockIcon,
  LinkSimple: MockIcon,
  ListBullets: MockIcon,
  ListChecks: MockIcon,
  ListNumbers: MockIcon,
  Paragraph: MockIcon,
  Quotes: MockIcon,
  TextB: MockIcon,
  TextHFive: MockIcon,
  TextHFour: MockIcon,
  TextHOne: MockIcon,
  TextHSix: MockIcon,
  TextHThree: MockIcon,
  TextHTwo: MockIcon,
  TextIndent: MockIcon,
  TextItalic: MockIcon,
  TextOutdent: MockIcon,
  TextStrikethrough: MockIcon,
}))

vi.mock('./block-note-formatting-toolbar-hover-guard', () => ({
  useBlockNoteFormattingToolbarHoverGuard: hoverGuardMock,
}))

vi.mock('@/platform/url', () => ({
  normalizeExternalUrl: vi.fn((url: string) => url),
  openExternalUrl: vi.fn().mockResolvedValue(undefined),
  openLocalFile: vi.fn().mockResolvedValue(undefined),
}))

import { openLocalFile } from '@/platform/url'
import { FormattingToolbar } from './formatting-toolbar'
import { FormattingToolbarController } from './formatting-toolbar-controller'
import { useToolbarMenu } from './toolbar-menu-state'

const mockOpenLocalFile = vi.mocked(openLocalFile)

function createMockEditor(blockType = 'image', props: Record<string, unknown> = {}) {
  const selectedBlock = {
    id: 'file-block',
    type: blockType,
    props: { textAlignment: 'center', level: 1, ...props },
    content: [{ type: 'text', text: 'Selected block' }],
  }
  const domElement = document.createElement('div')
  domElement.appendChild(document.createElement('div'))
  document.body.appendChild(domElement)

  return {
    isEditable: true,
    schema: {
      styleSchema: {
        bold: { type: 'bold', propSchema: 'boolean' },
        italic: { type: 'italic', propSchema: 'boolean' },
        strike: { type: 'strike', propSchema: 'boolean' },
        code: { type: 'code', propSchema: 'boolean' },
        highlight: { type: 'highlight', propSchema: 'boolean' },
      },
      inlineContentSchema: { link: 'link' },
    },
    canNestBlock: () => true,
    canUnnestBlock: () => false,
    nestBlock: vi.fn(),
    unnestBlock: vi.fn(),
    getSelectedLinkUrl: () => undefined,
    getSelectedText: () => 'Selected block',
    prosemirrorState: { doc: { content: { size: 0 } }, selection: { from: 1, to: 5 } },
    domElement,
    focus: vi.fn(),
    removeStyles: vi.fn(),
    getActiveStyles: () => ({ bold: true }),
    getBlock: vi.fn((id: string) => (id === selectedBlock.id ? selectedBlock : undefined)),
    getSelection: () => ({ blocks: [selectedBlock] }),
    getTextCursorPosition: () => ({ block: selectedBlock }),
    toggleStyles: vi.fn(),
    transact: vi.fn((callback: () => void) => callback()),
    updateBlock: vi.fn(),
  }
}

describe('the formatting toolbar and its controller', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ''
    positionPopoverState.lastProps = null
    showState.value = true
    useBlockNoteEditorMock.mockReturnValue(createMockEditor())
  })

  it('renders toolbar controls, inserts the inline code button, and updates block types', () => {
    const editor = createMockEditor('paragraph')
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<FormattingToolbar />)

    fireEvent.click(screen.getByRole('button', { name: /bold/i }))
    fireEvent.click(screen.getByRole('button', { name: /inline code/i }))
    fireEvent.click(screen.getByRole('button', { name: 'Highlight' }))
    fireEvent.click(screen.getByRole('button', { name: 'Heading 1' }))
    fireEvent.click(screen.getByRole('button', { name: 'Nest block' }))

    expect(editor.focus).toHaveBeenCalled()
    expect(editor.nestBlock).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Unnest block' })).toBeDisabled()
    expect(editor.toggleStyles).toHaveBeenCalledWith({ bold: true })
    expect(editor.toggleStyles).toHaveBeenCalledWith({ code: true })
    // The highlight toggle goes through the highlight model: colour mark off, then the style.
    expect(editor.removeStyles).toHaveBeenCalledWith({ backgroundColor: 'default' })
    expect(editor.toggleStyles).toHaveBeenCalledWith({ highlight: true })
    expect(screen.getByRole('button', { name: 'Choose highlight color' })).toBeInTheDocument()
    expect(editor.transact).toHaveBeenCalledTimes(1)
    expect(editor.updateBlock).toHaveBeenCalledWith(
      'file-block',
      { type: 'heading', props: { level: 1 } },
    )
  })

  it('ignores stale block-type clicks when the selected block disappeared before the action', () => {
    const editor = createMockEditor('paragraph')
    editor.getBlock.mockImplementation(() => {
      throw new Error('Block with ID file-block not found')
    })
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<FormattingToolbar />)

    expect(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Heading 1' }))
    }).not.toThrow()
    expect(editor.transact).not.toHaveBeenCalled()
    expect(editor.updateBlock).not.toHaveBeenCalled()
  }, COVERAGE_SHARD_TEST_TIMEOUT_MS)

  it('opens selected file blocks through the active vault path', () => {
    const editor = createMockEditor('file', {
      url: 'asset://localhost/%2Fvault%2Fattachments%2Freport.pdf',
    })
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<FormattingToolbar vaultPath="/vault" />)

    fireEvent.click(screen.getByRole('button', { name: 'Download file' }))

    expect(editor.focus).toHaveBeenCalled()
    expect(mockOpenLocalFile).toHaveBeenCalledWith('/vault/attachments/report.pdf', '/vault')
  })

  it('controls the floating toolbar placement, hover guard, and escape-key close behavior', () => {
    const editor = createMockEditor()
    const toolbarComponent = () => <div data-testid="custom-toolbar">Toolbar</div>
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(
      <FormattingToolbarController
        formattingToolbar={toolbarComponent}
        floatingUIOptions={{ useFloatingOptions: { placement: 'top-start' } }}
      />,
    )

    expect(screen.getByTestId('custom-toolbar')).toBeInTheDocument()
    expect(hoverGuardMock).toHaveBeenCalledWith({
      editor,
      container: editor.domElement,
      selectedFileBlockId: 'file-block',
      isOpen: true,
    })
    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      position: { from: 1, to: 5 },
      useFloatingOptions: expect.objectContaining({
        open: true,
        placement: 'top-start',
      }),
    }))

    const onOpenChange = positionPopoverState.lastProps?.useFloatingOptions as {
      onOpenChange: (open: boolean, event: unknown, reason?: string) => void
    }

    onOpenChange.onOpenChange(false, undefined, 'escape-key')

    expect(formattingToolbarStore.setState).toHaveBeenCalledWith(false)
    expect(editor.focus).toHaveBeenCalledTimes(1)
  })

  it('uses block alignment when deciding the floating placement', () => {
    const editor = createMockEditor()
    editor.getTextCursorPosition = () => ({
      block: {
        id: 'paragraph-block',
        type: 'paragraph',
        props: { textAlignment: 'right' },
        content: [{ type: 'text', text: 'Paragraph' }],
      },
    })
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<FormattingToolbarController />)

    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      useFloatingOptions: expect.objectContaining({
        placement: 'top-end',
      }),
    }))
  })

  it('adds viewport-clamping middleware and preserves caller middleware', () => {
    const editor = createMockEditor('paragraph')
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(
      <FormattingToolbarController
        floatingUIOptions={{
          useFloatingOptions: {
            middleware: [{ name: 'custom-middleware' } as never],
          },
        }}
      />,
    )

    const floatingOptions = positionPopoverState.lastProps?.useFloatingOptions as {
      middleware: Array<{ name: string }>
    }

    expect(floatingOptions.middleware.map((middleware) => middleware.name)).toEqual(
      expect.arrayContaining(['custom-middleware', 'viewportClamp']),
    )
  })

  it('falls back to top-start and focuses the block type trigger on mouse down', () => {
    const editor = createMockEditor('paragraph')
    const focusSpy = vi.spyOn(HTMLButtonElement.prototype, 'focus').mockImplementation(() => {})

    blockHasTypeMock.mockReturnValue(false)
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<FormattingToolbarController />)
    fireEvent.mouseDown(screen.getAllByRole('button', { name: 'Paragraph' })[0] as HTMLButtonElement)

    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      useFloatingOptions: expect.objectContaining({
        placement: 'top-start',
      }),
    }))
    expect(focusSpy).toHaveBeenCalled()

    focusSpy.mockRestore()
  })

  it('keeps the toolbar open during close grace and clears the timeout on unmount', () => {
    vi.useFakeTimers()
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
    const editor = createMockEditor('paragraph')

    useBlockNoteEditorMock.mockReturnValue(editor)

    const { rerender, unmount } = render(<FormattingToolbarController />)

    showState.value = false
    rerender(<FormattingToolbarController />)

    expect(screen.getByTestId('mock-position-popover')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(50)
    })

    unmount()

    expect(clearTimeoutSpy).toHaveBeenCalled()

    clearTimeoutSpy.mockRestore()
    vi.useRealTimers()
  })

  it('ignores internal pointer and focus transitions before closing on external blur', () => {
    const editor = createMockEditor('paragraph')
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(
      <FormattingToolbarController
        formattingToolbar={() => <button data-testid="toolbar-action" type="button">Toolbar</button>}
      />,
    )

    const toolbarWrapper = screen.getByTestId('toolbar-action').parentElement as HTMLElement

    fireEvent.pointerEnter(toolbarWrapper)
    fireEvent.pointerLeave(toolbarWrapper, { relatedTarget: screen.getByTestId('toolbar-action') })
    fireEvent.focus(toolbarWrapper)
    fireEvent.blur(toolbarWrapper, { relatedTarget: screen.getByTestId('toolbar-action') })

    expect(screen.getByTestId('toolbar-action')).toBeInTheDocument()

    fireEvent.pointerLeave(toolbarWrapper, { relatedTarget: document.body })
    fireEvent.blur(toolbarWrapper, { relatedTarget: document.body })

    expect(formattingToolbarStore.setState).toHaveBeenCalledWith(false)
  })

  it('keeps the toolbar when focus moves into a menu a toolbar trigger controls', () => {
    useBlockNoteEditorMock.mockReturnValue(createMockEditor('paragraph'))
    const menu = document.createElement('div')
    menu.id = 'toolbar-menu'
    menu.setAttribute('role', 'menu')
    const menuItem = document.createElement('button')
    menu.appendChild(menuItem)
    document.body.appendChild(menu)

    render(
      <FormattingToolbarController
        formattingToolbar={() => (
          <button aria-controls="toolbar-menu" aria-expanded="true" data-testid="toolbar-action" type="button">Toolbar</button>
        )}
      />,
    )
    const toolbarWrapper = screen.getByTestId('toolbar-action').parentElement as HTMLElement

    fireEvent.focus(toolbarWrapper)
    fireEvent.blur(toolbarWrapper, { relatedTarget: menuItem })
    fireEvent.pointerLeave(toolbarWrapper, { relatedTarget: menuItem })

    expect(formattingToolbarStore.setState).not.toHaveBeenCalledWith(false)
  })

  it('keeps the toolbar when a choice in one of its menus hands the focus back to the editor', () => {
    const editor = createMockEditor('paragraph')
    useBlockNoteEditorMock.mockReturnValue(editor)
    function MenuToolbar() {
      const menu = useToolbarMenu('highlightColor')
      return (
        <button data-testid="toolbar-action" onClick={() => menu.setOpened(true)} type="button">
          {menu.opened ? 'open' : 'closed'}
        </button>
      )
    }

    render(<FormattingToolbarController formattingToolbar={MenuToolbar} />)
    const toolbarWrapper = screen.getByTestId('toolbar-action').parentElement as HTMLElement

    fireEvent.focus(toolbarWrapper)
    fireEvent.click(screen.getByTestId('toolbar-action'))
    expect(screen.getByTestId('toolbar-action')).toHaveTextContent('open')

    // The choice acts on the editor and focuses it: the menu closes, the toolbar stays.
    fireEvent.blur(toolbarWrapper, { relatedTarget: editor.domElement })
    fireEvent.focusIn(editor.domElement)

    expect(screen.getByTestId('toolbar-action')).toHaveTextContent('closed')
    expect(formattingToolbarStore.setState).not.toHaveBeenCalledWith(false)

    // With no menu open, the same focus move is focus leaving the toolbar.
    fireEvent.focus(toolbarWrapper)
    fireEvent.blur(toolbarWrapper, { relatedTarget: editor.domElement })
    expect(formattingToolbarStore.setState).toHaveBeenCalledWith(false)
  })

  it('closes the toolbar when focus lands outside without a blur, as when the focused link form unmounts', () => {
    const editor = createMockEditor('paragraph')
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(
      <FormattingToolbarController
        formattingToolbar={() => <button data-testid="toolbar-action" type="button">Toolbar</button>}
      />,
    )
    const toolbarWrapper = screen.getByTestId('toolbar-action').parentElement as HTMLElement

    fireEvent.focus(toolbarWrapper)
    expect(formattingToolbarStore.setState).not.toHaveBeenCalledWith(false)

    fireEvent.focusIn(editor.domElement)

    expect(formattingToolbarStore.setState).toHaveBeenCalledWith(false)
  })

  it('drops the hover hold when the pointer turns up outside without a leave', () => {
    vi.useFakeTimers()
    const editor = createMockEditor('paragraph')
    useBlockNoteEditorMock.mockReturnValue(editor)

    const { rerender } = render(
      <FormattingToolbarController
        formattingToolbar={() => <button data-testid="toolbar-action" type="button">Toolbar</button>}
      />,
    )
    const toolbarWrapper = screen.getByTestId('toolbar-action').parentElement as HTMLElement
    fireEvent.pointerEnter(toolbarWrapper)
    showState.value = false
    rerender(<FormattingToolbarController formattingToolbar={() => <button data-testid="toolbar-action" type="button">Toolbar</button>} />)
    expect(screen.getByTestId('toolbar-action')).toBeInTheDocument()

    fireEvent.pointerOver(editor.domElement)
    act(() => {
      vi.advanceTimersByTime(200)
    })

    expect(screen.queryByTestId('toolbar-action')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('deduplicates floating toolbar store writes during close races', () => {
    const editor = createMockEditor('paragraph')
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(
      <FormattingToolbarController
        formattingToolbar={() => <button data-testid="toolbar-action" type="button">Toolbar</button>}
      />,
    )

    const toolbarWrapper = screen.getByTestId('toolbar-action').parentElement as HTMLElement
    const floatingOptions = positionPopoverState.lastProps?.useFloatingOptions as {
      onOpenChange: (open: boolean, event: unknown, reason?: string) => void
    }

    floatingOptions.onOpenChange(true, undefined)
    floatingOptions.onOpenChange(false, undefined)
    floatingOptions.onOpenChange(false, undefined)
    fireEvent.blur(toolbarWrapper, { relatedTarget: document.body })

    expect(formattingToolbarStore.setState).toHaveBeenCalledTimes(1)
    expect(formattingToolbarStore.setState).toHaveBeenCalledWith(false)
  })

  it('hides the floating toolbar while the editor is composing IME text', () => {
    vi.useFakeTimers()
    try {
      const editor = createMockEditor('paragraph')
      const editorInput = editor.domElement.firstElementChild as HTMLElement

      useBlockNoteEditorMock.mockReturnValue(editor)

      render(<FormattingToolbarController />)

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: { from: 1, to: 5 },
        useFloatingOptions: expect.objectContaining({ open: true }),
      }))

      act(() => {
        fireEvent.compositionStart(editorInput)
      })

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: undefined,
        useFloatingOptions: expect.objectContaining({ open: false }),
      }))

      act(() => {
        fireEvent.compositionEnd(editorInput)
      })

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: undefined,
        useFloatingOptions: expect.objectContaining({ open: false }),
      }))

      act(() => {
        vi.advanceTimersByTime(250)
      })

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: { from: 1, to: 5 },
        useFloatingOptions: expect.objectContaining({ open: true }),
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the floating toolbar hidden through rapid Zhuyin composition settle cycles', () => {
    vi.useFakeTimers()
    try {
      const editor = createMockEditor('paragraph')
      const editorInput = editor.domElement.firstElementChild as HTMLElement

      useBlockNoteEditorMock.mockReturnValue(editor)

      render(<FormattingToolbarController />)

      act(() => {
        fireEvent.compositionStart(editorInput)
        fireEvent.compositionEnd(editorInput)
      })

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: undefined,
        useFloatingOptions: expect.objectContaining({ open: false }),
      }))

      act(() => {
        vi.advanceTimersByTime(120)
        fireEvent.compositionStart(editorInput)
        fireEvent.compositionEnd(editorInput)
      })

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: undefined,
        useFloatingOptions: expect.objectContaining({ open: false }),
      }))

      act(() => {
        vi.advanceTimersByTime(249)
      })

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: undefined,
        useFloatingOptions: expect.objectContaining({ open: false }),
      }))

      act(() => {
        vi.advanceTimersByTime(1)
      })

      expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
        position: { from: 1, to: 5 },
        useFloatingOptions: expect.objectContaining({ open: true }),
      }))
    } finally {
      vi.useRealTimers()
    }
  })

  it('ignores composition events that start outside the editor', () => {
    const editor = createMockEditor('paragraph')
    const outsideInput = document.createElement('input')
    document.body.appendChild(outsideInput)

    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<FormattingToolbarController />)

    act(() => {
      fireEvent.compositionStart(outsideInput)
    })

    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      position: { from: 1, to: 5 },
      useFloatingOptions: expect.objectContaining({ open: true }),
    }))
  })

  it('binds composition listeners after BlockNote provides its editor element', () => {
    const editor = createMockEditor('paragraph')
    const lateEditorElement = editor.domElement
    const editorInput = lateEditorElement.firstElementChild as HTMLElement

    editor.domElement = undefined as unknown as HTMLElement
    useBlockNoteEditorMock.mockReturnValue(editor)

    const { rerender } = render(<FormattingToolbarController />)

    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      position: undefined,
      useFloatingOptions: expect.objectContaining({ open: false }),
    }))

    editor.domElement = lateEditorElement
    rerender(<FormattingToolbarController />)

    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      position: { from: 1, to: 5 },
      useFloatingOptions: expect.objectContaining({ open: true }),
    }))

    act(() => {
      fireEvent.compositionStart(editorInput)
    })

    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      position: undefined,
      useFloatingOptions: expect.objectContaining({ open: false }),
    }))
  })

  it('does not open the floating toolbar when the editor anchor element is unavailable', () => {
    const editor = createMockEditor()
    editor.domElement = document.createElement('div')
    useBlockNoteEditorMock.mockReturnValue(editor)

    render(<FormattingToolbarController />)

    expect(positionPopoverState.lastProps).toEqual(expect.objectContaining({
      position: undefined,
      useFloatingOptions: expect.objectContaining({
        open: false,
      }),
    }))
  })

  it('stays stable when BlockNote selection reads throw during inline action churn', () => {
    const editor = createMockEditor('paragraph')
    const selectionError = new RangeError('Index 0 out of range for <>')

    editor.getSelection = vi.fn(() => {
      throw selectionError
    })
    editor.getTextCursorPosition = vi.fn(() => {
      throw selectionError
    })
    useBlockNoteEditorMock.mockReturnValue(editor)

    expect(() => {
      render(
        <>
          <FormattingToolbar />
          <FormattingToolbarController />
        </>,
      )
    }).not.toThrow()
  })

  it('stays stable when BlockNote exposes malformed selection blocks during remount churn', () => {
    const editor = createMockEditor('paragraph')

    editor.getSelection = vi.fn(() => ({
      blocks: [undefined, { id: 'partial-block' }],
    }) as never)
    editor.getTextCursorPosition = vi.fn(() => ({
      block: undefined,
    }) as never)
    useBlockNoteEditorMock.mockReturnValue(editor)

    expect(() => {
      render(
        <>
          <FormattingToolbar />
          <FormattingToolbarController />
        </>,
      )
    }).not.toThrow()
  })
})

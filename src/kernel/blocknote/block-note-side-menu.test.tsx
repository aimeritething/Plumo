import { fireEvent, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  appendBlockOuters,
  blockElement,
  cleanupSideMenuTest,
  collapsedSectionStyleText,
  dispatchHandlePointerReorder,
  dispatchPointerEvent,
  dragHandleMenuEntries,
  expectCollapsedSectionStyleNotToTarget,
  expectCollapsedSectionStyleToTarget,
  headingBlock,
  installPointerEventSupport,
  listItemBlock,
  mockEditor,
  mockSideMenu,
  mockSuggestionMenu,
  placeEditorInScrollArea,
  rect,
  renderPointerReorderFixture,
  renderSideMenuAndCollapseControllerWithBlock,
  renderSideMenuWithBlock,
  requireParentElement,
  rootSideMenuButtonText,
  setupSideMenuTest,
  sideMenuBlock,
  staleBlockError,
  testBlock,
  turnIntoButtonLabels,
} from './block-note-side-menu.test-utils'

beforeAll(installPointerEventSupport)

describe('SideMenu', () => {
  beforeEach(setupSideMenuTest)
  afterEach(cleanupSideMenuTest)

  it('replaces BlockNote block colors with markdown-safe drag-handle items', () => {
    mockEditor.getBlock.mockReturnValue(sideMenuBlock)
    renderSideMenuWithBlock(sideMenuBlock)

    expect(screen.getByTestId('side-menu')).toBeInTheDocument()
    expect(rootSideMenuButtonText()).toEqual([
      'Add block',
      'Drag block',
      'Turn into…',
      'Duplicate',
      'Delete',
    ])
    expect(dragHandleMenuEntries()).toEqual(['Turn into…', 'Duplicate', '---', 'Delete'])
    expect(screen.getByText('Delete')).toHaveClass('text-chroma-red')

    expect(screen.getByText('Delete')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Turn into…' })).toHaveAttribute('aria-haspopup', 'menu')
    expect(screen.getByTestId('menu-sub-dropdown')).toHaveClass('min-w-0')
    for (const label of turnIntoButtonLabels) {
      expect(screen.getByTestId(`menu-item-icon-${label}`)).toBeInTheDocument()
    }
    expect(screen.queryByText('Colors')).not.toBeInTheDocument()
  })

  it('ignores add-block clicks when reload churn leaves the side menu with a stale block', () => {
    renderSideMenuWithBlock(sideMenuBlock)

    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Add block' }))).not.toThrow()
    expect(mockEditor.insertBlocks).not.toHaveBeenCalled()
    expect(mockEditor.setTextCursorPosition).not.toHaveBeenCalled()
    expect(mockSuggestionMenu.openSuggestionMenu).not.toHaveBeenCalled()
  })

  it('resolves the live block before adding a block after reload churn', () => {
    const staleBlock = { id: 'same-id', type: 'paragraph', content: [] }
    const liveBlock = { id: 'same-id', type: 'paragraph', content: ['fresh text'] }
    mockEditor.getBlock.mockReturnValue(liveBlock)

    renderSideMenuWithBlock(staleBlock)
    fireEvent.click(screen.getByRole('button', { name: 'Add block' }))

    expect(mockEditor.insertBlocks).toHaveBeenCalledWith([{ type: 'paragraph' }], liveBlock.id, 'after')
    expect(mockEditor.setTextCursorPosition).toHaveBeenCalledWith('inserted-block')
    expect(mockSuggestionMenu.openSuggestionMenu).toHaveBeenCalledWith('/')
  })

  it('keeps editor scroll stable when opening the add-block slash menu', async () => {
    const scrollArea = placeEditorInScrollArea(480)
    const liveBlock = { id: 'tail-block', type: 'paragraph', content: ['Tail text'] }
    mockEditor.getBlock.mockReturnValue(liveBlock)
    mockEditor.insertBlocks.mockImplementation(() => {
      scrollArea.scrollTop = 120
      return [{ id: 'inserted-block', type: 'paragraph', content: [] }]
    })
    mockEditor.setTextCursorPosition.mockImplementation(() => {
      scrollArea.scrollTop = 180
    })
    mockSuggestionMenu.openSuggestionMenu.mockImplementation(() => {
      queueMicrotask(() => {
        scrollArea.scrollTop = 240
      })
    })

    renderSideMenuWithBlock(liveBlock)
    const addBlockButton = screen.getByRole('button', { name: 'Add block' })
    fireEvent.click(addBlockButton)
    await Promise.resolve()

    expect(scrollArea.scrollTop).toBe(480)
  })

  it('ignores delete clicks when the side-menu block disappeared during a reload', () => {
    renderSideMenuWithBlock(sideMenuBlock)

    expect(() => fireEvent.click(screen.getByText('Delete'))).not.toThrow()
    expect(mockEditor.removeBlocks).not.toHaveBeenCalled()
  })

  it('resolves the live table block before toggling table headers', () => {
    const staleTable = {
      id: 'table-block',
      type: 'table',
      content: { type: 'tableContent', rows: [], headerRows: undefined },
    }
    const liveTable = {
      id: 'table-block',
      type: 'table',
      content: { type: 'tableContent', rows: [], headerRows: undefined },
    }
    mockEditor.getBlock.mockReturnValue(liveTable)

    renderSideMenuWithBlock(staleTable)
    expect(dragHandleMenuEntries()).toEqual(['Turn into…', 'Duplicate', '---', 'Header row', 'Header column', '---', 'Delete'])
    fireEvent.click(screen.getByText('Header row'))

    expect(mockEditor.updateBlock).toHaveBeenCalledWith(liveTable.id, {
      content: { ...liveTable.content, headerRows: 1 },
    })
  })

  it('turns a live side-menu block into another markdown-safe block type', () => {
    const liveBlock = {
      id: 'paragraph-block',
      type: 'paragraph',
      content: ['Existing text'],
      props: {},
      children: [],
    }
    mockEditor.getBlock.mockReturnValue(liveBlock)

    renderSideMenuWithBlock(liveBlock)
    fireEvent.click(screen.getByRole('button', { name: 'Heading 2' }))

    expect(mockEditor.focus).toHaveBeenCalledOnce()
    expect(mockEditor.updateBlock).toHaveBeenCalledWith(liveBlock.id, {
      type: 'heading',
      props: { level: 2 },
    })
  })

  it('ignores turn-into clicks when reload churn leaves a stale side-menu block', () => {
    renderSideMenuWithBlock(sideMenuBlock)

    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Heading 2' }))).not.toThrow()
    expect(mockEditor.updateBlock).not.toHaveBeenCalled()
  })

  it('hides table header actions when the live block lookup throws after reload churn', () => {
    const staleTable = {
      id: 'table-block',
      type: 'table',
      content: { type: 'tableContent', rows: [], headerRows: undefined },
    }
    mockEditor.getBlock.mockImplementation(() => {
      throw staleBlockError(staleTable)
    })

    expect(() => renderSideMenuWithBlock(staleTable)).not.toThrow()
    expect(screen.queryByText('Header row')).not.toBeInTheDocument()
  })

  it('ignores stale drag starts after reload churn', () => {
    renderSideMenuWithBlock(sideMenuBlock)

    expect(() => fireEvent.dragStart(screen.getByRole('button', { name: 'Drag block' }))).not.toThrow()
    expect(mockSideMenu.blockDragStart).not.toHaveBeenCalled()
  })

  it('reorders blocks with pointer movement instead of BlockNote HTML drag data', () => {
    const { draggedBlock, dragHandle, targetBlock } = renderPointerReorderFixture()

    dispatchHandlePointerReorder(dragHandle)

    expect(mockSideMenu.blockDragStart).not.toHaveBeenCalled()
    expect(mockEditor.focus).toHaveBeenCalled()
    expect(mockEditor.transact).toHaveBeenCalled()
    expect(mockEditor.removeBlocks).toHaveBeenCalledWith([draggedBlock.id])
    expect(mockEditor.insertBlocks).toHaveBeenCalledWith([draggedBlock], targetBlock.id, 'before')
  })

  it('ignores pointer reorders when a target block lookup throws after reload churn', () => {
    const { draggedBlock, dragHandle, targetBlock } = renderPointerReorderFixture()
    mockEditor.getBlock.mockImplementation((id: string) => {
      if (id === targetBlock.id) throw staleBlockError(id)
      return id === draggedBlock.id ? draggedBlock : undefined
    })

    expect(() => dispatchHandlePointerReorder(dragHandle)).not.toThrow()
    expect(mockEditor.removeBlocks).not.toHaveBeenCalled()
    expect(mockEditor.insertBlocks).not.toHaveBeenCalled()
  })

  it('ignores pointer reorders when the dragged block disappears during the final drop mutation', () => {
    const { draggedBlock, dragHandle } = renderPointerReorderFixture()
    const missingBlockError = staleBlockError(draggedBlock)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockEditor.removeBlocks.mockImplementation(() => {
      throw missingBlockError
    })

    expect(() => dispatchHandlePointerReorder(dragHandle)).not.toThrow()

    expect(mockEditor.removeBlocks).toHaveBeenCalledWith([draggedBlock.id])
    expect(mockEditor.insertBlocks).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledWith('[editor] Ignored stale block side-menu action:', missingBlockError)
    warn.mockRestore()
  })

  it('shows and clears pointer reorder affordances while dragging', () => {
    const { draggedElement, dragHandle } = renderPointerReorderFixture()

    dispatchPointerEvent(requireParentElement(dragHandle), 'pointerdown', { button: 0, clientX: 140, clientY: 90 })
    dispatchPointerEvent(document, 'pointermove', { clientX: 180, clientY: 122 })

    const preview = screen.getByTestId('editor-block-drag-preview')
    const indicator = screen.getByTestId('editor-block-drop-indicator')
    expect(preview).toHaveStyle({
      left: '160px',
      opacity: '0.72',
      top: '112px',
    })
    expect(indicator).toHaveStyle({
      display: 'block',
      left: '120px',
      top: '119px',
      width: '420px',
    })
    expect(draggedElement).toHaveStyle({ opacity: '0.35' })

    dispatchPointerEvent(document, 'pointerup', { clientX: 180, clientY: 122 })

    expect(screen.queryByTestId('editor-block-drag-preview')).not.toBeInTheDocument()
    expect(screen.queryByTestId('editor-block-drop-indicator')).not.toBeInTheDocument()
    // Dimmed by a style rule: ProseMirror redraws a block whose inline style changes.
    expect(draggedElement.style.opacity).toBe('')
    expect(draggedElement).not.toHaveStyle({ opacity: '0.35' })
    expect(document.querySelector('style[data-plumo-block-reorder]')).not.toBeInTheDocument()
  })

  it('shows the drop indicator beside the block at the pointer\'s height while the pointer is out in either margin', () => {
    const { draggedBlock, dragHandle, targetBlock } = renderPointerReorderFixture()
    const editorElement = mockEditor.domElement as HTMLElement
    // The editor (x 100–600) has side padding where no block is hit: the text column is x 120–540.
    editorElement.style.padding = '0 60px 0 20px'
    const targetElement = editorElement.querySelector(`[data-id="${targetBlock.id}"]`)
    document.elementsFromPoint = vi.fn((x: number, y: number) => (
      x >= 120 && x <= 540 && y >= 120 && y < 160 ? [targetElement!, editorElement] : [editorElement]
    ))

    dispatchPointerEvent(requireParentElement(dragHandle), 'pointerdown', { button: 0, clientX: 140, clientY: 90 })
    dispatchPointerEvent(document, 'pointermove', { clientX: 20, clientY: 130 })

    const indicator = screen.getByTestId('editor-block-drop-indicator')
    expect(indicator).toHaveStyle({ display: 'block', top: '119px' })

    dispatchPointerEvent(document, 'pointermove', { clientX: 1200, clientY: 150 })
    expect(indicator).toHaveStyle({ display: 'block', top: '159px' })

    dispatchPointerEvent(document, 'pointerup', { clientX: 1200, clientY: 150 })
    expect(mockEditor.insertBlocks).toHaveBeenCalledWith([draggedBlock], targetBlock.id, 'after')
  })

  it('carries a code block language control into the drag preview', () => {
    const { draggedElement, dragHandle } = renderPointerReorderFixture()
    const container = document.createElement('div')
    container.className = 'editor__blocknote-container'
    mockEditor.domElement.replaceWith(container)
    container.appendChild(mockEditor.domElement)
    const control = document.createElement('div')
    control.setAttribute('data-code-block-id', draggedElement.dataset.id ?? '')
    control.textContent = 'Shell'
    control.getBoundingClientRect = () => rect({ left: 136, top: 88, width: 60, height: 28 })
    const otherControl = document.createElement('div')
    otherControl.setAttribute('data-code-block-id', 'target-block')
    container.append(control, otherControl)

    dispatchPointerEvent(requireParentElement(dragHandle), 'pointerdown', { button: 0, clientX: 140, clientY: 90 })
    dispatchPointerEvent(document, 'pointermove', { clientX: 180, clientY: 122 })

    const carried = screen.getByTestId('editor-block-drag-preview').querySelectorAll('[data-code-block-id]')
    expect(carried).toHaveLength(1)
    expect(carried[0]).toHaveTextContent('Shell')
    expect(carried[0]).toHaveStyle({ left: '16px', top: '8px' })

    dispatchPointerEvent(document, 'pointerup', { clientX: 180, clientY: 122 })
    container.remove()
  })

  it('cancels a pointer reorder on Escape and leaves the document as it was', () => {
    const { draggedElement, dragHandle } = renderPointerReorderFixture()

    dispatchPointerEvent(requireParentElement(dragHandle), 'pointerdown', { button: 0, clientX: 140, clientY: 90 })
    dispatchPointerEvent(document, 'pointermove', { clientX: 180, clientY: 122 })
    const escape = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' })
    mockEditor.domElement.dispatchEvent(escape)

    expect(escape.defaultPrevented).toBe(true)
    expect(screen.queryByTestId('editor-block-drag-preview')).not.toBeInTheDocument()
    expect(screen.queryByTestId('editor-block-drop-indicator')).not.toBeInTheDocument()
    expect(document.querySelector('style[data-plumo-block-reorder]')).not.toBeInTheDocument()
    expect(draggedElement).not.toHaveStyle({ opacity: '0.35' })

    dispatchPointerEvent(document, 'pointermove', { clientX: 200, clientY: 140 })
    dispatchPointerEvent(document, 'pointerup', { clientX: 200, clientY: 140 })
    fireEvent.click(dragHandle)

    expect(screen.queryByTestId('editor-block-drag-preview')).not.toBeInTheDocument()
    expect(mockEditor.removeBlocks).not.toHaveBeenCalled()
    expect(mockEditor.insertBlocks).not.toHaveBeenCalled()
    expect(mockSideMenu.freezeMenu).not.toHaveBeenCalled()
  })

  it('leaves Escape alone while the handle has not started a drag', () => {
    const { dragHandle } = renderPointerReorderFixture()

    dispatchPointerEvent(requireParentElement(dragHandle), 'pointerdown', { button: 0, clientX: 80, clientY: 90 })
    const escape = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'Escape' })
    mockEditor.domElement.dispatchEvent(escape)
    dispatchPointerEvent(document, 'pointerup', { clientX: 80, clientY: 90 })

    expect(escape.defaultPrevented).toBe(false)
  })

  it('drops at the block under a still pointer after the editor scrolls', () => {
    const { draggedBlock, dragHandle } = renderPointerReorderFixture()
    const scrollArea = placeEditorInScrollArea(0)
    const laterBlock = testBlock('later-block', 'paragraph', ['Later'])
    const laterElement = blockElement(laterBlock.id, rect({ left: 120, top: 100, width: 420, height: 80 }))
    mockEditor.domElement.append(laterElement)
    const getBlock = mockEditor.getBlock.getMockImplementation()
    mockEditor.getBlock.mockImplementation((id: string) => (id === laterBlock.id ? laterBlock : getBlock?.(id)))

    dispatchPointerEvent(requireParentElement(dragHandle), 'pointerdown', { button: 0, clientX: 140, clientY: 90 })
    dispatchPointerEvent(document, 'pointermove', { clientX: 180, clientY: 130 })
    document.elementsFromPoint = vi.fn(() => [laterElement, mockEditor.domElement])
    scrollArea.dispatchEvent(new Event('scroll'))

    expect(screen.getByTestId('editor-block-drop-indicator')).toHaveStyle({ top: '99px' })

    dispatchPointerEvent(document, 'pointerup', { clientX: 180, clientY: 130 })

    expect(mockEditor.insertBlocks).toHaveBeenCalledWith([draggedBlock], laterBlock.id, 'before')
  })

  it('scrolls the editor while the dragged block is held near its top or bottom edge', () => {
    const { dragHandle } = renderPointerReorderFixture()
    const scrollArea = placeEditorInScrollArea(500)
    scrollArea.getBoundingClientRect = vi.fn(() => rect({ left: 100, top: 50, width: 500, height: 400 }))
    const frames: FrameRequestCallback[] = []
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => frames.push(callback))
    const cancelFrame = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
    const runFrame = () => frames.shift()?.(performance.now())

    dispatchPointerEvent(requireParentElement(dragHandle), 'pointerdown', { button: 0, clientX: 140, clientY: 90 })
    dispatchPointerEvent(document, 'pointermove', { clientX: 140, clientY: 200 })
    expect(frames).toHaveLength(0)

    dispatchPointerEvent(document, 'pointermove', { clientX: 140, clientY: 440 })
    runFrame()
    const slowStep = scrollArea.scrollTop - 500
    runFrame()
    expect(scrollArea.scrollTop).toBe(500 + slowStep * 2)

    dispatchPointerEvent(document, 'pointermove', { clientX: 140, clientY: 470 })
    const beforeFastStep = scrollArea.scrollTop
    runFrame()
    const fastStep = scrollArea.scrollTop - beforeFastStep
    expect(slowStep).toBeGreaterThan(0)
    expect(fastStep).toBeGreaterThan(slowStep)

    dispatchPointerEvent(document, 'pointermove', { clientX: 140, clientY: 60 })
    const beforeUpStep = scrollArea.scrollTop
    runFrame()
    expect(scrollArea.scrollTop).toBeLessThan(beforeUpStep)

    dispatchPointerEvent(document, 'pointermove', { clientX: 140, clientY: 200 })
    const settled = scrollArea.scrollTop
    runFrame()
    expect(scrollArea.scrollTop).toBe(settled)
    expect(frames).toHaveLength(0)

    dispatchPointerEvent(document, 'pointermove', { clientX: 140, clientY: 440 })
    dispatchPointerEvent(document, 'pointerup', { clientX: 140, clientY: 440 })
    expect(cancelFrame).toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('keeps click-to-open menu behavior when the handle does not move', () => {
    mockEditor.getBlock.mockReturnValue(sideMenuBlock)
    renderSideMenuWithBlock(sideMenuBlock)

    const dragHandle = screen.getByRole('button', { name: 'Drag block' })
    dispatchPointerEvent(requireParentElement(dragHandle), 'pointerdown', { button: 0, clientX: 80, clientY: 90 })
    dispatchPointerEvent(document, 'pointerup', { clientX: 80, clientY: 90 })
    fireEvent.click(dragHandle)

    expect(mockSideMenu.freezeMenu).toHaveBeenCalled()
  })

  it('ignores the button-less pointerdown the menu trigger dispatches on pointer up', () => {
    // BlockNote's shadcn menu trigger opens on pointer up by re-dispatching the
    // pointerup as a pointerdown; a gesture armed on it never sees a pointerup.
    const { dragHandle } = renderPointerReorderFixture()
    const handle = requireParentElement(dragHandle)

    dispatchPointerEvent(handle, 'pointerdown', { button: 0, clientX: 80, clientY: 90 })
    dispatchPointerEvent(document, 'pointerup', { clientX: 80, clientY: 90 })
    dispatchPointerEvent(handle, 'pointerdown', { button: 0, buttons: 0, clientX: 80, clientY: 90 })
    dispatchPointerEvent(document, 'pointermove', { clientX: 180, clientY: 122 })

    expect(screen.queryByTestId('editor-block-drag-preview')).not.toBeInTheDocument()
    expect(mockEditor.removeBlocks).not.toHaveBeenCalled()
  })

  it('suppresses the follow-up menu click after a pointer reorder', () => {
    const { dragHandle } = renderPointerReorderFixture()

    dispatchHandlePointerReorder(dragHandle)
    fireEvent.click(dragHandle)

    expect(mockSideMenu.freezeMenu).not.toHaveBeenCalled()
  })

  it('renders the heading collapse toggle before the drag handle', () => {
    const heading = headingBlock('heading-block', 2)
    mockEditor.document = [heading]
    mockEditor.getBlock.mockReturnValue(heading)

    renderSideMenuWithBlock(heading)

    expect(rootSideMenuButtonText()).toEqual([
      'Collapse section',
      'Drag block',
      'Turn into…',
      'Duplicate',
      'Delete',
    ])
  })

  it('swaps the heading collapse label for the expand label once collapsed', () => {
    const heading = headingBlock('heading-block', 2)
    mockEditor.document = [heading]
    appendBlockOuters([heading])
    mockEditor.getBlock.mockReturnValue(heading)

    renderSideMenuAndCollapseControllerWithBlock(heading)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse section' }))

    expect(screen.getByRole('button', { name: 'Expand section' })).toBeInTheDocument()
  })

  it('only renders the list item collapse toggle when a list item has children', () => {
    const leafListItem = listItemBlock('leaf-list-item')
    mockEditor.document = [leafListItem]
    mockEditor.getBlock.mockReturnValue(leafListItem)

    renderSideMenuWithBlock(leafListItem)

    expect(screen.getByRole('button', { name: 'Add block' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Collapse item' })).not.toBeInTheDocument()
  })

  it('renders the list item collapse toggle before the drag handle for list items with children', () => {
    const parentListItem = listItemBlock('parent-list-item', [listItemBlock('child-list-item')])
    mockEditor.document = [parentListItem]
    mockEditor.getBlock.mockReturnValue(parentListItem)

    renderSideMenuWithBlock(parentListItem)

    expect(rootSideMenuButtonText()).toEqual([
      'Collapse item',
      'Drag block',
      'Turn into…',
      'Duplicate',
      'Delete',
    ])
  })

  it('swaps the list item collapse label for the expand label once collapsed', () => {
    const childListItem = listItemBlock('child-list-item')
    const parentListItem = listItemBlock('parent-list-item', [childListItem])
    mockEditor.document = [parentListItem]
    appendBlockOuters([parentListItem])
    mockEditor.getBlock.mockImplementation((id: string) => (
      [parentListItem, childListItem].find((block) => block.id === id)
    ))

    renderSideMenuAndCollapseControllerWithBlock(parentListItem)

    fireEvent.click(screen.getByRole('button', { name: 'Collapse item' }))

    expect(screen.getByRole('button', { name: 'Expand item' })).toBeInTheDocument()
  })

  it('does not subscribe collapsed-heading rendering until something is collapsed', () => {
    const heading = headingBlock('heading', 2)
    const paragraph = testBlock('paragraph', 'paragraph', ['Text'])
    const blocks = [heading, paragraph]
    mockEditor.document = blocks
    appendBlockOuters(blocks)
    mockEditor.getBlock.mockImplementation((id: string) => blocks.find((block) => block.id === id))

    renderSideMenuAndCollapseControllerWithBlock(heading)

    expect(mockEditor.onChange).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Collapse section' }))

    expect(mockEditor.onChange).toHaveBeenCalledTimes(1)
  })

  it('removes collapsed-heading edit subscriptions after the final section is expanded', () => {
    const unsubscribeEditorChange = vi.fn()
    const heading = headingBlock('heading', 2)
    const paragraph = testBlock('paragraph', 'paragraph', ['Text'])
    const blocks = [heading, paragraph]
    mockEditor.document = blocks
    appendBlockOuters(blocks)
    mockEditor.getBlock.mockImplementation((id: string) => blocks.find((block) => block.id === id))
    mockEditor.onChange.mockReturnValue(unsubscribeEditorChange)

    renderSideMenuAndCollapseControllerWithBlock(heading)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse section' }))
    fireEvent.click(screen.getByRole('button', { name: 'Expand section' }))

    expect(unsubscribeEditorChange).toHaveBeenCalledTimes(1)
    expect(collapsedSectionStyleText()).toBe('')
  })

  it('hides a collapsed heading section until the next same-level heading', () => {
    const blocks = [
      headingBlock('heading', 2),
      testBlock('paragraph', 'paragraph', ['Text']),
      headingBlock('child-heading', 3),
      testBlock('child-paragraph', 'paragraph', ['More text']),
      headingBlock('next-heading', 2),
      testBlock('after-next-heading', 'paragraph', ['Visible text']),
    ]
    mockEditor.document = blocks
    appendBlockOuters(blocks)
    mockEditor.getBlock.mockImplementation((id: string) => blocks.find((block) => block.id === id))

    renderSideMenuAndCollapseControllerWithBlock(blocks[0])
    fireEvent.click(screen.getByRole('button', { name: 'Collapse section' }))

    expectCollapsedSectionStyleToTarget('heading')
    expectCollapsedSectionStyleToTarget('paragraph')
    expectCollapsedSectionStyleToTarget('child-heading')
    expectCollapsedSectionStyleToTarget('child-paragraph')
    expectCollapsedSectionStyleNotToTarget('next-heading')
    expectCollapsedSectionStyleNotToTarget('after-next-heading')
    expect(collapsedSectionStyleText()).toContain('display: none !important;')
    expect(collapsedSectionStyleText()).toContain('::after')
    expect(screen.getByRole('button', { name: 'Expand section' })).toBeInTheDocument()
  })

  it('collapses through a divider until the next same-level heading', () => {
    const blocks = [
      headingBlock('heading', 2),
      testBlock('paragraph', 'paragraph', ['Text']),
      testBlock('divider', 'divider', []),
      testBlock('after-divider', 'paragraph', ['More text']),
      headingBlock('next-heading', 2),
      testBlock('after-next-heading', 'paragraph', ['Visible text']),
    ]
    mockEditor.document = blocks
    appendBlockOuters(blocks)
    mockEditor.getBlock.mockImplementation((id: string) => blocks.find((block) => block.id === id))

    renderSideMenuAndCollapseControllerWithBlock(blocks[0])
    fireEvent.click(screen.getByRole('button', { name: 'Collapse section' }))

    expectCollapsedSectionStyleToTarget('paragraph')
    expectCollapsedSectionStyleToTarget('divider')
    expectCollapsedSectionStyleToTarget('after-divider')
    expectCollapsedSectionStyleNotToTarget('next-heading')
    expectCollapsedSectionStyleNotToTarget('after-next-heading')
  })

  it('collapses only the child subtree for list items with children', () => {
    const grandchild = listItemBlock('grandchild-list-item')
    const child = listItemBlock('child-list-item', [grandchild])
    const parent = listItemBlock('parent-list-item', [child])
    const sibling = listItemBlock('sibling-list-item')
    const blocks = [parent, sibling]
    mockEditor.document = blocks
    appendBlockOuters(blocks)
    mockEditor.getBlock.mockImplementation((id: string) => (
      [parent, child, grandchild, sibling].find((block) => block.id === id)
    ))

    renderSideMenuAndCollapseControllerWithBlock(parent)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse item' }))

    expectCollapsedSectionStyleToTarget('parent-list-item')
    expectCollapsedSectionStyleToTarget('child-list-item')
    expectCollapsedSectionStyleToTarget('grandchild-list-item')
    expectCollapsedSectionStyleNotToTarget('sibling-list-item')
    expect(screen.getByRole('button', { name: 'Expand item' })).toBeInTheDocument()
  })
})

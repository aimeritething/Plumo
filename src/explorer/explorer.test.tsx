import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { TooltipProvider } from '@/ui/tooltip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Explorer, type ExplorerPins } from './explorer'
import { useExplorerMemory } from './use-explorer-memory'
import { buildExplorerTree, type ListedFile } from '@/folder/explorer'
import type { ExplorerActions } from './use-explorer-actions'

const FOLDER = '/Notes'

function listed(relativePath: string, kind: ListedFile['kind']): ListedFile {
  return { path: `${FOLDER}/${relativePath}`, kind, modifiedAt: null, fileSize: 0 }
}

const TREE = buildExplorerTree(FOLDER, [
  listed('Welcome.md', 'note'),
  listed('Projects', 'folder'),
  listed('Projects/Plumo.md', 'note'),
  listed('Projects/lake.png', 'image'),
])

function stubActions(overrides: Partial<ExplorerActions> = {}): ExplorerActions {
  return {
    selected: null,
    select: vi.fn(),
    editing: null,
    error: null,
    createDocument: vi.fn(),
    createFolder: vi.fn(),
    createDocumentIn: vi.fn(),
    createFolderIn: vi.fn(),
    startRename: vi.fn(),
    commitRename: vi.fn(async () => true),
    cancelRename: vi.fn(),
    clearError: vi.fn(),
    trash: vi.fn(),
    moveInto: vi.fn(),
    reveal: vi.fn(),
    copyPath: vi.fn(),
    ...overrides,
  }
}

interface HarnessProps {
  actions: ExplorerActions
  onOpenFile?: (path: string) => void
  folder?: string
  tree?: ReturnType<typeof buildExplorerTree>
  /** False stands in for the collapsed sidebar: the Explorer is unmounted, what holds its memory is not. */
  shown?: boolean
  pins?: ExplorerPins
  collapsed?: boolean
  onToggleCollapsed?: () => void
  onExpand?: () => void
  onFocusEditor?: () => void
}

/** The Explorer under what App gives it: its memory, held above the sidebar. */
function ExplorerHarness({ actions, onOpenFile = vi.fn(), folder = FOLDER, tree = TREE, shown = true, pins, ...fold }: HarnessProps) {
  const memory = useExplorerMemory(folder)
  if (!shown) return null
  return (
    <Explorer
      folder={folder}
      tree={tree}
      activeTabPath={null}
      onOpenFile={onOpenFile}
      actions={actions}
      memory={memory}
      onCloseFolder={vi.fn()}
      onOpenFolder={vi.fn()}
      pins={pins}
      {...fold}
    />
  )
}

function renderExplorer(actions: ExplorerActions, onOpenFile = vi.fn(), pins?: ExplorerPins, fold: Pick<HarnessProps, 'collapsed' | 'onToggleCollapsed' | 'onExpand' | 'onFocusEditor'> = {}) {
  const view = render(<ExplorerHarness actions={actions} onOpenFile={onOpenFile} pins={pins} {...fold} />, { wrapper: TooltipProvider })
  const rerender = (props: Partial<HarnessProps>) => view.rerender(<ExplorerHarness actions={actions} onOpenFile={onOpenFile} pins={pins} {...props} />)
  return { onOpenFile, rerender }
}

describe('the empty states', () => {
  function renderWithoutFolder(error: string | null = null) {
    const onOpenFolder = vi.fn()
    function NoFolderHarness() {
      const memory = useExplorerMemory(null)
      return (
        <Explorer folder={null} tree={null} activeTabPath={null} onOpenFile={vi.fn()} actions={stubActions()}
          memory={memory} onCloseFolder={vi.fn()} onOpenFolder={onOpenFolder} error={error} />
      )
    }
    render(<NoFolderHarness />, { wrapper: TooltipProvider })
    return { onOpenFolder }
  }

  it('with no Folder open says so, with the Open Folder button and the drop hint, and no Explorer label', () => {
    const { onOpenFolder } = renderWithoutFolder()

    expect(screen.getByTestId('explorer')).not.toHaveTextContent(/Explorer/)

    const block = screen.getByTestId('explorer-no-folder')
    expect(block).toHaveTextContent('No folder open')
    expect(block).toHaveTextContent('or drop a .md file onto the window')
    expect(screen.queryByTestId('explorer-folder-missing')).toBeNull()
    expect(screen.queryByRole('tree')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Open Folder ⌘O' }))
    expect(onOpenFolder).toHaveBeenCalledTimes(1)
  })

  it('names the Folder that was not found above the button on a restore that lost it', () => {
    renderWithoutFolder('Folder not found: /Users/x/Gone')

    const block = screen.getByTestId('explorer-no-folder')
    const missing = screen.getByTestId('explorer-folder-missing')
    expect(missing).toHaveTextContent('Folder not found: /Users/x/Gone')
    const button = screen.getByRole('button', { name: 'Open Folder ⌘O' })
    expect(missing.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(block).toContainElement(missing)
  })

  it('shows one muted line in the tree area while the Folder holds no Document, and nothing once it does', () => {
    const emptyTree = buildExplorerTree(FOLDER, [listed('Attachments', 'folder'), listed('Attachments/lake.png', 'image')])
    const { rerender } = renderExplorer(stubActions())
    rerender({ tree: emptyTree })

    expect(screen.getByRole('tree')).toContainElement(screen.getByTestId('explorer-no-documents'))
    expect(screen.getByTestId('explorer-no-documents')).toHaveTextContent('No documents yet · ⌘N')
    expect(screen.queryByRole('button', { name: /Open Folder/ })).toBeNull()

    rerender({ tree: TREE })
    expect(screen.queryByTestId('explorer-no-documents')).toBeNull()
  })
})

const viewport = () => screen.getByRole('tree').querySelector('[data-slot="scroll-area-viewport"]') as HTMLElement
const isExpanded = (name: string) => screen.getByRole('treeitem', { name }).getAttribute('aria-expanded') === 'true'

/** Radix opens a context menu from a right-click on its trigger. */
function rightClick(element: Element) {
  fireEvent.contextMenu(element, { button: 2, clientX: 20, clientY: 20 })
}

function menuLabels(menu: HTMLElement): string[] {
  return within(menu).getAllByRole('menuitem').map((item) => item.textContent ?? '')
}

describe('the context menu', () => {
  it('gives a Document its own items', async () => {
    renderExplorer(stubActions())

    rightClick(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`))

    const menu = await screen.findByTestId('explorer-menu:note')
    expect(menuLabels(menu)).toEqual(['Pin', 'Rename…', 'Reveal in Finder', 'Copy Path', 'Move to Trash'])
    expect(within(menu).getByText('Move to Trash')).not.toHaveAttribute('data-disabled')
    expect(within(menu).getByText('Move to Trash')).toHaveAttribute('data-variant', 'destructive')
  })

  it('pins the row it was opened on, and names the item Unpin on a pinned row', async () => {
    const pins = { isPinned: (path: string) => path === `${FOLDER}/Welcome.md`, toggle: vi.fn() }
    renderExplorer(stubActions(), vi.fn(), pins)

    fireEvent.click(screen.getByLabelText('Expand Projects'))
    rightClick(screen.getByTestId(`explorer-row:${FOLDER}/Projects/lake.png`))
    const imageMenu = await screen.findByTestId('explorer-menu:image')
    expect(menuLabels(imageMenu)[0]).toBe('Pin')
    fireEvent.click(within(imageMenu).getByText('Pin'))
    await waitFor(() => expect(pins.toggle).toHaveBeenCalledWith(`${FOLDER}/Projects/lake.png`))
    await waitFor(() => expect(screen.queryByTestId('explorer-menu:image')).toBeNull())

    rightClick(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`))
    const noteMenu = await screen.findByTestId('explorer-menu:note')
    expect(menuLabels(noteMenu)[0]).toBe('Unpin')
  })

  it('gives a folder the creation items as well', async () => {
    renderExplorer(stubActions())

    rightClick(screen.getByTestId(`explorer-row:${FOLDER}/Projects`))

    const menu = await screen.findByTestId('explorer-menu:folder')
    expect(menuLabels(menu)).toEqual([
      'New Document', 'New Folder', 'Rename…', 'Reveal in Finder', 'Copy Path', 'Move to Trash',
    ])
  })

  it("gives the header the Folder's own items, with no rename and no trash", async () => {
    const actions = stubActions()
    renderExplorer(actions)

    rightClick(screen.getByTestId('explorer-header'))

    const menu = await screen.findByTestId('explorer-menu:root')
    expect(menuLabels(menu)).toEqual(['New Document', 'New Folder', 'Reveal in Finder', 'Copy Path'])
    fireEvent.click(within(menu).getByText('Copy Path'))
    await waitFor(() => expect(actions.copyPath).toHaveBeenCalledWith(FOLDER))
  })

  it('gives the area below the tree the two creation items, at the Folder root', async () => {
    const actions = stubActions()
    renderExplorer(actions)

    rightClick(screen.getByTestId('explorer-empty-area'))

    const menu = await screen.findByTestId('explorer-menu:empty')
    expect(menuLabels(menu)).toEqual(['New Document', 'New Folder'])
    fireEvent.click(within(menu).getByText('New Document'))
    await waitFor(() => expect(actions.createDocumentIn).toHaveBeenCalledWith(FOLDER))
  })

  it('changes neither the selection nor the active Tab', async () => {
    const actions = stubActions()
    const { onOpenFile } = renderExplorer(actions)

    rightClick(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`))
    await screen.findByTestId('explorer-menu:note')

    expect(actions.select).not.toHaveBeenCalled()
    expect(onOpenFile).not.toHaveBeenCalled()
  })

  // Right-click leaves the selection where it was, so the row the menu acts on
  // has to say so itself: it keeps the hover look, not the selected one.
  it('marks the row its menu is open on, and only while it is open', async () => {
    renderExplorer(stubActions({ selected: `${FOLDER}/Welcome.md` }))
    const row = screen.getByTestId(`explorer-row:${FOLDER}/Projects`)
    expect(row).toHaveClass('data-[state=open]:bg-sidebar-row-hover')
    expect(row).not.toHaveAttribute('data-state', 'open')

    rightClick(row)
    const menu = await screen.findByTestId('explorer-menu:folder')
    expect(row).toHaveAttribute('data-state', 'open')
    expect(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`)).not.toHaveAttribute('data-state', 'open')

    fireEvent.keyDown(menu, { key: 'Escape' })
    await waitFor(() => expect(row).not.toHaveAttribute('data-state', 'open'))
  })

  it('starts the rename on the row under the cursor', async () => {
    const actions = stubActions()
    renderExplorer(actions)

    fireEvent.click(screen.getByLabelText('Expand Projects'))
    rightClick(screen.getByTestId(`explorer-row:${FOLDER}/Projects/lake.png`))
    const menu = await screen.findByTestId('explorer-menu:image')
    fireEvent.click(within(menu).getByText('Rename…'))

    await waitFor(() => expect(actions.startRename).toHaveBeenCalledWith(`${FOLDER}/Projects/lake.png`, 'image'))
  })

  it('hands Reveal in Finder and Copy Path the row it was opened on', async () => {
    const actions = stubActions()
    renderExplorer(actions)

    rightClick(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`))
    const menu = await screen.findByTestId('explorer-menu:note')
    fireEvent.click(within(menu).getByText('Copy Path'))

    await waitFor(() => expect(actions.copyPath).toHaveBeenCalledWith(`${FOLDER}/Welcome.md`))
  })
})

describe('the inline rename input', () => {
  const editing = {
    path: `${FOLDER}/Welcome.md`,
    kind: 'note' as const,
    stem: 'Welcome',
    extension: '.md',
    created: false,
  }

  it('offers the stem selected, with the extension as static text beside it', () => {
    renderExplorer(stubActions({ editing }))

    const input = screen.getByTestId('explorer-rename-input') as HTMLInputElement
    expect(input.value).toBe('Welcome')
    expect(input.selectionStart).toBe(0)
    expect(input.selectionEnd).toBe('Welcome'.length)
    expect(screen.getByText('.md')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Welcome.md')).toBeNull()
  })

  it('drops a slash as it is typed', () => {
    renderExplorer(stubActions({ editing }))

    const input = screen.getByTestId('explorer-rename-input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Notes/Q3' } })

    expect(input.value).toBe('NotesQ3')
  })

  it('commits on Enter', async () => {
    const actions = stubActions({ editing })
    renderExplorer(actions)

    const input = screen.getByTestId('explorer-rename-input')
    fireEvent.change(input, { target: { value: 'Readme' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(actions.commitRename).toHaveBeenCalledWith('Readme'))
  })

  it.each([
    { name: 'while composing', init: { isComposing: true } },
    { name: 'ending a composition (keyCode 229)', init: { keyCode: 229 } },
  ])('leaves Enter and Escape to the input method $name', async ({ init }) => {
    const actions = stubActions({ editing })
    renderExplorer(actions)

    const input = screen.getByTestId('explorer-rename-input')
    fireEvent.change(input, { target: { value: 'wendang' } })
    expect(fireEvent.keyDown(input, { key: 'Enter', ...init })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'Escape', ...init })).toBe(true)

    await Promise.resolve()
    expect(actions.commitRename).not.toHaveBeenCalled()
    expect(actions.cancelRename).not.toHaveBeenCalled()
  })

  it('cancels on Escape', () => {
    const actions = stubActions({ editing })
    renderExplorer(actions)

    fireEvent.keyDown(screen.getByTestId('explorer-rename-input'), { key: 'Escape' })

    expect(actions.cancelRename).toHaveBeenCalled()
    expect(actions.commitRename).not.toHaveBeenCalled()
  })

  describe('where focus goes when the rename ends from the keyboard (AIM-457)', () => {
    const renamed = { ...editing, path: `${FOLDER}/Readme.md` }
    const row = (path: string) => screen.getByTestId(`explorer-row:${path}`)

    it('Escape hands focus back to the row', async () => {
      const actions = stubActions({ editing, selected: editing.path })
      const { rerender } = renderExplorer(actions)

      fireEvent.keyDown(screen.getByTestId('explorer-rename-input'), { key: 'Escape' })
      rerender({ actions: { ...actions, editing: null } })

      await waitFor(() => expect(row(editing.path)).toHaveFocus())
    })

    it('Enter hands focus to the row under its new name, once the listing has it', async () => {
      const actions = stubActions({ editing, selected: editing.path })
      const { rerender } = renderExplorer(actions)

      const input = screen.getByTestId('explorer-rename-input')
      fireEvent.change(input, { target: { value: 'Readme' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(actions.commitRename).toHaveBeenCalledWith('Readme'))
      // The rename is through and the row is selected under its new name; the listing is a refresh behind.
      rerender({ actions: { ...actions, editing: null, selected: renamed.path } })
      expect(screen.queryByTestId(`explorer-row:${renamed.path}`)).toBeNull()
      rerender({ actions: { ...actions, editing: null, selected: renamed.path }, tree: buildExplorerTree(FOLDER, [listed('Readme.md', 'note'), listed('Projects', 'folder')]) })

      await waitFor(() => expect(row(renamed.path)).toHaveFocus())
    })

    it('a refused name keeps the input, and the focus, where they are', async () => {
      const actions = stubActions({ editing, selected: editing.path, commitRename: vi.fn(async () => false) })
      renderExplorer(actions)

      const input = screen.getByTestId('explorer-rename-input')
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(actions.commitRename).toHaveBeenCalled())

      expect(input).toHaveFocus()
    })

    it('a Document just created and named from the keyboard hands focus to the editor, as ⌘N promised', async () => {
      const onFocusEditor = vi.fn()
      const actions = stubActions({ editing: { ...editing, created: true }, selected: editing.path })
      renderExplorer(actions, undefined, undefined, { onFocusEditor })

      const input = screen.getByTestId('explorer-rename-input')
      fireEvent.change(input, { target: { value: 'Readme' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() => expect(onFocusEditor).toHaveBeenCalledTimes(1))
    })

    it('a blur is not the keyboard: focus stays where the click put it', async () => {
      const onFocusEditor = vi.fn()
      const actions = stubActions({ editing: { ...editing, created: true }, selected: editing.path })
      renderExplorer(actions, undefined, undefined, { onFocusEditor })

      fireEvent.blur(screen.getByTestId('explorer-rename-input'))
      await waitFor(() => expect(actions.commitRename).toHaveBeenCalled())

      expect(onFocusEditor).not.toHaveBeenCalled()
    })
  })

  it('commits on blur', async () => {
    const actions = stubActions({ editing })
    renderExplorer(actions)

    const input = screen.getByTestId('explorer-rename-input')
    fireEvent.change(input, { target: { value: 'Readme' } })
    fireEvent.blur(input)

    await waitFor(() => expect(actions.commitRename).toHaveBeenCalledWith('Readme'))
  })

  describe('after a refused name (AIM-481)', () => {
    const error = 'A Document named Readme.md already exists'

    it('clears the refusal as soon as the name changes', () => {
      const actions = stubActions({ editing, error })
      renderExplorer(actions)

      fireEvent.change(screen.getByTestId('explorer-rename-input'), { target: { value: 'Readme 2' } })

      expect(actions.clearError).toHaveBeenCalled()
    })

    it('gives the rename up on a blur that is refused, as Escape would', async () => {
      const actions = stubActions({ editing, commitRename: vi.fn(async () => false) })
      renderExplorer(actions)

      const input = screen.getByTestId('explorer-rename-input')
      fireEvent.change(input, { target: { value: 'Readme' } })
      fireEvent.blur(input)

      await waitFor(() => expect(actions.cancelRename).toHaveBeenCalledTimes(1))
      expect(actions.commitRename).toHaveBeenCalledWith('Readme')
    })

    it('keeps the input, and the message, on an Enter that is refused', async () => {
      const actions = stubActions({ editing, commitRename: vi.fn(async () => false) })
      renderExplorer(actions)

      const input = screen.getByTestId('explorer-rename-input')
      fireEvent.change(input, { target: { value: 'Readme' } })
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(actions.commitRename).toHaveBeenCalled())
      await Promise.resolve()

      expect(actions.cancelRename).not.toHaveBeenCalled()
    })

    it('leaves an accepted blur alone', async () => {
      const actions = stubActions({ editing })
      renderExplorer(actions)

      const input = screen.getByTestId('explorer-rename-input')
      fireEvent.change(input, { target: { value: 'Readme' } })
      fireEvent.blur(input)
      await waitFor(() => expect(actions.commitRename).toHaveBeenCalled())
      await Promise.resolve()

      expect(actions.cancelRename).not.toHaveBeenCalled()
    })
  })

  it('shows the refusal under the row and rings the input', () => {
    renderExplorer(stubActions({ editing, error: 'A Document named Readme.md already exists' }))

    expect(screen.getByTestId('explorer-rename-error'))
      .toHaveTextContent('A Document named Readme.md already exists')
    expect(screen.getByTestId('explorer-rename-input')).toHaveAttribute('aria-invalid', 'true')
  })

  it('replaces only the row it is editing', () => {
    renderExplorer(stubActions({ editing }))

    expect(screen.queryByTestId(`explorer-row:${FOLDER}/Welcome.md`)).toBeNull()
    expect(screen.getByTestId(`explorer-row:${FOLDER}/Projects`)).toBeInTheDocument()
  })
})

describe('the header', () => {
  it("is the Folder's name, and the Folder is not a row in the tree", () => {
    renderExplorer(stubActions())

    expect(screen.getByTestId('explorer-toggle')).toHaveTextContent('Notes')
    expect(screen.getByTestId('explorer')).not.toHaveTextContent(/Explorer/)
    expect(screen.queryByTestId(`explorer-row:${FOLDER}`)).toBeNull()
    const tree = screen.getByRole('tree')
    expect(within(tree).getAllByRole('treeitem').map((item) => [item.getAttribute('aria-label'), item.getAttribute('aria-level')]))
      .toEqual([['Projects', '1'], ['Welcome.md', '1']])
  })

  it('starts the top level at the first indent, with its folders shut', () => {
    renderExplorer(stubActions())

    expect(screen.getByTestId(`explorer-row:${FOLDER}/Projects`)).toHaveStyle({ paddingLeft: '8px' })
    expect(isExpanded('Projects')).toBe(false)
    fireEvent.click(screen.getByLabelText('Expand Projects'))
    expect(screen.getByTestId(`explorer-row:${FOLDER}/Projects/Plumo.md`)).toHaveStyle({ paddingLeft: '22px' })
  })

  it('folds the whole tree away from the name, and shows only the header while folded', () => {
    const onToggleCollapsed = vi.fn()
    const { rerender } = renderExplorer(stubActions(), vi.fn(), undefined, { onToggleCollapsed })
    const toggle = screen.getByTestId('explorer-toggle')
    expect(toggle).toHaveAttribute('aria-expanded', 'true')

    fireEvent.click(toggle)
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)

    rerender({ collapsed: true, onToggleCollapsed })
    expect(screen.queryByRole('tree')).toBeNull()
    expect(screen.getByTestId('explorer-toggle')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByTestId('explorer-new-document')).toBeInTheDocument()
  })

  it('opens a folded tree when a row enters rename, and not for a selection alone', () => {
    const onExpand = vi.fn()
    const { rerender } = renderExplorer(stubActions({ selected: `${FOLDER}/Welcome.md` }), vi.fn(), undefined, { collapsed: true, onExpand })
    expect(onExpand).not.toHaveBeenCalled()

    const editing = { path: `${FOLDER}/Untitled.md`, kind: 'note' as const, stem: 'Untitled', extension: '.md' , created: false }
    rerender({ actions: stubActions({ editing }), collapsed: true, onExpand })
    expect(onExpand).toHaveBeenCalled()
  })

  it('gives up an open rename when the tree folds, so the fold holds', () => {
    const editing = { path: `${FOLDER}/Welcome.md`, kind: 'note' as const, stem: 'Welcome', extension: '.md' , created: false }
    const actions = stubActions({ editing, error: 'A Document named Reading list.md already exists' })
    const onToggleCollapsed = vi.fn()
    renderExplorer(actions, vi.fn(), undefined, { onToggleCollapsed })

    fireEvent.click(screen.getByTestId('explorer-toggle'))

    expect(actions.cancelRename).toHaveBeenCalledTimes(1)
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)
  })

  it('leaves the rename alone when the tree only opens', () => {
    const editing = { path: `${FOLDER}/Welcome.md`, kind: 'note' as const, stem: 'Welcome', extension: '.md' , created: false }
    const actions = stubActions({ editing })
    const onToggleCollapsed = vi.fn()
    renderExplorer(actions, vi.fn(), undefined, { collapsed: true, onToggleCollapsed })

    fireEvent.click(screen.getByTestId('explorer-toggle'))

    expect(actions.cancelRename).not.toHaveBeenCalled()
    expect(onToggleCollapsed).toHaveBeenCalledTimes(1)
  })

  it('opens and shuts a top-level folder from the keyboard', () => {
    renderExplorer(stubActions())
    const row = screen.getByTestId(`explorer-row:${FOLDER}/Projects`)

    fireEvent.keyDown(row, { key: 'ArrowRight' })
    expect(isExpanded('Projects')).toBe(true)
    fireEvent.keyDown(row, { key: 'ArrowLeft' })
    expect(isExpanded('Projects')).toBe(false)
  })

  it('opens and shuts a folder from a click on its name, and selects it', () => {
    const actions = stubActions()
    const { onOpenFile } = renderExplorer(actions)

    fireEvent.click(screen.getByText('Projects'))
    expect(isExpanded('Projects')).toBe(true)
    expect(actions.select).toHaveBeenLastCalledWith(`${FOLDER}/Projects`)
    fireEvent.click(screen.getByText('Projects'))
    expect(isExpanded('Projects')).toBe(false)
    expect(onOpenFile).not.toHaveBeenCalled()
  })
})

describe('the header actions', () => {
  it('makes a new Document where the selection points', () => {
    const actions = stubActions()
    renderExplorer(actions)

    fireEvent.click(screen.getByTestId('explorer-new-document'))

    expect(actions.createDocument).toHaveBeenCalled()
  })

  it('holds exactly New Folder, Collapse All, Reveal in Finder and Close Folder', async () => {
    renderExplorer(stubActions())

    fireEvent.pointerDown(
      screen.getByTestId('explorer-more-actions'),
      { button: 0, ctrlKey: false, pointerType: 'mouse' },
    )

    const menu = await screen.findByTestId('explorer-header-menu')
    expect(menuLabels(menu)).toEqual(['New Folder', 'Collapse All', 'Reveal in Finder', 'Close Folder'])
  })

  it('Collapse All shuts the folders and leaves the top level listed', async () => {
    renderExplorer(stubActions())
    fireEvent.click(screen.getByLabelText('Expand Projects'))
    expect(isExpanded('Projects')).toBe(true)

    fireEvent.pointerDown(
      screen.getByTestId('explorer-more-actions'),
      { button: 0, ctrlKey: false, pointerType: 'mouse' },
    )
    fireEvent.click(within(await screen.findByTestId('explorer-header-menu')).getByRole('menuitem', { name: 'Collapse All' }))

    await waitFor(() => expect(isExpanded('Projects')).toBe(false))
    expect(within(screen.getByRole('tree')).getAllByRole('treeitem').map((item) => item.getAttribute('aria-label')))
      .toEqual(['Projects', 'Welcome.md'])
  })
})

/** jsdom has no DataTransfer, and a protected one answers `getData` with '' anyway. */
function dataTransfer(readable = true) {
  const held: Record<string, string> = {}
  return {
    effectAllowed: '',
    dropEffect: '',
    setData: (type: string, value: string) => { held[type] = value },
    getData: (type: string) => (readable ? held[type] ?? '' : ''),
  }
}

/** The tree opens with every folder shut, so nested rows are revealed first. */
function expandProjects() {
  fireEvent.click(screen.getByLabelText('Expand Projects'))
}

describe('Move to Trash', () => {
  it('trashes the row under the cursor, with its kind', async () => {
    const trash = vi.fn()
    renderExplorer(stubActions({ trash }))

    rightClick(screen.getByTestId(`explorer-row:${FOLDER}/Projects`))
    const menu = await screen.findByTestId('explorer-menu:folder')
    fireEvent.click(within(menu).getByText('Move to Trash'))

    await waitFor(() => expect(trash).toHaveBeenCalledWith(`${FOLDER}/Projects`, 'folder'))
  })

  it('trashes an Image file as a file', async () => {
    const trash = vi.fn()
    renderExplorer(stubActions({ trash }))
    expandProjects()

    rightClick(screen.getByTestId(`explorer-row:${FOLDER}/Projects/lake.png`))
    const menu = await screen.findByTestId('explorer-menu:image')
    fireEvent.click(within(menu).getByText('Move to Trash'))

    await waitFor(() => expect(trash).toHaveBeenCalledWith(`${FOLDER}/Projects/lake.png`, 'image'))
  })
})

describe('drag-and-drop', () => {
  it('lets a Document and an Image file be dragged, and never a folder', () => {
    renderExplorer(stubActions())
    expandProjects()

    expect(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`)).toHaveAttribute('draggable', 'true')
    expect(screen.getByTestId(`explorer-row:${FOLDER}/Projects/lake.png`)).toHaveAttribute('draggable', 'true')
    expect(screen.getByTestId(`explorer-row:${FOLDER}/Projects`)).not.toHaveAttribute('draggable', 'true')
  })

  it('moves the dragged file into the folder row it is dropped on', () => {
    const moveInto = vi.fn()
    renderExplorer(stubActions({ moveInto }))
    const transfer = dataTransfer()

    fireEvent.dragStart(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`), { dataTransfer: transfer })
    const target = screen.getByTestId(`explorer-row:${FOLDER}/Projects`)
    fireEvent.dragOver(target, { dataTransfer: transfer })
    expect(target).toHaveAttribute('data-drop-target')
    fireEvent.drop(target, { dataTransfer: transfer })

    expect(moveInto).toHaveBeenCalledWith(`${FOLDER}/Welcome.md`, `${FOLDER}/Projects`)
    expect(target).not.toHaveAttribute('data-drop-target')
  })

  it.each(['explorer-header', 'explorer-empty-area'])('moves it to the Folder\'s top level when %s takes the drop', (testId) => {
    const moveInto = vi.fn()
    renderExplorer(stubActions({ moveInto }))
    expandProjects()
    const transfer = dataTransfer()

    fireEvent.dragStart(screen.getByTestId(`explorer-row:${FOLDER}/Projects/Plumo.md`), { dataTransfer: transfer })
    fireEvent.dragOver(screen.getByTestId(testId), { dataTransfer: transfer })
    // The header marks the drop wherever over the top level the file is.
    expect(screen.getByTestId('explorer-header')).toHaveAttribute('data-drop-target')
    fireEvent.drop(screen.getByTestId(testId), { dataTransfer: transfer })

    expect(moveInto).toHaveBeenCalledWith(`${FOLDER}/Projects/Plumo.md`, FOLDER)
    expect(screen.getByTestId('explorer-header')).not.toHaveAttribute('data-drop-target')
  })

  it('takes the top-level drop on the header while the tree is folded', () => {
    const moveInto = vi.fn()
    const { rerender } = renderExplorer(stubActions({ moveInto }))
    expandProjects()
    const transfer = dataTransfer()
    fireEvent.dragStart(screen.getByTestId(`explorer-row:${FOLDER}/Projects/Plumo.md`), { dataTransfer: transfer })

    rerender({ collapsed: true })
    fireEvent.drop(screen.getByTestId('explorer-header'), { dataTransfer: transfer })

    expect(moveInto).toHaveBeenCalledWith(`${FOLDER}/Projects/Plumo.md`, FOLDER)
  })

  it('reads the dragged path from the drag in progress when the browser hides the data', () => {
    const moveInto = vi.fn()
    renderExplorer(stubActions({ moveInto }))
    const transfer = dataTransfer()

    fireEvent.dragStart(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`), { dataTransfer: transfer })
    fireEvent.drop(screen.getByTestId(`explorer-row:${FOLDER}/Projects`), { dataTransfer: dataTransfer(false) })

    expect(moveInto).toHaveBeenCalledWith(`${FOLDER}/Welcome.md`, `${FOLDER}/Projects`)
  })

  it('takes no drop with nothing being dragged', () => {
    const moveInto = vi.fn()
    renderExplorer(stubActions({ moveInto }))
    const transfer = dataTransfer()

    fireEvent.dragStart(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`), { dataTransfer: transfer })
    fireEvent.dragEnd(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`), { dataTransfer: transfer })
    const target = screen.getByTestId(`explorer-row:${FOLDER}/Projects`)
    fireEvent.dragOver(target, { dataTransfer: dataTransfer(false) })
    expect(target).not.toHaveAttribute('data-drop-target')
    fireEvent.drop(target, { dataTransfer: dataTransfer(false) })
    expect(moveInto).not.toHaveBeenCalled()
  })

  describe('a file row takes the drop for its folder (AIM-474)', () => {
    it('moves the file into the folder of the Document row it is dropped on, and marks that folder\'s row', () => {
      const moveInto = vi.fn()
      renderExplorer(stubActions({ moveInto }))
      expandProjects()
      const transfer = dataTransfer()

      fireEvent.dragStart(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`), { dataTransfer: transfer })
      const row = screen.getByTestId(`explorer-row:${FOLDER}/Projects/Plumo.md`)
      fireEvent.dragEnter(row, { dataTransfer: transfer })
      expect(fireEvent.dragOver(row, { dataTransfer: transfer })).toBe(false)
      expect(screen.getByTestId(`explorer-row:${FOLDER}/Projects`)).toHaveAttribute('data-drop-target')
      expect(row).not.toHaveAttribute('data-drop-target')
      fireEvent.drop(row, { dataTransfer: transfer })

      expect(moveInto).toHaveBeenCalledWith(`${FOLDER}/Welcome.md`, `${FOLDER}/Projects`)
      expect(screen.getByTestId(`explorer-row:${FOLDER}/Projects`)).not.toHaveAttribute('data-drop-target')
    })

    it('moves it to the Folder\'s top level from a top-level file row, and marks the header', () => {
      const moveInto = vi.fn()
      renderExplorer(stubActions({ moveInto }))
      expandProjects()
      const transfer = dataTransfer()

      fireEvent.dragStart(screen.getByTestId(`explorer-row:${FOLDER}/Projects/Plumo.md`), { dataTransfer: transfer })
      const row = screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`)
      fireEvent.dragEnter(row, { dataTransfer: transfer })
      fireEvent.dragOver(row, { dataTransfer: transfer })
      expect(screen.getByTestId('explorer-header')).toHaveAttribute('data-drop-target')
      fireEvent.drop(row, { dataTransfer: transfer })

      expect(moveInto).toHaveBeenCalledWith(`${FOLDER}/Projects/Plumo.md`, FOLDER)
    })
  })

  describe('a drop that would move nothing is not offered (AIM-474)', () => {
    it('marks neither the folder a file is already in nor its rows, and takes no drop there', () => {
      const moveInto = vi.fn()
      renderExplorer(stubActions({ moveInto }))
      expandProjects()
      const transfer = dataTransfer()

      fireEvent.dragStart(screen.getByTestId(`explorer-row:${FOLDER}/Projects/Plumo.md`), { dataTransfer: transfer })
      for (const path of [`${FOLDER}/Projects`, `${FOLDER}/Projects/lake.png`, `${FOLDER}/Projects/Plumo.md`]) {
        const row = screen.getByTestId(`explorer-row:${path}`)
        fireEvent.dragEnter(row, { dataTransfer: transfer })
        // Leaving the dragover untaken is what tells the browser the drop is refused.
        expect(fireEvent.dragOver(row, { dataTransfer: transfer })).toBe(true)
        expect(screen.getByTestId(`explorer-row:${FOLDER}/Projects`)).not.toHaveAttribute('data-drop-target')
        fireEvent.drop(row, { dataTransfer: transfer })
        fireEvent.dragStart(screen.getByTestId(`explorer-row:${FOLDER}/Projects/Plumo.md`), { dataTransfer: transfer })
      }

      expect(moveInto).not.toHaveBeenCalled()
    })

    it.each(['explorer-header', 'explorer-empty-area'])('marks no header for a top-level file over %s, and takes no drop', (testId) => {
      const moveInto = vi.fn()
      renderExplorer(stubActions({ moveInto }))
      const transfer = dataTransfer()

      fireEvent.dragStart(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`), { dataTransfer: transfer })
      fireEvent.dragEnter(screen.getByTestId(testId), { dataTransfer: transfer })
      expect(fireEvent.dragOver(screen.getByTestId(testId), { dataTransfer: transfer })).toBe(true)
      expect(screen.getByTestId('explorer-header')).not.toHaveAttribute('data-drop-target')
      fireEvent.drop(screen.getByTestId(testId), { dataTransfer: transfer })

      expect(moveInto).not.toHaveBeenCalled()
    })
  })

  it('keeps the mark steady while the file crosses the row\'s own icon and name (AIM-474)', () => {
    renderExplorer(stubActions())
    const transfer = dataTransfer()
    fireEvent.dragStart(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`), { dataTransfer: transfer })
    const target = screen.getByTestId(`explorer-row:${FOLDER}/Projects`)
    const name = within(target).getByText('Projects')

    fireEvent.dragEnter(target, { dataTransfer: transfer })
    fireEvent.dragOver(target, { dataTransfer: transfer })
    // Onto the name: it is entered before the row is left.
    fireEvent.dragEnter(name, { dataTransfer: transfer, relatedTarget: target })
    fireEvent.dragLeave(target, { dataTransfer: transfer, relatedTarget: name })
    expect(target).toHaveAttribute('data-drop-target')

    // Off the row altogether, onto the next one.
    const next = screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`)
    fireEvent.dragEnter(next, { dataTransfer: transfer, relatedTarget: name })
    fireEvent.dragLeave(name, { dataTransfer: transfer, relatedTarget: next })
    expect(target).not.toHaveAttribute('data-drop-target')
  })

  describe('a shut folder opens under a file that rests on it (AIM-474)', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.useRealTimers() })

    function dragOntoProjects() {
      const transfer = dataTransfer()
      fireEvent.dragStart(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`), { dataTransfer: transfer })
      const target = screen.getByTestId(`explorer-row:${FOLDER}/Projects`)
      fireEvent.dragEnter(target, { dataTransfer: transfer })
      fireEvent.dragOver(target, { dataTransfer: transfer })
      return { target, transfer }
    }

    it('after 600ms', () => {
      renderExplorer(stubActions())
      dragOntoProjects()

      act(() => { vi.advanceTimersByTime(599) })
      expect(isExpanded('Projects')).toBe(false)
      act(() => { vi.advanceTimersByTime(1) })
      expect(isExpanded('Projects')).toBe(true)
    })

    it.each([
      { name: 'the file leaves it', end: (target: HTMLElement, transfer: ReturnType<typeof dataTransfer>) => fireEvent.dragLeave(target, { dataTransfer: transfer }) },
      { name: 'the file is dropped', end: (target: HTMLElement, transfer: ReturnType<typeof dataTransfer>) => fireEvent.drop(target, { dataTransfer: transfer }) },
      { name: 'the drag ends', end: (_target: HTMLElement, transfer: ReturnType<typeof dataTransfer>) => fireEvent.dragEnd(screen.getByTestId(`explorer-row:${FOLDER}/Welcome.md`), { dataTransfer: transfer }) },
    ])('and stays shut when $name first', ({ end }) => {
      renderExplorer(stubActions())
      const { target, transfer } = dragOntoProjects()

      act(() => { vi.advanceTimersByTime(300) })
      end(target, transfer)
      act(() => { vi.advanceTimersByTime(1000) })

      expect(isExpanded('Projects')).toBe(false)
    })
  })
})

describe('collapsing and expanding the sidebar', () => {
  it('keeps the folders that were opened and the scroll position', () => {
    const { rerender } = renderExplorer(stubActions())
    fireEvent.click(screen.getByLabelText('Expand Projects'))
    viewport().scrollTop = 120
    fireEvent.scroll(viewport())

    rerender({ shown: false })
    expect(screen.queryByRole('tree')).toBeNull()
    rerender({ shown: true })

    expect(isExpanded('Projects')).toBe(true)
    expect(viewport().scrollTop).toBe(120)
  })

  it('keeps a folder shut that holds the selected Document', () => {
    const actions = stubActions({ selected: `${FOLDER}/Projects/Plumo.md` })
    const { rerender } = renderExplorer(actions)
    expect(isExpanded('Projects')).toBe(true)
    fireEvent.click(screen.getByLabelText('Collapse Projects'))

    rerender({ shown: false })
    rerender({ shown: true })

    expect(isExpanded('Projects')).toBe(false)
  })

  it('starts fresh in another Folder', () => {
    const { rerender } = renderExplorer(stubActions())
    fireEvent.click(screen.getByLabelText('Expand Projects'))
    viewport().scrollTop = 120
    fireEvent.scroll(viewport())

    const other = '/Other'
    const otherTree = buildExplorerTree(other, [
      { path: `${other}/Projects`, kind: 'folder', modifiedAt: null, fileSize: 0 },
      { path: `${other}/Projects/Plan.md`, kind: 'note', modifiedAt: null, fileSize: 0 },
    ])
    rerender({ folder: other, tree: otherTree })

    expect(isExpanded('Projects')).toBe(false)
    expect(viewport().scrollTop).toBe(0)
  })
})

describe('bringing a row into view', () => {
  const scrollIntoView = vi.mocked(Element.prototype.scrollIntoView)
  beforeEach(() => scrollIntoView.mockClear())

  it('opens the folders above a newly selected Document and scrolls to its row, once', () => {
    const view = render(<ExplorerHarness actions={stubActions()} />, { wrapper: TooltipProvider })
    scrollIntoView.mockClear()

    view.rerender(<ExplorerHarness actions={stubActions({ selected: `${FOLDER}/Projects/Plumo.md` })} />)

    expect(isExpanded('Projects')).toBe(true)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    expect(scrollIntoView.mock.contexts[0]).toBe(screen.getByRole('treeitem', { name: 'Plumo.md' }))
  })

  it('waits for a row that is not listed yet', () => {
    const actions = stubActions({ selected: `${FOLDER}/Later.md` })
    const { rerender } = renderExplorer(actions)
    expect(scrollIntoView).not.toHaveBeenCalled()

    rerender({ tree: buildExplorerTree(FOLDER, [listed('Welcome.md', 'note'), listed('Later.md', 'note')]) })

    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('stays put when a folder is opened or shut', () => {
    renderExplorer(stubActions({ selected: `${FOLDER}/Welcome.md` }))
    scrollIntoView.mockClear()

    fireEvent.click(screen.getByLabelText('Expand Projects'))
    fireEvent.click(screen.getByLabelText('Collapse Projects'))

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('stays put when the watcher hands over a new tree', () => {
    const { rerender } = renderExplorer(stubActions({ selected: `${FOLDER}/Welcome.md` }))
    scrollIntoView.mockClear()

    rerender({ tree: buildExplorerTree(FOLDER, [listed('Welcome.md', 'note'), listed('Added elsewhere.md', 'note')]) })

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('stays put when the sidebar comes back with the same row selected', () => {
    const { rerender } = renderExplorer(stubActions({ selected: `${FOLDER}/Welcome.md` }))
    scrollIntoView.mockClear()

    rerender({ shown: false })
    rerender({ shown: true })

    expect(scrollIntoView).not.toHaveBeenCalled()
  })

  it('scrolls to the row that enters rename, and not back to the selected row when the rename ends', () => {
    const selected = `${FOLDER}/Welcome.md`
    const view = render(<ExplorerHarness actions={stubActions({ selected })} />, { wrapper: TooltipProvider })
    scrollIntoView.mockClear()

    const editing = { path: `${FOLDER}/Projects/Plumo.md`, kind: 'note' as const, stem: 'Plumo', extension: '.md' , created: false }
    view.rerender(<ExplorerHarness actions={stubActions({ selected, editing })} />)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)

    view.rerender(<ExplorerHarness actions={stubActions({ selected })} />)
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })
})

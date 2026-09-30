import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ListedFile } from '@/folder/explorer'
import { TooltipProvider } from '@/ui/tooltip'
import { FolderSwitcher } from './folder-switcher'
import { RecentFolderList } from './recent-folder-list'

const HOME = '/Users/x'
const NOTES = '/Users/x/Documents/Notes'
const WORK_NOTES = '/Users/x/work/notes'
const PERSONAL_NOTES = '/Users/x/personal/notes'
const file = (path: string, kind: ListedFile['kind']): ListedFile => ({ path, kind, modifiedAt: null, fileSize: 0 })

function renderSwitcher() {
  const props = {
    folder: NOTES,
    files: [file(`${NOTES}/a.md`, 'note'), file(`${NOTES}/sub`, 'folder'), file(`${NOTES}/cover.png`, 'image')],
    recentFolders: [NOTES, WORK_NOTES, PERSONAL_NOTES],
    home: HOME,
    onOpenRecent: vi.fn(),
    onOpenFolder: vi.fn(),
    onCloseFolder: vi.fn(),
    onOpenSettings: vi.fn(),
  }
  render(<FolderSwitcher {...props} />, { wrapper: TooltipProvider })
  return props
}

async function openMenu() {
  fireEvent.pointerDown(screen.getByTestId('folder-switcher-row'), { button: 0, ctrlKey: false, pointerType: 'mouse' })
  return screen.findByTestId('folder-switcher-menu')
}

describe('FolderSwitcher', () => {
  it('names the current Folder on its row', () => {
    renderSwitcher()
    expect(screen.getByTestId('folder-switcher-row')).toHaveTextContent('Notes')
  })

  it('shows the Folder\'s path and what it holds on focus, counting no Image file', async () => {
    renderSwitcher()
    fireEvent.focus(screen.getByTestId('folder-switcher-row'))

    const tooltip = await screen.findByTestId('folder-switcher-tooltip')
    expect(tooltip).toHaveTextContent('~/Documents/Notes')
    expect(tooltip).toHaveTextContent('1 Document, 1 folder')
  })

  it('lists the Recent Folders by name and path, the current one ticked, then Open Folder… and Close Folder, then Settings… set apart', async () => {
    renderSwitcher()
    const menu = await openMenu()

    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((item) => item.textContent)).toEqual([
      'Notes~/Documents/Notes',
      'notes~/work/notes',
      'notes~/personal/notes',
      'Open Folder…⌘O',
      'Close Folder',
      'Settings…⌘,',
    ])
    expect(within(menu).getAllByRole('separator')).toHaveLength(2)
    expect(items.at(-1)?.previousElementSibling).toHaveAttribute('role', 'separator')
    expect(items[0]).toHaveAttribute('aria-current', 'true')
    expect(items[1]).not.toHaveAttribute('aria-current')
  })

  it('opens another Recent Folder, and does nothing for the current one', async () => {
    const props = renderSwitcher()

    fireEvent.click(within(await openMenu()).getByTestId(`recent-folder:${NOTES}`))
    expect(props.onOpenRecent).not.toHaveBeenCalled()

    fireEvent.click(within(await openMenu()).getByTestId(`recent-folder:${PERSONAL_NOTES}`))
    expect(props.onOpenRecent).toHaveBeenCalledWith(PERSONAL_NOTES)
  })

  it('runs Open Folder…, Close Folder and Settings… from the menu', async () => {
    const props = renderSwitcher()

    fireEvent.click(within(await openMenu()).getByRole('menuitem', { name: /Open Folder/ }))
    expect(props.onOpenFolder).toHaveBeenCalledOnce()

    fireEvent.click(within(await openMenu()).getByRole('menuitem', { name: 'Close Folder' }))
    expect(props.onCloseFolder).toHaveBeenCalledOnce()

    fireEvent.click(within(await openMenu()).getByRole('menuitem', { name: /Settings/ }))
    expect(props.onOpenSettings).toHaveBeenCalledOnce()
  })
})

describe('RecentFolderList', () => {
  it('is not rendered with no Recent Folder', () => {
    render(<RecentFolderList paths={[]} home={HOME} onOpen={vi.fn()} />)
    expect(screen.queryByTestId('recent-folders')).toBeNull()
  })

  it('lists each Recent Folder by name and path, and opens the one clicked', () => {
    const onOpen = vi.fn()
    render(<RecentFolderList paths={[WORK_NOTES, PERSONAL_NOTES]} home={HOME} onOpen={onOpen} />)

    const list = screen.getByRole('region', { name: 'Recent Folders' })
    expect(within(list).getAllByRole('button').map((row) => row.textContent)).toEqual(['notes~/work/notes', 'notes~/personal/notes'])

    fireEvent.click(screen.getByTestId(`recent-folder:${PERSONAL_NOTES}`))
    expect(onOpen).toHaveBeenCalledWith(PERSONAL_NOTES)
  })
})

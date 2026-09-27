import { describe, expect, it } from 'vitest'
import { commandMenuCommandEntries, commandMenuFileEntries, type CommandMenuState } from './command-menu-entries'
import type { ListedFile } from '@/folder/explorer'

const EVERYTHING: CommandMenuState = { hasDocument: true, hasFolder: true, hasTab: true, canPin: true }
const NOTHING: CommandMenuState = { hasDocument: false, hasFolder: false, hasTab: false, canPin: false }

const byId = (state: CommandMenuState) => new Map(commandMenuCommandEntries(state).map((entry) => [entry.id, entry]))

describe('commandMenuCommandEntries', () => {
  it('lists every native menu command in menu order, and nothing that has no menu item', () => {
    const entries = commandMenuCommandEntries(EVERYTHING)
    expect(entries.map((entry) => entry.name)).toEqual([
      'New Document', 'Open Folder…', 'Open Document…', 'Close Folder', 'Quick Open', 'Save',
      'Pin/Unpin', 'Reveal in Finder', 'Open in Default App', 'Close Tab',
      'Undo', 'Redo', 'Paste without Formatting', 'Find', 'Copy Path',
      'Toggle Sidebar', 'Toggle Rich/Raw', 'Appearance: System', 'Appearance: Dark', 'Appearance: Light',
      'Previous Tab', 'Next Tab',
      // The platform label: `Quit Plumo` on macOS, `Quit` elsewhere (jsdom is elsewhere).
      expect.stringMatching(/^Quit/),
    ])
    expect(entries.every((entry) => entry.kind === 'command')).toBe(true)
    expect(entries.some((entry) => entry.id.startsWith('window-jump-to-tab'))).toBe(false)
  })

  it('leaves the Command Menu itself out: a palette row that reopens the palette is noise', () => {
    expect(byId(EVERYTHING).has('view-command-palette')).toBe(false)
  })

  it('names the menu each command lives in, and carries the shortcut display', () => {
    const entries = byId(EVERYTHING)
    expect(entries.get('file-save')).toMatchObject({ detail: 'File', shortcut: expect.stringMatching(/S$/) })
    expect(entries.get('view-appearance-dark')).toMatchObject({ detail: 'View', shortcut: undefined })
    expect(entries.get('app-quit')).toMatchObject({ detail: 'Plumo', shortcut: expect.stringMatching(/Q$/) })
    expect(entries.get('file-close-vault')?.shortcut).toBeUndefined()
  })

  it('greys the state groups: no Document, no Tab, no Folder', () => {
    const entries = byId(NOTHING)
    for (const id of ['file-save', 'edit-toggle-raw-editor', 'edit-find-in-note', 'edit-undo', 'edit-redo', 'file-close-tab', 'edit-copy-path', 'file-toggle-pin', 'file-reveal-in-finder', 'file-open-in-default-app', 'file-new-note', 'file-quick-open', 'file-close-vault']) {
      expect(entries.get(id)?.enabled, id).toBe(false)
    }
    for (const id of ['file-open-vault', 'file-open-note', 'view-toggle-sidebar', 'app-quit']) {
      expect(entries.get(id)?.enabled, id).toBe(true)
    }
  })

  it('keeps Close Tab, Copy Path and the file hand-offs live over an Image Tab, where Save and Find are greyed', () => {
    const entries = byId({ hasDocument: false, hasFolder: true, hasTab: true, canPin: true })
    expect(entries.get('file-close-tab')?.enabled).toBe(true)
    expect(entries.get('file-toggle-pin')?.enabled).toBe(true)
    expect(entries.get('file-reveal-in-finder')).toMatchObject({ enabled: true, detail: 'File', shortcut: undefined })
    expect(entries.get('file-open-in-default-app')).toMatchObject({ enabled: true, detail: 'File', shortcut: undefined })
    expect(entries.get('edit-copy-path')).toMatchObject({ enabled: true, detail: 'Edit', shortcut: expect.stringMatching(/,$/) })
    expect(entries.get('file-save')?.enabled).toBe(false)
    expect(entries.get('edit-find-in-note')?.enabled).toBe(false)
    expect(entries.get('edit-undo')?.enabled).toBe(false)
  })

  it('lists no Zoom rows: v0.1 has no zoom, and a row that does nothing is a lie (AIM-468)', () => {
    expect([...byId(EVERYTHING).keys()].filter((id) => id.startsWith('view-zoom'))).toEqual([])
  })
})

describe('Pin/Unpin in the Command Menu', () => {
  it('follows whether the active Tab can be pinned, not merely whether a Tab is open', () => {
    const outsideFolder = byId({ hasDocument: true, hasFolder: true, hasTab: true, canPin: false })
    expect(outsideFolder.get('file-toggle-pin')?.enabled).toBe(false)
    expect(outsideFolder.get('file-reveal-in-finder')?.enabled).toBe(true)

    expect(byId(EVERYTHING).get('file-toggle-pin')).toMatchObject({ enabled: true, detail: 'File', name: 'Pin/Unpin' })
  })
})

describe('commandMenuFileEntries', () => {
  const FOLDER = '/Users/plumo/Documents/Notes'
  const listing: ListedFile[] = [
    { path: `${FOLDER}/Welcome.md`, kind: 'note', modifiedAt: 1, fileSize: 10 },
    { path: `${FOLDER}/Projects`, kind: 'folder', modifiedAt: 1, fileSize: 0 },
    { path: `${FOLDER}/Projects/Plumo.md`, kind: 'note', modifiedAt: 1, fileSize: 10 },
    { path: `${FOLDER}/Attachments/lake.png`, kind: 'image', modifiedAt: 1, fileSize: 10 },
  ]

  it('turns Documents and Image files into rows, and skips folders', () => {
    expect(commandMenuFileEntries(listing, FOLDER)).toEqual([
      { kind: 'document', id: `${FOLDER}/Welcome.md`, name: 'Welcome.md', detail: 'Notes' },
      { kind: 'document', id: `${FOLDER}/Projects/Plumo.md`, name: 'Plumo.md', detail: 'Notes › Projects' },
      { kind: 'image', id: `${FOLDER}/Attachments/lake.png`, name: 'lake.png', detail: 'Notes › Attachments' },
    ])
  })

  it('has nothing to list with no Folder', () => {
    expect(commandMenuFileEntries(listing, null)).toEqual([])
  })
})

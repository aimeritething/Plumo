import { describe, expect, it } from 'vitest'
import { EXPLORER_MENU_LABELS, explorerMenuEntries, isDestructiveExplorerMenuAction } from './explorer-menu-items'

function labels(target: Parameters<typeof explorerMenuEntries>[0]): string[] {
  return explorerMenuEntries(target).map((entry) =>
    entry.kind === 'separator' ? '─' : EXPLORER_MENU_LABELS[entry.action])
}

describe('explorerMenuEntries', () => {
  it('gives a Document Pin, rename and Duplicate, the system hand-offs and trash last', () => {
    expect(labels('note')).toEqual(['Pin', '─', 'Rename…', 'Duplicate', '─', 'Reveal in Finder', 'Copy Path', '─', 'Move to Trash'])
  })

  it('gives an Image file the same items as a Document', () => {
    expect(labels('image')).toEqual(labels('note'))
  })

  it('gives a folder the creation items above its own', () => {
    expect(labels('folder')).toEqual([
      'New Document', 'New Folder', '─', 'Rename…', '─', 'Reveal in Finder', 'Copy Path', '─', 'Move to Trash',
    ])
  })

  it('gives the Folder itself (the header) no rename and no trash', () => {
    expect(labels('root')).toEqual(['New Document', 'New Folder', '─', 'Reveal in Finder', 'Copy Path'])
  })

  it('gives the empty area below the tree the two creation items only', () => {
    expect(labels('empty')).toEqual(['New Document', 'New Folder'])
  })

  it('draws Move to Trash, and nothing else, as destructive', () => {
    const destructive = Object.keys(EXPLORER_MENU_LABELS)
      .filter((action) => isDestructiveExplorerMenuAction(action as keyof typeof EXPLORER_MENU_LABELS))
    expect(destructive).toEqual(['trash'])
  })

  it('never puts a separator at either end', () => {
    for (const target of ['note', 'image', 'folder', 'root', 'empty'] as const) {
      const entries = explorerMenuEntries(target)
      expect(entries.at(0)?.kind).toBe('item')
      expect(entries.at(-1)?.kind).toBe('item')
    }
  })
})

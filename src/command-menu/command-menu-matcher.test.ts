import { describe, expect, it } from 'vitest'
import { fuzzyMatch, matchCommandMenu, type CommandMenuEntry } from './command-menu-matcher'

const command = (id: string, name: string, extra: Partial<CommandMenuEntry> = {}): CommandMenuEntry => (
  { kind: 'command', id, name, ...extra }
)
const document = (path: string, detail = 'Notes'): CommandMenuEntry => (
  { kind: 'document', id: path, name: path.slice(path.lastIndexOf('/') + 1), detail }
)
const image = (path: string, detail = 'Notes › Attachments'): CommandMenuEntry => (
  { kind: 'image', id: path, name: path.slice(path.lastIndexOf('/') + 1), detail }
)

const COMMANDS = [
  command('file-new-note', 'New Document', { shortcut: '⌘N' }),
  command('file-save', 'Save', { shortcut: '⌘S' }),
  command('view-toggle-sidebar', 'Toggle Sidebar', { shortcut: '⌘[' }),
  command('edit-toggle-raw-editor', 'Toggle Source Mode', { shortcut: '⌘\\' }),
]
const FILES = [
  document('/Notes/Welcome.md'),
  document('/Notes/Reading list.md'),
  document('/Notes/Projects/Plumo.md', 'Notes › Projects'),
  image('/Notes/Attachments/lake.png'),
]
const ENTRIES = [...COMMANDS, ...FILES]

const names = (entries: readonly CommandMenuEntry[], query: string, mode: 'commands' | 'files') => (
  matchCommandMenu(entries, query, mode).map((match) => match.entry.name)
)

describe('fuzzyMatch', () => {
  it('matches case-insensitively and reports the matched range', () => {
    expect(fuzzyMatch('tog', 'Toggle Sidebar')).toMatchObject({ ranges: [[0, 3]] })
    expect(fuzzyMatch('SIDE', 'Toggle Sidebar')).toMatchObject({ ranges: [[7, 11]] })
  })

  it('matches a scattered subsequence and merges adjacent ranges', () => {
    expect(fuzzyMatch('tsb', 'Toggle Sidebar')).toMatchObject({ ranges: [[0, 1], [7, 8], [11, 12]] })
    expect(fuzzyMatch('pomd', 'Plumo.md')).toMatchObject({ ranges: [[0, 1], [4, 5], [6, 8]] })
  })

  it('returns null when a character of the query is not in the text', () => {
    expect(fuzzyMatch('sav', 'Toggle Sidebar')).toBeNull()
    expect(fuzzyMatch('x', '')).toBeNull()
  })

  it('ranks a contiguous match above a scattered one, and a prefix above a word start', () => {
    const contiguous = fuzzyMatch('side', 'Toggle Sidebar')!.score
    const scattered = fuzzyMatch('side', 'Save is deferred')!.score
    expect(contiguous).toBeGreaterThan(scattered)

    const prefix = fuzzyMatch('sa', 'Save')!.score
    const wordStart = fuzzyMatch('sa', 'Toggle Saved')!.score
    const inWord = fuzzyMatch('sa', 'Mosaic')!.score
    expect(prefix).toBeGreaterThan(wordStart)
    expect(wordStart).toBeGreaterThan(inWord)
  })

  it('ignores whitespace in the query', () => {
    expect(fuzzyMatch('toggle side', 'Toggle Sidebar')).toMatchObject({ ranges: [[0, 6], [7, 11]] })
  })
})

describe('matchCommandMenu', () => {
  it('lists every command, in order, and no file while the ⌘K query is empty', () => {
    expect(names(ENTRIES, '', 'commands')).toEqual(['New Document', 'Save', 'Toggle Sidebar', 'Toggle Source Mode'])
    expect(names(ENTRIES, '   ', 'commands')).toEqual(['New Document', 'Save', 'Toggle Sidebar', 'Toggle Source Mode'])
  })

  it('matches commands, Document names and Image file names together once the user types', () => {
    expect(names(ENTRIES, 'tog', 'commands')).toEqual(['Toggle Sidebar', 'Toggle Source Mode'])
    expect(names(ENTRIES, 'plumo', 'commands')).toEqual(['Plumo.md'])
    expect(names(ENTRIES, 'lake', 'commands')).toEqual(['lake.png'])
    // `sa` is a prefix of Save and a scattered match in Sidebar: both show, the prefix first.
    expect(names(ENTRIES, 'sa', 'commands')).toEqual(['Save', 'Toggle Sidebar'])
  })

  it('ranks the better match first, and breaks ties by kind then name', () => {
    const entries = [document('/Notes/Save log.md'), command('file-save', 'Save'), image('/Notes/sa.png')]
    expect(names(entries, 'sa', 'commands')).toEqual(['Save', 'sa.png', 'Save log.md'])
    // "Save" and "sa.png": both are a prefix match; the shorter name wins.
    const entriesByLength = [document('/Notes/Sa.md'), document('/Notes/Saved.md')]
    expect(names(entriesByLength, 'sa', 'files')).toEqual(['Sa.md', 'Saved.md'])
  })

  it('matches names only, never the parent path', () => {
    expect(names(ENTRIES, 'projects', 'commands')).toEqual([])
    expect(names(ENTRIES, 'attach', 'files')).toEqual([])
  })

  it('shows every file, sorted by name, and no command while the Quick Open query is empty', () => {
    expect(names(ENTRIES, '', 'files')).toEqual(['lake.png', 'Plumo.md', 'Reading list.md', 'Welcome.md'])
  })

  it('never returns a command in Quick Open mode', () => {
    expect(names(ENTRIES, 'tog', 'files')).toEqual([])
    // Every Document ends in `.md`; the shorter name ranks first among equal matches.
    expect(names(ENTRIES, 'md', 'files')).toEqual(['Plumo.md', 'Welcome.md', 'Reading list.md'])
  })

  it('carries the highlight ranges on each match', () => {
    const [match] = matchCommandMenu(ENTRIES, 'source', 'commands')
    expect(match.entry.name).toBe('Toggle Source Mode')
    expect(match.ranges).toEqual([[7, 13]])
  })
})

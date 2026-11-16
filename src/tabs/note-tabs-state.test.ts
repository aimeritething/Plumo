import { describe, expect, it } from 'vitest'
import type { Tab } from '@/types'
import { noteEntryForPath } from '@/folder/note-entry'
import { imageEntryForPath } from './image-file'
import {
  activateAdjacentTab,
  activateTab,
  activateTabAt,
  applyModeRule,
  closeTab,
  EMPTY_NOTE_TABS,
  moveTab,
  openTab,
  retargetTabs,
  setTabMode,
  type NoteTabsState,
} from './note-tabs-state'

const tab = (path: string, content = ''): Tab => ({ entry: noteEntryForPath(path, content), content })
const INVALID_FRONTMATTER = '---\nnot yaml\n---\n# A\n'
const VALID_FRONTMATTER = '---\ntitle: A\n---\n# A\n'
const paths = (state: NoteTabsState) => state.tabs.map((entry) => entry.entry.path)

function threeOpen(): NoteTabsState {
  return openTab(openTab(openTab(EMPTY_NOTE_TABS, tab('/n/a.md')), tab('/n/b.md')), tab('/n/c.md'))
}

describe('openTab', () => {
  it('appends a fresh Document at the end and activates it', () => {
    const state = threeOpen()

    expect(paths(state)).toEqual(['/n/a.md', '/n/b.md', '/n/c.md'])
    expect(state.activeTabPath).toBe('/n/c.md')
  })

  it('activates the existing Tab instead of adding one when the Document is already open', () => {
    const state = openTab(threeOpen(), tab('/n/a.md'))

    expect(paths(state)).toEqual(['/n/a.md', '/n/b.md', '/n/c.md'])
    expect(state.activeTabPath).toBe('/n/a.md')
  })
})

describe('closeTab', () => {
  it('activates the Tab to the right when the active middle Tab closes', () => {
    const state = closeTab(activateTab(threeOpen(), '/n/b.md'), '/n/b.md')

    expect(paths(state)).toEqual(['/n/a.md', '/n/c.md'])
    expect(state.activeTabPath).toBe('/n/c.md')
  })

  it('activates the Tab to the left when the active last Tab closes', () => {
    const state = closeTab(threeOpen(), '/n/c.md')

    expect(paths(state)).toEqual(['/n/a.md', '/n/b.md'])
    expect(state.activeTabPath).toBe('/n/b.md')
  })

  it('keeps the active Tab when another Tab closes', () => {
    const state = closeTab(activateTab(threeOpen(), '/n/a.md'), '/n/c.md')

    expect(paths(state)).toEqual(['/n/a.md', '/n/b.md'])
    expect(state.activeTabPath).toBe('/n/a.md')
  })

  it('leaves no active Tab when the only Tab closes', () => {
    const state = closeTab(openTab(EMPTY_NOTE_TABS, tab('/n/a.md')), '/n/a.md')

    expect(state).toEqual(EMPTY_NOTE_TABS)
  })

  it('ignores a path that is not open', () => {
    const state = threeOpen()

    expect(closeTab(state, '/n/zzz.md')).toBe(state)
  })
})

describe('positional navigation', () => {
  it('moves to the next and previous Tab positionally, wrapping at the ends', () => {
    const state = threeOpen()

    expect(activateAdjacentTab(state, 1).activeTabPath).toBe('/n/a.md')
    expect(activateAdjacentTab(state, -1).activeTabPath).toBe('/n/b.md')
    expect(activateAdjacentTab(activateTab(state, '/n/a.md'), -1).activeTabPath).toBe('/n/c.md')
  })

  it('jumps to Tab N and ignores an N past the last Tab', () => {
    const state = threeOpen()

    expect(activateTabAt(state, 1).activeTabPath).toBe('/n/b.md')
    expect(activateTabAt(state, 7)).toBe(state)
  })

  it('does nothing with no Tabs open', () => {
    expect(activateAdjacentTab(EMPTY_NOTE_TABS, 1)).toBe(EMPTY_NOTE_TABS)
    expect(activateTabAt(EMPTY_NOTE_TABS, 0)).toBe(EMPTY_NOTE_TABS)
  })
})

describe('moveTab', () => {
  it('moves a Tab to a new place in the order, either way, and leaves the active Tab active', () => {
    const state = threeOpen()

    expect(paths(moveTab(state, '/n/a.md', 2))).toEqual(['/n/b.md', '/n/c.md', '/n/a.md'])
    expect(paths(moveTab(state, '/n/c.md', 0))).toEqual(['/n/c.md', '/n/a.md', '/n/b.md'])
    expect(moveTab(state, '/n/a.md', 1).activeTabPath).toBe('/n/c.md')
  })

  it('stops at either end of the order', () => {
    expect(paths(moveTab(threeOpen(), '/n/a.md', 9))).toEqual(['/n/b.md', '/n/c.md', '/n/a.md'])
    expect(paths(moveTab(threeOpen(), '/n/c.md', -4))).toEqual(['/n/c.md', '/n/a.md', '/n/b.md'])
  })

  it('returns the same state for a Tab let go where it was, or a path that is not open', () => {
    const state = threeOpen()

    expect(moveTab(state, '/n/b.md', 1)).toBe(state)
    expect(moveTab(state, '/n/missing.md', 0)).toBe(state)
  })
})

describe('retargetTabs', () => {
  it('moves a renamed Document to its new path, keeping its content and its place', () => {
    const state = activateTab(threeOpen(), '/n/b.md')

    const next = retargetTabs(state, '/n/b.md', '/n/renamed.md')

    expect(paths(next)).toEqual(['/n/a.md', '/n/renamed.md', '/n/c.md'])
    expect(next.activeTabPath).toBe('/n/renamed.md')
    expect(next.tabs[1].content).toBe(state.tabs[1].content)
  })

  it('renames the Tab, so the tab bar and the breadcrumb follow', () => {
    const next = retargetTabs(threeOpen(), '/n/a.md', '/n/Roadmap.md')

    expect(next.tabs[0].entry.filename).toBe('Roadmap.md')
    expect(next.tabs[0].entry.title).toBe('Roadmap')
  })

  it('takes every Tab under a renamed folder along', () => {
    const state = openTab(openTab(EMPTY_NOTE_TABS, tab('/n/work/a.md')), tab('/n/work/deep/b.md'))

    const next = retargetTabs(state, '/n/work', '/n/archive')

    expect(paths(next)).toEqual(['/n/archive/a.md', '/n/archive/deep/b.md'])
    expect(next.activeTabPath).toBe('/n/archive/deep/b.md')
  })

  it('leaves a Tab that only shares a name prefix alone', () => {
    const state = openTab(EMPTY_NOTE_TABS, tab('/n/workshop.md'))

    expect(retargetTabs(state, '/n/work', '/n/archive')).toBe(state)
  })

  it('does nothing when no open Tab is under the renamed path', () => {
    const state = threeOpen()

    expect(retargetTabs(state, '/n/zzz.md', '/n/yyy.md')).toBe(state)
    expect(retargetTabs(state, '/n/a.md', '/n/a.md')).toBe(state)
  })
})

describe('the mode of a Tab', () => {
  it('opens a fresh Document in Rich mode and an Image file with no mode', () => {
    const state = openTab(openTab(EMPTY_NOTE_TABS, tab('/n/a.md')), { entry: imageEntryForPath('/n/cover.png'), content: '' })

    expect(state.tabs[0].mode).toBe('rich')
    expect(state.tabs[1].mode).toBeUndefined()
  })

  it('keeps the mode a Document was opened with', () => {
    const state = openTab(EMPTY_NOTE_TABS, { ...tab('/n/a.md'), mode: 'raw' })

    expect(state.tabs[0].mode).toBe('raw')
  })

  it('switches one Tab without touching the others', () => {
    const state = setTabMode(threeOpen(), '/n/b.md', 'raw')

    expect(state.tabs.map((entry) => entry.mode)).toEqual(['rich', 'raw', 'rich'])
    expect(setTabMode(state, '/n/b.md', 'rich').tabs.map((entry) => entry.mode)).toEqual(['rich', 'rich', 'rich'])
  })

  it('returns the same state when the mode is already set or the path is not open', () => {
    const state = threeOpen()

    expect(setTabMode(state, '/n/a.md', 'rich')).toBe(state)
    expect(setTabMode(state, '/n/zzz.md', 'raw')).toBe(state)
  })

  it('forces Raw on a Document whose Frontmatter is invalid and refuses Rich until it is fixed', () => {
    const opened = openTab(EMPTY_NOTE_TABS, tab('/n/a.md', INVALID_FRONTMATTER))
    expect(opened.tabs[0].mode).toBe('raw')
    expect(setTabMode(opened, '/n/a.md', 'rich')).toBe(opened)

    const fixed = applyModeRule([{ ...opened.tabs[0], content: VALID_FRONTMATTER }])
    expect(fixed[0].mode).toBe('raw')
    expect(setTabMode({ tabs: fixed, activeTabPath: '/n/a.md' }, '/n/a.md', 'rich').tabs[0].mode).toBe('rich')
  })

  it('moves a Rich Tab to Raw when its content turns invalid, and leaves untouched Tabs as they are', () => {
    const state = threeOpen()
    const reloaded = state.tabs.map((entry) => (entry.entry.path === '/n/b.md' ? { ...entry, content: INVALID_FRONTMATTER } : entry))

    const ruled = applyModeRule(reloaded)

    expect(ruled.map((entry) => entry.mode)).toEqual(['rich', 'raw', 'rich'])
    expect(ruled[0]).toBe(state.tabs[0])
    expect(applyModeRule(ruled)).toBe(ruled)
  })

  it('keeps the mode through a rename', () => {
    const state = retargetTabs(setTabMode(threeOpen(), '/n/b.md', 'raw'), '/n/b.md', '/n/renamed.md')

    expect(state.tabs[1].entry.path).toBe('/n/renamed.md')
    expect(state.tabs[1].mode).toBe('raw')
  })
})

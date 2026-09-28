import { describe, expect, it } from 'vitest'
import { clampSidebarWidth, parseSession, restoreOpenEditors, sessionForOpenEditors } from './session-schema'

const A = '/Users/x/notes/a.md'
const B = '/Users/x/notes/b.md'
const C = '/Users/x/notes/c.md'

describe('parseSession', () => {
  it('reads the documented schema', () => {
    const raw = {
      version: 1,
      folder: '/Users/x/notes',
      openEditors: [{ path: A, mode: 'rich' }, { path: '/Users/x/notes/cover.png' }],
      activePath: A,
      theme: 'dark',
      sidebar: { collapsed: false, width: 260, collapsedSections: ['pinned', 'explorer'] },
      pinned: { '/Users/x/notes': [C, A, '/Users/x/notes/cover.png'], '/Users/x/work': ['/Users/x/work/plan.md'] },
      recentFolders: ['/Users/x/notes', '/Users/x/work'],
      tabsByFolder: { '/Users/x/work': { openEditors: [{ path: '/Users/x/work/plan.md', mode: 'raw' }], activePath: '/Users/x/work/plan.md' } },
      window: { x: 0, y: 0, width: 1200, height: 800 },
    }

    expect(parseSession(raw)).toEqual({
      version: 1,
      folder: '/Users/x/notes',
      openEditors: [{ path: A, mode: 'rich' }, { path: '/Users/x/notes/cover.png' }],
      activePath: A,
      theme: 'dark',
      sidebar: { collapsed: false, width: 260, collapsedSections: ['pinned', 'explorer'] },
      pinned: { '/Users/x/notes': [C, A, '/Users/x/notes/cover.png'], '/Users/x/work': ['/Users/x/work/plan.md'] },
      recentFolders: ['/Users/x/notes', '/Users/x/work'],
      tabsByFolder: { '/Users/x/work': { openEditors: [{ path: '/Users/x/work/plan.md', mode: 'raw' }], activePath: '/Users/x/work/plan.md' } },
    })
  })

  it('keeps only well-formed pins: string paths inside their own Folder, each once', () => {
    const parsed = parseSession({
      version: 1,
      sidebar: { collapsed: false, width: 260, collapsedSections: ['pinned', 'pinned', 'outline', 3] },
      pinned: {
        '/Users/x/notes': [A, 42, A, '/Users/y/elsewhere.md', '/Users/x/notes', B],
        '/Users/x/empty': [],
        '/Users/x/broken': 'a.md',
      },
    })

    expect(parsed?.pinned).toEqual({ '/Users/x/notes': [A, B] })
    expect(parsed?.sidebar.collapsedSections).toEqual(['pinned'])
    expect(parseSession({ version: 1, pinned: ['a.md'] })?.pinned).toEqual({})
  })

  it('keeps each Recent Folder once, at most ten, and only the Folders with Tabs in tabsByFolder', () => {
    const folders = Array.from({ length: 12 }, (_, index) => `/Users/x/f${index}`)
    const parsed = parseSession({
      version: 1,
      recentFolders: [folders[0], 7, folders[0], '', ...folders.slice(1)],
      tabsByFolder: {
        '/Users/x/f1': { openEditors: [{ path: A }, 'b.md'], activePath: 3 },
        '/Users/x/f2': { openEditors: [] },
        '/Users/x/f3': 'tabs',
      },
    })

    expect(parsed?.recentFolders).toEqual(folders.slice(0, 10))
    expect(parsed?.tabsByFolder).toEqual({ '/Users/x/f1': { openEditors: [{ path: A }], activePath: null } })
    expect(parseSession({ version: 1, recentFolders: 'notes', tabsByFolder: [] })).toMatchObject({ recentFolders: [], tabsByFolder: {} })
  })

  it('ignores a Session with an unknown version', () => {
    expect(parseSession({ version: 2, openEditors: [{ path: A }] })).toBeNull()
    expect(parseSession({ openEditors: [{ path: A }] })).toBeNull()
  })

  it('ignores anything that is not a Session object', () => {
    expect(parseSession(null)).toBeNull()
    expect(parseSession('session')).toBeNull()
    expect(parseSession([])).toBeNull()
  })

  it('drops malformed entries and falls back to the defaults for the rest', () => {
    const parsed = parseSession({
      version: 1,
      openEditors: [{ path: A, mode: 'sideways' }, { mode: 'rich' }, 'b.md', { path: B, mode: 'raw' }],
      activePath: 42,
      theme: 'sepia',
      sidebar: { collapsed: 'yes' },
    })

    expect(parsed).toEqual({
      version: 1,
      folder: null,
      openEditors: [{ path: A }, { path: B, mode: 'raw' }],
      activePath: null,
      theme: 'light',
      sidebar: { collapsed: false, width: 260 },
      pinned: {},
      recentFolders: [],
      tabsByFolder: {},
    })
  })
})

describe('restoreOpenEditors', () => {
  const session = parseSession({
    version: 1,
    openEditors: [{ path: A, mode: 'rich' }, { path: B, mode: 'rich' }, { path: C, mode: 'rich' }],
    activePath: B,
  })!

  it('keeps every surviving Tab in order with the same active Tab', () => {
    expect(restoreOpenEditors(session, new Set([A, B, C]))).toEqual({
      openEditors: [{ path: A, mode: 'rich' }, { path: B, mode: 'rich' }, { path: C, mode: 'rich' }],
      activePath: B,
    })
  })

  it('drops a Tab whose file is gone and keeps the active Tab when it survives', () => {
    expect(restoreOpenEditors(session, new Set([B, C]))).toEqual({
      openEditors: [{ path: B, mode: 'rich' }, { path: C, mode: 'rich' }],
      activePath: B,
    })
  })

  it('activates the next surviving Tab in order when the active file is gone', () => {
    expect(restoreOpenEditors(session, new Set([A, C]))).toEqual({
      openEditors: [{ path: A, mode: 'rich' }, { path: C, mode: 'rich' }],
      activePath: C,
    })
  })

  it('falls back to the previous surviving Tab when nothing follows the active one', () => {
    const lastActive = { ...session, activePath: C }
    expect(restoreOpenEditors(lastActive, new Set([A]))).toEqual({
      openEditors: [{ path: A, mode: 'rich' }],
      activePath: A,
    })
  })

  it('restores an empty Session with no active Tab', () => {
    expect(restoreOpenEditors(session, new Set())).toEqual({ openEditors: [], activePath: null })
  })

  it('activates the first Tab when the Session names no active path', () => {
    const noActive = { ...session, activePath: null }
    expect(restoreOpenEditors(noActive, new Set([A, B, C])).activePath).toBe(A)
  })
})

describe('sessionForOpenEditors', () => {
  it('writes the Tabs in order as Rich Documents and the chosen theme, the other fields at their defaults', () => {
    expect(sessionForOpenEditors([{ path: B }, { path: A }], A, 'light')).toEqual({
      version: 1,
      folder: null,
      openEditors: [{ path: B, mode: 'rich' }, { path: A, mode: 'rich' }],
      activePath: A,
      theme: 'light',
      sidebar: { collapsed: false, width: 260 },
      pinned: {},
      recentFolders: [],
      tabsByFolder: {},
    })
  })

  it('writes each Document with its own mode', () => {
    const session = sessionForOpenEditors([{ path: A, mode: 'raw' }, { path: B, mode: 'rich' }], A, 'dark')

    expect(session.openEditors).toEqual([{ path: A, mode: 'raw' }, { path: B, mode: 'rich' }])
  })

  it('leaves an Image file entry without a mode, its kind being the extension', () => {
    const session = sessionForOpenEditors([{ path: A }, { path: '/Users/x/notes/cover.png', mode: 'raw' }], A, 'dark')

    expect(session.openEditors).toEqual([{ path: A, mode: 'rich' }, { path: '/Users/x/notes/cover.png' }])
  })

  it('writes system when the appearance follows the OS', () => {
    expect(sessionForOpenEditors([], null, 'system').theme).toBe('system')
  })

  it('writes the sidebar state it is given', () => {
    const session = sessionForOpenEditors([{ path: A }], A, 'dark', '/Users/x/notes', { collapsed: true, width: 320 })

    expect(session.folder).toBe('/Users/x/notes')
    expect(session.sidebar).toEqual({ collapsed: true, width: 320 })
  })

  it('writes the folded sections and every Folder\'s Pinned list it is given', () => {
    const pinned = { '/Users/x/notes': [B, A], '/Users/x/work': ['/Users/x/work/plan.md'] }
    const session = sessionForOpenEditors([], null, 'dark', '/Users/x/notes', { collapsed: false, width: 260, collapsedSections: ['pinned'] }, pinned)

    expect(session.sidebar).toEqual({ collapsed: false, width: 260, collapsedSections: ['pinned'] })
    expect(session.pinned).toEqual(pinned)
    expect(parseSession(JSON.parse(JSON.stringify(session)))).toEqual(session)
  })

  it('writes the Recent Folders and the other Folders\' Tabs it is given', () => {
    const tabsByFolder = { '/Users/x/work': { openEditors: [{ path: '/Users/x/work/plan.md', mode: 'rich' as const }], activePath: null } }
    const session = sessionForOpenEditors([], null, 'dark', '/Users/x/notes', undefined, {}, { paths: ['/Users/x/notes', '/Users/x/work'], tabsByFolder })

    expect(session.recentFolders).toEqual(['/Users/x/notes', '/Users/x/work'])
    expect(session.tabsByFolder).toEqual(tabsByFolder)
    expect(parseSession(JSON.parse(JSON.stringify(session)))).toEqual(session)
  })
})

describe('the sidebar width', () => {
  it('is clamped to the range the sidebar can actually take, whether restored or written', () => {
    expect(clampSidebarWidth(20)).toBe(180)
    expect(clampSidebarWidth(9000)).toBe(480)
    expect(clampSidebarWidth(300.6)).toBe(301)
    expect(parseSession({ version: 1, sidebar: { collapsed: true, width: 20 } })?.sidebar).toEqual({ collapsed: true, width: 180 })
  })
})

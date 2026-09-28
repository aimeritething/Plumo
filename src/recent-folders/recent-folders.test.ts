import { describe, expect, it } from 'vitest'
import type { ListedFile } from '@/folder/explorer'
import {
  folderContentsSummary,
  folderName,
  forgetFolder,
  MAX_RECENT_FOLDERS,
  rememberFolder,
  restoredRecentFolders,
  stashTabs,
  takeTabs,
  tildePath,
  type RecentFolders,
} from './recent-folders'

const NOTES = '/Users/x/notes'
const WORK = '/Users/x/work'
const tabsOf = (path: string) => ({ openEditors: [{ path: `${path}/a.md`, mode: 'rich' as const }], activePath: `${path}/a.md` })
const recent = (paths: string[], tabsByFolder: RecentFolders['tabsByFolder'] = {}): RecentFolders => ({ paths, tabsByFolder })

describe('rememberFolder', () => {
  it('puts a Folder just opened first, once', () => {
    expect(rememberFolder(recent([]), NOTES).paths).toEqual([NOTES])
    expect(rememberFolder(recent([NOTES, WORK]), WORK).paths).toEqual([WORK, NOTES])
  })

  it('changes nothing when the Folder is already first', () => {
    const list = recent([NOTES, WORK])
    expect(rememberFolder(list, NOTES)).toBe(list)
  })

  it('keeps ten; the one pushed off takes its Tabs with it, the others keep theirs', () => {
    const paths = Array.from({ length: MAX_RECENT_FOLDERS }, (_, index) => `/f${index}`)
    const oldest = paths.at(-1)!
    const next = rememberFolder(recent(paths, { [oldest]: tabsOf(oldest), '/f1': tabsOf('/f1') }), '/new')

    expect(next.paths).toHaveLength(MAX_RECENT_FOLDERS)
    expect(next.paths[0]).toBe('/new')
    expect(next.paths).not.toContain(oldest)
    expect(next.tabsByFolder).toEqual({ '/f1': tabsOf('/f1') })
  })
})

describe('forgetFolder', () => {
  it('drops a Folder and its Tabs', () => {
    const next = forgetFolder(recent([NOTES, WORK], { [WORK]: tabsOf(WORK) }), WORK)
    expect(next).toEqual(recent([NOTES]))
  })

  it('leaves the list alone for a Folder not in it', () => {
    const list = recent([NOTES])
    expect(forgetFolder(list, WORK)).toBe(list)
  })
})

describe('stashTabs and takeTabs', () => {
  it('hands a Folder back the Tabs it was left with, once', () => {
    const stashed = stashTabs(recent([WORK, NOTES]), NOTES, tabsOf(NOTES))
    const [tabs, after] = takeTabs(stashed, NOTES)

    expect(tabs).toEqual(tabsOf(NOTES))
    expect(after.tabsByFolder).toEqual({})
    expect(takeTabs(after, NOTES)[0]).toBeUndefined()
  })

  it('leaves no key for a Folder left with no Tab, replacing what it had', () => {
    const stashed = stashTabs(recent([NOTES], { [NOTES]: tabsOf(NOTES) }), NOTES, { openEditors: [], activePath: null })
    expect(stashed.tabsByFolder).toEqual({})
  })
})

describe('restoredRecentFolders', () => {
  it('adds a Folder restored from before there were Recent Folders, first', () => {
    expect(restoredRecentFolders(recent([WORK]), NOTES).paths).toEqual([NOTES, WORK])
    expect(restoredRecentFolders(recent([WORK, NOTES]), NOTES).paths).toEqual([WORK, NOTES])
  })

  it('drops Tabs kept for the current Folder or for a Folder not in the list', () => {
    const saved = recent([NOTES, WORK], { [NOTES]: tabsOf(NOTES), [WORK]: tabsOf(WORK), '/gone': tabsOf('/gone') })
    expect(restoredRecentFolders(saved, NOTES).tabsByFolder).toEqual({ [WORK]: tabsOf(WORK) })
  })

  it('keeps the list as it is with no Folder open', () => {
    const saved = recent([NOTES, WORK], { [NOTES]: tabsOf(NOTES) })
    expect(restoredRecentFolders(saved, null)).toEqual(saved)
  })
})

describe('the Folder as the switcher shows it', () => {
  it('names a Folder by its last segment, the root by its path', () => {
    expect(folderName(NOTES)).toBe('notes')
    expect(folderName('/')).toBe('/')
  })

  it('writes a path under the home directory with a tilde', () => {
    expect(tildePath('/Users/x/Documents/Notes', '/Users/x')).toBe('~/Documents/Notes')
    expect(tildePath('/Users/x', '/Users/x/')).toBe('~')
    expect(tildePath('/Users/xy/Notes', '/Users/x')).toBe('/Users/xy/Notes')
    expect(tildePath('/Volumes/Notes', null)).toBe('/Volumes/Notes')
  })

  it('counts Documents and sub-folders at any depth, never Image files', () => {
    const file = (path: string, kind: ListedFile['kind']): ListedFile => ({ path, kind, modifiedAt: null, fileSize: 0 })
    const files = [
      file(`${NOTES}/a.md`, 'note'),
      file(`${NOTES}/sub`, 'folder'),
      file(`${NOTES}/sub/b.md`, 'note'),
      file(`${NOTES}/sub/deeper`, 'folder'),
      file(`${NOTES}/cover.png`, 'image'),
    ]

    expect(folderContentsSummary(files)).toBe('2 Documents, 2 folders')
    expect(folderContentsSummary([file(`${NOTES}/a.md`, 'note'), file(`${NOTES}/sub`, 'folder')])).toBe('1 Document, 1 folder')
    expect(folderContentsSummary([file(`${NOTES}/cover.png`, 'image')])).toBe('No Documents')
    expect(folderContentsSummary([file(`${NOTES}/sub`, 'folder')])).toBe('No Documents, 1 folder')
  })
})

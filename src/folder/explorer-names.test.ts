import { describe, expect, it } from 'vitest'
import { buildExplorerTree, type ListedFile } from './explorer'
import {
  creationParentPath,
  lockedExtension,
  nameCommitError,
  duplicateName,
  nextAvailableName,
  siblingNames,
  stripBlockedNameCharacters,
} from './explorer-names'

const FOLDER = '/Notes'

function listed(path: string, kind: ListedFile['kind']): ListedFile {
  return { path: `${FOLDER}/${path}`, kind, modifiedAt: null, fileSize: 0 }
}

const TREE = buildExplorerTree(FOLDER, [
  listed('Welcome.md', 'note'),
  listed('Projects', 'folder'),
  listed('Projects/Plumo.md', 'note'),
  listed('Projects/lake.png', 'image'),
])

describe('creationParentPath', () => {
  it('puts a new Document inside the selected folder', () => {
    expect(creationParentPath(TREE, `${FOLDER}/Projects`)).toBe(`${FOLDER}/Projects`)
  })

  it('puts a new Document inside the Folder root when the Folder itself is selected', () => {
    expect(creationParentPath(TREE, FOLDER)).toBe(FOLDER)
  })

  it('puts a new Document in the parent of a selected Document', () => {
    expect(creationParentPath(TREE, `${FOLDER}/Projects/Plumo.md`)).toBe(`${FOLDER}/Projects`)
  })

  it('puts a new Document in the parent of a selected Image file', () => {
    expect(creationParentPath(TREE, `${FOLDER}/Projects/lake.png`)).toBe(`${FOLDER}/Projects`)
  })

  it('falls back to the Folder root with nothing selected', () => {
    expect(creationParentPath(TREE, null)).toBe(FOLDER)
  })

  it('falls back to the Folder root when the selected row has gone', () => {
    expect(creationParentPath(TREE, `${FOLDER}/Deleted.md`)).toBe(FOLDER)
  })
})

describe('duplicateName', () => {
  it('adds copy to the stem and keeps the extension', () => {
    expect(duplicateName(['Plan.md'], 'Plan.md')).toBe('Plan copy.md')
    expect(duplicateName(['lake.png'], 'lake.png')).toBe('lake copy.png')
  })

  it('counts on Finder style once the copy is taken', () => {
    expect(duplicateName(['Plan.md', 'Plan copy.md'], 'Plan.md')).toBe('Plan copy 2.md')
    expect(duplicateName(['Plan.md', 'plan copy.md', 'Plan copy 2.md'], 'Plan.md')).toBe('Plan copy 3.md')
  })

  it('counts on from a copy rather than stacking another copy', () => {
    expect(duplicateName(['Plan.md', 'Plan copy.md'], 'Plan copy.md')).toBe('Plan copy 2.md')
    expect(duplicateName(['Plan copy.md', 'Plan copy 2.md'], 'Plan copy 2.md')).toBe('Plan copy 3.md')
  })

  it('leaves a stem that only contains the word alone', () => {
    expect(duplicateName(['copyedit.md'], 'copyedit.md')).toBe('copyedit copy.md')
  })
})

describe('nextAvailableName', () => {
  it('takes the plain name when nothing holds it', () => {
    expect(nextAvailableName([], 'Untitled', '.md')).toBe('Untitled.md')
  })

  it('suffixes Finder style with a space', () => {
    expect(nextAvailableName(['Untitled.md'], 'Untitled', '.md')).toBe('Untitled 2.md')
    expect(nextAvailableName(['Untitled.md', 'Untitled 2.md'], 'Untitled', '.md')).toBe('Untitled 3.md')
  })

  it('skips a name a sibling holds in another case', () => {
    expect(nextAvailableName(['untitled.md'], 'Untitled', '.md')).toBe('Untitled 2.md')
  })

  it('suffixes folders, which have no extension', () => {
    expect(nextAvailableName(['New Folder'], 'New Folder', '')).toBe('New Folder 2')
  })

  it('fills the first free suffix rather than counting siblings', () => {
    expect(nextAvailableName(['Untitled.md', 'Untitled 3.md'], 'Untitled', '.md')).toBe('Untitled 2.md')
  })
})

describe('siblingNames', () => {
  it('lists the names beside a path, leaving the path itself out', () => {
    expect(siblingNames(TREE, `${FOLDER}/Projects/Plumo.md`)).toEqual(['lake.png'])
  })

  it('lists every name in a folder when nothing is excluded', () => {
    expect(siblingNames(TREE, `${FOLDER}/Projects`, { of: 'children' }).sort()).toEqual(['Plumo.md', 'lake.png'])
  })
})

describe('lockedExtension', () => {
  it('splits a Document into the editable stem and the locked extension', () => {
    expect(lockedExtension('Meeting notes.md')).toEqual({ stem: 'Meeting notes', extension: '.md' })
  })

  it('locks only the last extension', () => {
    expect(lockedExtension('archive.tar.gz')).toEqual({ stem: 'archive.tar', extension: '.gz' })
  })

  it('gives a folder no extension', () => {
    expect(lockedExtension('Projects')).toEqual({ stem: 'Projects', extension: '' })
  })

  it('treats a leading dot as part of the stem, not an extension', () => {
    expect(lockedExtension('.gitignore')).toEqual({ stem: '.gitignore', extension: '' })
  })
})

describe('stripBlockedNameCharacters', () => {
  it('blocks a slash as it is typed', () => {
    expect(stripBlockedNameCharacters('a/b')).toBe('ab')
  })

  it('leaves every other character alone', () => {
    expect(stripBlockedNameCharacters('Q3 plan (draft).v2')).toBe('Q3 plan (draft).v2')
  })
})

describe('nameCommitError', () => {
  const siblings = ['Welcome.md', 'lake.png', 'Projects']

  it('accepts a free name', () => {
    expect(nameCommitError({ kind: 'note', stem: 'Roadmap', extension: '.md', siblings })).toBeNull()
  })

  it('reports a Document collision by name', () => {
    expect(nameCommitError({ kind: 'note', stem: 'Welcome', extension: '.md', siblings }))
      .toBe('A Document named Welcome.md already exists')
  })

  it('reports an Image file collision', () => {
    expect(nameCommitError({ kind: 'image', stem: 'lake', extension: '.png', siblings }))
      .toBe('An Image file named lake.png already exists')
  })

  it('reports a folder collision', () => {
    expect(nameCommitError({ kind: 'folder', stem: 'Projects', extension: '', siblings }))
      .toBe('A folder named Projects already exists')
  })

  it('reports a collision whatever the case, as the filesystem sees it', () => {
    expect(nameCommitError({ kind: 'note', stem: 'welcome', extension: '.md', siblings }))
      .toBe('A Document named welcome.md already exists')
  })

  it('reports a leading dot', () => {
    expect(nameCommitError({ kind: 'note', stem: '.secret', extension: '.md', siblings }))
      .toBe('A name cannot start with a dot')
  })

  it('reports a trailing dot or space, which the Rust side would quietly trim', () => {
    expect(nameCommitError({ kind: 'note', stem: 'Draft.', extension: '.md', siblings }))
      .toBe('A name cannot end with a space or a dot')
    expect(nameCommitError({ kind: 'note', stem: 'Draft ', extension: '.md', siblings }))
      .toBe('A name cannot end with a space or a dot')
    expect(nameCommitError({ kind: 'folder', stem: 'Draft ', extension: '', siblings }))
      .toBe('A name cannot end with a space or a dot')
  })

  it('reports a control character', () => {
    expect(nameCommitError({ kind: 'note', stem: 'Draft\u0007', extension: '.md', siblings }))
      .toBe('A name cannot contain control characters')
  })

  it('reports the characters the filesystem refuses', () => {
    expect(nameCommitError({ kind: 'note', stem: 'Q3: plan', extension: '.md', siblings }))
      .toBe('A name cannot contain < > : " \\ | ? *')
  })

  it('reports a name Windows reserves', () => {
    expect(nameCommitError({ kind: 'note', stem: 'con', extension: '.md', siblings }))
      .toBe('con is a reserved name')
  })

  it('has nothing to say about an empty name, which cancels instead', () => {
    expect(nameCommitError({ kind: 'note', stem: '   ', extension: '.md', siblings })).toBeNull()
  })
})

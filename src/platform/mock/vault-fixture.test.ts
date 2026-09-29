import { describe, expect, it } from 'vitest'
import { createMockVault, MOCK_VAULT_PATH, type MockVaultFile } from './vault-fixture'

const seed: MockVaultFile[] = [
  { path: `${MOCK_VAULT_PATH}/Welcome.md`, kind: 'note', content: '# Welcome\n', modifiedAt: 10, fileSize: 10 },
  { path: `${MOCK_VAULT_PATH}/Projects`, kind: 'folder', modifiedAt: 10, fileSize: 0 },
  { path: `${MOCK_VAULT_PATH}/Projects/Plan.md`, kind: 'note', content: '# Plan\n', modifiedAt: 11, fileSize: 7 },
  { path: `${MOCK_VAULT_PATH}/Projects/Archive`, kind: 'folder', modifiedAt: 10, fileSize: 0 },
  { path: `${MOCK_VAULT_PATH}/Attachments`, kind: 'folder', modifiedAt: 10, fileSize: 0 },
  { path: `${MOCK_VAULT_PATH}/Attachments/photo.png`, kind: 'image', modifiedAt: 12, fileSize: 2048 },
]

describe('createMockVault', () => {
  it('answers list_files with every seeded entry as path, kind, modifiedAt and fileSize', async () => {
    const vault = createMockVault(seed)

    const files = await vault.invoke('list_files', { vaultPath: MOCK_VAULT_PATH })

    expect(files).toEqual(seed.map(({ path, kind, modifiedAt, fileSize }) => ({ path, kind, modifiedAt, fileSize })))
  })

  it('rejects list_files for any root other than the mock Folder', async () => {
    const vault = createMockVault(seed)

    await expect(vault.invoke('list_files', { vaultPath: '/elsewhere' })).rejects.toThrow('Active vault is not available')
  })

  it('round-trips Document content through get and save and refreshes the listing', async () => {
    const vault = createMockVault(seed)
    const path = `${MOCK_VAULT_PATH}/Welcome.md`

    await expect(vault.invoke('get_note_content', { path })).resolves.toBe('# Welcome\n')
    await vault.invoke('save_note_content', { path, content: '# Welcome\n\nEdited.\n' })

    await expect(vault.invoke('get_note_content', { path })).resolves.toBe('# Welcome\n\nEdited.\n')
    const files = await vault.invoke('list_files', { vaultPath: MOCK_VAULT_PATH })
    const welcome = files.find((file) => file.path === path)
    expect(welcome?.fileSize).toBe('# Welcome\n\nEdited.\n'.length)
    expect(welcome?.modifiedAt).toBeGreaterThan(10)
  })

  it('creates a Document on save when the path is new and rejects paths outside the Folder', async () => {
    const vault = createMockVault(seed)
    const created = `${MOCK_VAULT_PATH}/Projects/New.md`

    await vault.invoke('save_note_content', { path: created, content: 'fresh\n' })

    await expect(vault.invoke('get_note_content', { path: created })).resolves.toBe('fresh\n')
    await expect(vault.invoke('get_note_content', { path: `${MOCK_VAULT_PATH}/missing.md` })).rejects.toThrow('File does not exist')
    await expect(vault.invoke('save_note_content', { path: '/outside/note.md', content: '' })).rejects.toThrow(
      'Path must stay inside the active vault',
    )
  })

  it('tracks the watcher root across start and stop', async () => {
    const vault = createMockVault(seed)

    expect(vault.watchedPath()).toBeNull()
    await vault.invoke('start_vault_watcher', { path: MOCK_VAULT_PATH })
    expect(vault.watchedPath()).toBe(MOCK_VAULT_PATH)
    await vault.invoke('stop_vault_watcher')
    expect(vault.watchedPath()).toBeNull()
  })

  it('drains pending opens on take_pending_open', async () => {
    const vault = createMockVault(seed)
    vault.queuePendingOpen([`${MOCK_VAULT_PATH}/Welcome.md`])

    await expect(vault.invoke('take_pending_open')).resolves.toEqual([`${MOCK_VAULT_PATH}/Welcome.md`])
    await expect(vault.invoke('take_pending_open')).resolves.toEqual([])
  })

  it('openFromFinder buffers the paths and pokes the window, as an open while running does', async () => {
    const vault = createMockVault(seed)
    const pokes: unknown[] = []
    const handle = (event: Event) => pokes.push((event as CustomEvent).detail)
    window.addEventListener('plumo:open-files', handle)

    try {
      vault.openFromFinder([`${MOCK_VAULT_PATH}/Projects/Plan.md`])
    } finally {
      window.removeEventListener('plumo:open-files', handle)
    }

    expect(pokes).toEqual([[`${MOCK_VAULT_PATH}/Projects/Plan.md`]])
    await expect(vault.invoke('take_pending_open')).resolves.toEqual([`${MOCK_VAULT_PATH}/Projects/Plan.md`])
  })

  it('a seeded pending open is what the next fixture (page load) finds buffered, once', async () => {
    createMockVault(seed).seedPendingOpen([`${MOCK_VAULT_PATH}/Welcome.md`])

    const relaunched = createMockVault(seed)
    await expect(relaunched.invoke('take_pending_open')).resolves.toEqual([`${MOCK_VAULT_PATH}/Welcome.md`])

    const relaunchedAgain = createMockVault(seed)
    await expect(relaunchedAgain.invoke('take_pending_open')).resolves.toEqual([])
  })

  it('records every invocation so specs can assert on the command boundary', async () => {
    const vault = createMockVault(seed)

    await vault.invoke('take_pending_open')
    await vault.invoke('get_note_content', { path: `${MOCK_VAULT_PATH}/Welcome.md` })

    expect(vault.calls).toEqual([
      { command: 'take_pending_open', args: undefined },
      { command: 'get_note_content', args: { path: `${MOCK_VAULT_PATH}/Welcome.md` } },
    ])
  })

  it('writes a Document directly without logging a command', async () => {
    const vault = createMockVault(seed)
    const path = `${MOCK_VAULT_PATH}/Direct.md`

    vault.writeNote(path, 'direct\n')

    expect(vault.calls).toEqual([])
    await expect(vault.invoke('get_note_content', { path })).resolves.toBe('direct\n')
    expect(() => vault.writeNote('/outside/note.md', '')).toThrow('Path must stay inside the active vault')
  })

  it('refuses to turn a folder or an Image file into a Document', async () => {
    const vault = createMockVault(seed)

    await expect(vault.invoke('save_note_content', { path: `${MOCK_VAULT_PATH}/Projects`, content: '' })).rejects.toThrow(
      'Path is not a note',
    )
    expect(() => vault.writeNote(`${MOCK_VAULT_PATH}/Attachments/photo.png`, '')).toThrow('Path is not a note')
  })

  it('creates the ancestor folders of seeded and saved paths implicitly', async () => {
    const vault = createMockVault([
      { path: `${MOCK_VAULT_PATH}/Projects/Archive/Old.md`, kind: 'note', content: '', modifiedAt: 5, fileSize: 0 },
    ])
    await vault.invoke('save_note_content', { path: `${MOCK_VAULT_PATH}/Inbox/Today.md`, content: 'x' })

    const files = await vault.invoke('list_files', { vaultPath: MOCK_VAULT_PATH })
    expect(files.filter((entry) => entry.kind === 'folder').map((entry) => entry.path)).toEqual([
      `${MOCK_VAULT_PATH}/Projects`,
      `${MOCK_VAULT_PATH}/Projects/Archive`,
      `${MOCK_VAULT_PATH}/Inbox`,
    ])
  })

  it('rejects commands it does not answer and resets to the seed', async () => {
    const vault = createMockVault(seed)
    await vault.invoke('save_note_content', { path: `${MOCK_VAULT_PATH}/Welcome.md`, content: 'changed' })

    await expect(vault.invoke('unknown_command', { path: 'x' })).rejects.toThrow(
      'No mock handler for command: unknown_command',
    )

    vault.reset()
    expect(vault.calls).toEqual([])
    await expect(vault.invoke('get_note_content', { path: `${MOCK_VAULT_PATH}/Welcome.md` })).resolves.toBe('# Welcome\n')
  })
})

describe('the Open Document dialog stand-in', () => {
  it('hands out queued selections one at a time, then reports a cancelled dialog', () => {
    const vault = createMockVault(seed)
    vault.queueDialogSelection([`${MOCK_VAULT_PATH}/Welcome.md`, `${MOCK_VAULT_PATH}/Projects/Plan.md`])

    expect(vault.takeDialogSelection()).toBe(`${MOCK_VAULT_PATH}/Welcome.md`)
    expect(vault.takeDialogSelection()).toBe(`${MOCK_VAULT_PATH}/Projects/Plan.md`)
    expect(vault.takeDialogSelection()).toBeNull()
  })

  it('forgets queued selections on reset', () => {
    const vault = createMockVault(seed)
    vault.queueDialogSelection([`${MOCK_VAULT_PATH}/Welcome.md`])

    vault.reset()

    expect(vault.takeDialogSelection()).toBeNull()
  })
})

describe('read-only paths', () => {
  it('refuses save_note_content for a marked path and keeps the bytes, until the mark is lifted', async () => {
    const vault = createMockVault(seed)
    const path = `${MOCK_VAULT_PATH}/Welcome.md`
    vault.markReadOnly([path])

    await expect(vault.invoke('save_note_content', { path, content: '# Changed\n' })).rejects.toThrow('Permission denied')
    await expect(vault.invoke('get_note_content', { path })).resolves.toBe('# Welcome\n')

    vault.markReadOnly([])
    await vault.invoke('save_note_content', { path, content: '# Changed\n' })
    await expect(vault.invoke('get_note_content', { path })).resolves.toBe('# Changed\n')
  })
})

describe('the Session file in the fixture', () => {
  it('answers read_session with null until a Session is written, then with the last write', async () => {
    const vault = createMockVault(seed)
    const session = { version: 1, openEditors: [{ path: `${MOCK_VAULT_PATH}/Welcome.md`, mode: 'rich' }], activePath: null }

    await expect(vault.invoke('read_session')).resolves.toBeNull()
    await vault.invoke('update_session', { session })

    await expect(vault.invoke('read_session')).resolves.toEqual(session)
  })

  it('keeps the Session across fixtures, as a relaunch would, until reset clears it', async () => {
    const first = createMockVault(seed)
    await first.invoke('update_session', { session: { version: 1, openEditors: [], activePath: null } })

    const relaunched = createMockVault(seed)
    await expect(relaunched.invoke('read_session')).resolves.toEqual({ version: 1, openEditors: [], activePath: null })

    relaunched.reset()
    await expect(relaunched.invoke('read_session')).resolves.toBeNull()
  })

  it('lets a spec seed the Session a launch will find', async () => {
    const vault = createMockVault(seed)
    vault.seedSession({ version: 1, openEditors: [{ path: `${MOCK_VAULT_PATH}/Welcome.md` }], activePath: null })

    await expect(vault.invoke('read_session')).resolves.toMatchObject({ version: 1, activePath: null })
  })
})

describe('the Explorer write operations in the fixture', () => {
  it('creates a Document and refuses a name it already holds', async () => {
    const vault = createMockVault(seed)
    const path = `${MOCK_VAULT_PATH}/Untitled.md`

    await vault.invoke('create_note_content', { path, content: '', vaultPath: MOCK_VAULT_PATH })

    await expect(vault.invoke('get_note_content', { path })).resolves.toBe('')
    await expect(vault.invoke('create_note_content', { path, content: '', vaultPath: MOCK_VAULT_PATH }))
      .rejects.toThrow('File already exists')
  })

  it('duplicates a file beside it and refuses a name it already holds', async () => {
    const vault = createMockVault(seed)
    const path = `${MOCK_VAULT_PATH}/Welcome.md`
    const newPath = `${MOCK_VAULT_PATH}/Welcome copy.md`

    await vault.invoke('duplicate_vault_file', { path, newPath, vaultPath: MOCK_VAULT_PATH })

    await expect(vault.invoke('get_note_content', { path: newPath })).resolves.toBe('# Welcome\n')
    await expect(vault.invoke('duplicate_vault_file', { path, newPath, vaultPath: MOCK_VAULT_PATH }))
      .rejects.toThrow('File already exists')
  })

  it('creates a folder under a parent and refuses a second of the same name', async () => {
    const vault = createMockVault(seed)
    const args = { vaultPath: MOCK_VAULT_PATH, folderName: 'New Folder', parentPath: 'Projects' }

    await expect(vault.invoke('create_vault_folder', args)).resolves.toBe('New Folder')
    expect(vault.files().some((file) => file.path === `${MOCK_VAULT_PATH}/Projects/New Folder`)).toBe(true)
    await expect(vault.invoke('create_vault_folder', args)).rejects.toThrow("Folder 'New Folder' already exists")
  })

  it('renames a file, keeping its extension and its content', async () => {
    const vault = createMockVault(seed)

    const renamed = await vault.invoke('rename_vault_file', {
      vaultPath: MOCK_VAULT_PATH,
      oldPath: `${MOCK_VAULT_PATH}/Attachments/photo.png`,
      newStem: 'Lake',
    })

    expect(renamed).toEqual({ new_path: `${MOCK_VAULT_PATH}/Attachments/Lake.png` })
    expect(vault.files().some((file) => file.path === `${MOCK_VAULT_PATH}/Attachments/photo.png`)).toBe(false)
  })

  it('refuses a rename onto a name a sibling already holds', async () => {
    const vault = createMockVault(seed)
    await vault.invoke('create_note_content', {
      path: `${MOCK_VAULT_PATH}/Projects/Taken.md`,
      content: '',
      vaultPath: MOCK_VAULT_PATH,
    })

    await expect(vault.invoke('rename_vault_file', {
      vaultPath: MOCK_VAULT_PATH,
      oldPath: `${MOCK_VAULT_PATH}/Projects/Plan.md`,
      newStem: 'Taken',
    })).rejects.toThrow('A file with that name already exists')
    await expect(vault.invoke('get_note_content', { path: `${MOCK_VAULT_PATH}/Projects/Plan.md` }))
      .resolves.toBe('# Plan\n')
  })

  it('renames a folder and moves everything under it', async () => {
    const vault = createMockVault(seed)

    const renamed = await vault.invoke('rename_vault_folder', {
      vaultPath: MOCK_VAULT_PATH,
      folderPath: 'Projects',
      newName: 'Work',
    })

    expect(renamed).toEqual({ old_path: 'Projects', new_path: 'Work' })
    const paths = vault.files().map((file) => file.path)
    expect(paths).toContain(`${MOCK_VAULT_PATH}/Work/Plan.md`)
    expect(paths).toContain(`${MOCK_VAULT_PATH}/Work/Archive`)
    expect(paths).not.toContain(`${MOCK_VAULT_PATH}/Projects/Plan.md`)
  })

  it('records Reveal in Finder and Copy Path for a spec to assert on', async () => {
    const vault = createMockVault(seed)

    await vault.invoke('reveal_path_in_file_manager', { path: `${MOCK_VAULT_PATH}/Welcome.md` })
    await vault.invoke('copy_text_to_clipboard', { text: `${MOCK_VAULT_PATH}/Welcome.md` })

    expect(vault.revealedPath()).toBe(`${MOCK_VAULT_PATH}/Welcome.md`)
    expect(vault.clipboardText()).toBe(`${MOCK_VAULT_PATH}/Welcome.md`)
  })
  it('moves a file to the Trash and takes a folder\'s whole subtree with it', async () => {
    const vault = createMockVault(seed)

    await vault.invoke('delete_note', { path: `${MOCK_VAULT_PATH}/Welcome.md`, vaultPath: MOCK_VAULT_PATH })
    await vault.invoke('delete_vault_folder', { vaultPath: MOCK_VAULT_PATH, folderPath: 'Projects' })

    const paths = vault.files().map((file) => file.path)
    expect(paths).not.toContain(`${MOCK_VAULT_PATH}/Welcome.md`)
    expect(paths).not.toContain(`${MOCK_VAULT_PATH}/Projects`)
    expect(paths).not.toContain(`${MOCK_VAULT_PATH}/Projects/Plan.md`)
    expect(paths).toContain(`${MOCK_VAULT_PATH}/Attachments/photo.png`)
  })

  it('refuses to Trash a file that is not there', async () => {
    const vault = createMockVault(seed)

    await expect(vault.invoke('delete_note', { path: `${MOCK_VAULT_PATH}/gone.md`, vaultPath: MOCK_VAULT_PATH }))
      .rejects.toThrow('File does not exist')
  })

  it('moves a file into another folder, keeping its name and its bytes', async () => {
    const vault = createMockVault(seed)

    const moved = await vault.invoke('move_note_to_folder', {
      vaultPath: MOCK_VAULT_PATH,
      oldPath: `${MOCK_VAULT_PATH}/Welcome.md`,
      folderPath: 'Projects',
    })

    expect(moved).toEqual({ new_path: `${MOCK_VAULT_PATH}/Projects/Welcome.md` })
    await expect(vault.invoke('get_note_content', { path: `${MOCK_VAULT_PATH}/Projects/Welcome.md` }))
      .resolves.toBe('# Welcome\n')
  })

  it('refuses a move onto a name the destination already holds', async () => {
    const vault = createMockVault(seed)
    await vault.invoke('create_note_content', {
      path: `${MOCK_VAULT_PATH}/Projects/Welcome.md`,
      content: 'taken\n',
      vaultPath: MOCK_VAULT_PATH,
    })

    await expect(vault.invoke('move_note_to_folder', {
      vaultPath: MOCK_VAULT_PATH,
      oldPath: `${MOCK_VAULT_PATH}/Welcome.md`,
      folderPath: 'Projects',
    })).rejects.toThrow('A file with that name already exists')
    await expect(vault.invoke('get_note_content', { path: `${MOCK_VAULT_PATH}/Welcome.md` })).resolves.toBe('# Welcome\n')
  })

  it('takes the empty folder path as the Folder root', async () => {
    const vault = createMockVault(seed)

    const moved = await vault.invoke('move_note_to_folder', {
      vaultPath: MOCK_VAULT_PATH,
      oldPath: `${MOCK_VAULT_PATH}/Projects/Plan.md`,
      folderPath: '',
    })

    expect(moved).toEqual({ new_path: `${MOCK_VAULT_PATH}/Plan.md` })
  })
  it('moves a path outside any command, the way another app would', () => {
    const vault = createMockVault(seed)

    vault.movePath(`${MOCK_VAULT_PATH}/Projects`, `${MOCK_VAULT_PATH}/Work`)

    const paths = vault.files().map((file) => file.path)
    expect(paths).toContain(`${MOCK_VAULT_PATH}/Work/Plan.md`)
    expect(paths).not.toContain(`${MOCK_VAULT_PATH}/Projects/Plan.md`)
    expect(vault.calls).toEqual([])
  })
})

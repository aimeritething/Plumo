import { expect, test, type Page } from '@playwright/test'
// Type-only: brings the fixture's `window.__plumoMockVault` declaration into the spec program.
import type { MockVault } from '../../src/platform/mock/vault-fixture'
import { MOCK_FOLDER, openDocumentThroughDialog, watchForErrors, WELCOME_PATH } from './harness'

// The Session survives a relaunch. The
// fixture keeps its Session file in localStorage, so a page reload stands in
// for quit and relaunch. The window frame is the Rust side's part of the file
// and does not appear here.

const PLUMO_PATH = `${MOCK_FOLDER}/Projects/Plumo.md`
const GONE_PATH = `${MOCK_FOLDER}/Gone.md`

const storedSession = (page: Page) => page.evaluate(() => window.__plumoMockVault?.invoke('read_session'))
const tabNames = (page: Page) => page.getByRole('tab').allTextContents()
const activeTab = (page: Page) => page.getByRole('tab', { selected: true })

async function seedSession(page: Page, session: unknown) {
  await page.goto('/')
  await page.evaluate((seed) => {
    const vault: MockVault | undefined = window.__plumoMockVault
    if (!vault) throw new Error('The Folder fixture is not installed')
    vault.seedSession(seed)
  }, session)
}

test('quit and relaunch restores the Tabs in order and the active Tab, and the file matches the schema', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await openDocumentThroughDialog(page, WELCOME_PATH)
  await openDocumentThroughDialog(page, PLUMO_PATH)
  await page.keyboard.press('Meta+1')
  await expect(activeTab(page)).toHaveText('Welcome.md')

  await expect.poll(() => storedSession(page)).toEqual({
    version: 1,
    folder: null,
    openEditors: [{ path: WELCOME_PATH, mode: 'rich' }, { path: PLUMO_PATH, mode: 'rich' }],
    activePath: WELCOME_PATH,
    // A Document opened with no Folder collapses the sidebar.
    sidebar: { collapsed: true, width: 260 },
    pinned: {},
    recentFolders: [],
    tabsByFolder: {},
  })

  await page.reload()

  await expect(page.getByRole('tab')).toHaveCount(2)
  expect(await tabNames(page)).toEqual(['Welcome.md', 'Plumo.md'])
  await expect(activeTab(page)).toHaveText('Welcome.md')
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('a Tab whose file is gone is dropped on relaunch, and its successor takes over when it was active', async ({ page }) => {
  const errors = watchForErrors(page)
  await seedSession(page, {
    version: 1,
    folder: null,
    openEditors: [
      { path: WELCOME_PATH, mode: 'rich' },
      { path: GONE_PATH, mode: 'rich' },
      { path: PLUMO_PATH, mode: 'rich' },
    ],
    activePath: GONE_PATH,
    sidebar: { collapsed: false, width: 260 },
  })

  await page.reload()

  await expect(page.getByRole('tab')).toHaveCount(2)
  expect(await tabNames(page)).toEqual(['Welcome.md', 'Plumo.md'])
  await expect(activeTab(page)).toHaveText('Plumo.md')
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')
  await expect.poll(() => storedSession(page)).toMatchObject({
    openEditors: [{ path: WELCOME_PATH, mode: 'rich' }, { path: PLUMO_PATH, mode: 'rich' }],
    activePath: PLUMO_PATH,
  })
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('a Session with an unknown version is ignored and rewritten', async ({ page }) => {
  const errors = watchForErrors(page)
  await seedSession(page, { version: 99, openEditors: [{ path: WELCOME_PATH, mode: 'rich' }], activePath: WELCOME_PATH })

  await page.reload()

  await expect(page.getByTestId('editor-empty-state')).toBeVisible()
  await expect(page.getByTestId('tab-bar')).toHaveCount(0)
  await expect.poll(() => storedSession(page)).toMatchObject({ version: 1, openEditors: [], activePath: null })
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('an empty Session restores to the empty state without error', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await openDocumentThroughDialog(page, WELCOME_PATH)
  await page.keyboard.press('Meta+w')
  await expect.poll(() => storedSession(page)).toMatchObject({ version: 1, openEditors: [], activePath: null })

  await page.reload()

  await expect(page.getByTestId('editor-empty-state')).toBeVisible()
  await expect(page.getByTestId('tab-bar')).toHaveCount(0)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

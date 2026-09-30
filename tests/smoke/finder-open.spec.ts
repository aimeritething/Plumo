import { expect, test, type Page } from '@playwright/test'
// Type-only: brings the fixture's `window.__plumoMockVault` declaration into the spec program.
import type { MockVault } from '../../src/platform/mock/vault-fixture'
import { MOCK_FOLDER, openDocumentThroughDialog, watchForErrors, WELCOME_PATH } from './harness'

// Finder double-click, Open With and the Dock icon. The Rust side
// buffers the paths and pokes; the renderer drains `take_pending_open`. In the
// browser the Folder fixture holds that buffer: `seedPendingOpen` plants what a
// launch by document finds there (the next page load, like a relaunch, drains
// it) and `openFromFinder` is an open while Plumo is running.

const PLUMO_PATH = `${MOCK_FOLDER}/Projects/Plumo.md`
const READING_LIST_PATH = `${MOCK_FOLDER}/Reading list.md`

const activeTab = (page: Page) => page.getByRole('tab', { selected: true })
const tabNames = (page: Page) => page.getByRole('tab').allTextContents()

/** Plant a Session and a launch-by-document path for the next page load. */
async function seedLaunch(page: Page, session: unknown, pendingOpen: string[]) {
  await page.evaluate(([seededSession, paths]) => {
    const vault: MockVault | undefined = window.__plumoMockVault
    if (!vault) throw new Error('The Folder fixture is not installed')
    if (seededSession) vault.seedSession(seededSession)
    vault.seedPendingOpen(paths)
  }, [session, pendingOpen] as const)
}

function openFromFinder(page: Page, paths: string[]) {
  return page.evaluate((opened) => window.__plumoMockVault?.openFromFinder(opened), paths)
}

function pendingOpenCalls(page: Page) {
  return page.evaluate(() => window.__plumoMockVault?.calls.filter((call) => call.command === 'take_pending_open').length ?? 0)
}

test('a launch by document with no Folder lands on that Document with the sidebar collapsed', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await seedLaunch(page, null, [WELCOME_PATH])

  await page.reload()

  await expect(activeTab(page)).toHaveText('Welcome.md')
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')
  await expect(page.getByTestId('sidebar')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Show sidebar' })).toBeVisible()
  expect(await pendingOpenCalls(page)).toBe(1)
  // Drained, never peeked: nothing is left for the next launch.
  expect(await page.evaluate(() => window.__plumoMockVault?.invoke('take_pending_open'))).toEqual([])
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('an open while running adds a Tab and activates it; an open of a Document already open activates its Tab', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await openDocumentThroughDialog(page, WELCOME_PATH)
  await expect(activeTab(page)).toHaveText('Welcome.md')

  await openFromFinder(page, [PLUMO_PATH])

  await expect(activeTab(page)).toHaveText('Plumo.md')
  expect(await tabNames(page)).toEqual(['Welcome.md', 'Plumo.md'])
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')

  await openFromFinder(page, [WELCOME_PATH])

  await expect(activeTab(page)).toHaveText('Welcome.md')
  expect(await tabNames(page)).toEqual(['Welcome.md', 'Plumo.md'])
  // Two pokes, two drains, on top of the one at launch.
  expect(await pendingOpenCalls(page)).toBe(3)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('a launch by document inside the open Folder leaves the sidebar as it was and selects the row', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await seedLaunch(page, {
    version: 1,
    folder: MOCK_FOLDER,
    openEditors: [],
    activePath: null,
    sidebar: { collapsed: false, width: 260 },
  }, [PLUMO_PATH])

  await page.reload()

  await expect(activeTab(page)).toHaveText('Plumo.md')
  await expect(page.getByTestId('sidebar')).toBeVisible()
  const row = page.getByRole('treeitem', { name: 'Plumo.md' })
  await expect(row).toBeVisible()
  await expect(row).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('treeitem', { name: 'Projects' })).toHaveAttribute('aria-expanded', 'true')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('a launch by document restores the Session first, then the Finder Document is the active Tab', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await seedLaunch(page, {
    version: 1,
    folder: null,
    openEditors: [{ path: WELCOME_PATH, mode: 'rich' }],
    activePath: WELCOME_PATH,
    sidebar: { collapsed: false, width: 260 },
  }, [READING_LIST_PATH])

  await page.reload()

  await expect(activeTab(page)).toHaveText('Reading list.md')
  expect(await tabNames(page)).toEqual(['Welcome.md', 'Reading list.md'])
  await expect(page.locator('.bn-editor h1')).toHaveText('Reading list')
  // No Folder: opening from Finder collapses the sidebar the Session had expanded.
  await expect(page.getByTestId('sidebar')).toHaveCount(0)
  expect(await page.evaluate(() => window.__plumoMockVault?.invoke('read_session'))).toMatchObject({
    openEditors: [{ path: WELCOME_PATH, mode: 'rich' }, { path: READING_LIST_PATH, mode: 'rich' }],
    activePath: READING_LIST_PATH,
    sidebar: { collapsed: true },
  })
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

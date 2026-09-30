import { expect, test, type Page } from '@playwright/test'
import type { MockVault } from '../../src/platform/mock/vault-fixture'
import { MOCK_FOLDER, openFolderThroughDialog, storedSession, watchForErrors, WELCOME_PATH } from './harness'

// Recent Folders (CONTEXT.md) through the Folder switcher at the bottom of the
// sidebar: a Folder opened again gets its Tabs back, a Recent Folder that has
// gone says so and leaves the list, and with no Folder open the list sits
// under Open Folder. A page reload stands in for a relaunch.

const PROJECTS = `${MOCK_FOLDER}/Projects`
const PLUMO_PATH = `${PROJECTS}/Plumo.md`
const GONE = `${MOCK_FOLDER}/Gone`

const tabNames = (page: Page) => page.getByRole('tab').allTextContents()
const activeTab = (page: Page) => page.getByRole('tab', { selected: true })

async function openSwitcherMenu(page: Page) {
  await page.getByTestId('folder-switcher-row').click()
  return page.getByTestId('folder-switcher-menu')
}

test('a Folder switched away from and back to gets its Tabs and its active Tab back', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await openFolderThroughDialog(page, MOCK_FOLDER)
  await page.getByTestId(`explorer-row:${WELCOME_PATH}`).click()
  await page.getByLabel('Expand Projects').click()
  await page.getByTestId(`explorer-row:${PLUMO_PATH}`).click()
  await page.getByTestId(`tab:${WELCOME_PATH}`).click()
  await expect(activeTab(page)).toHaveText('Welcome.md')

  await openFolderThroughDialog(page, PROJECTS)
  await expect(page.getByRole('tab')).toHaveCount(0)
  await expect(page.getByTestId('folder-switcher-row')).toHaveText('Projects')

  const menu = await openSwitcherMenu(page)
  await expect(menu.getByRole('menuitem')).toHaveText(['Projects~/Documents/Notes/Projects', 'Notes~/Documents/Notes', 'Open Folder…⌘O', 'Close Folder', 'Settings…⌘,'])
  await menu.getByTestId(`recent-folder:${MOCK_FOLDER}`).click()

  await expect(page.getByTestId('explorer-toggle')).toHaveAttribute('title', MOCK_FOLDER)
  await expect.poll(() => tabNames(page)).toEqual(['Welcome.md', 'Plumo.md'])
  await expect(activeTab(page)).toHaveText('Welcome.md')
  await expect.poll(() => storedSession(page)).toMatchObject({ folder: MOCK_FOLDER, recentFolders: [MOCK_FOLDER, PROJECTS], tabsByFolder: {} })

  await page.reload()
  await expect(page.getByTestId('folder-switcher-row')).toHaveText('Notes')
  const reopened = await openSwitcherMenu(page)
  await expect(reopened.getByTestId(`recent-folder:${PROJECTS}`)).toBeVisible()
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('the switcher\'s tooltip names the Folder\'s path', async ({ page }) => {
  await page.goto('/')
  await openFolderThroughDialog(page, MOCK_FOLDER)
  await page.getByTestId('folder-switcher-row').hover()

  const tooltip = page.getByTestId('folder-switcher-tooltip')
  await expect(tooltip).toContainText('~/Documents/Notes')
  await expect(tooltip).toContainText(/\d+ Documents?/)
})

test('with no Folder open the Recent Folders sit under Open Folder, and one that has gone leaves the list', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await page.evaluate((seed) => {
    const vault: MockVault | undefined = window.__plumoMockVault
    if (!vault) throw new Error('The Folder fixture is not installed')
    vault.seedSession(seed)
  }, { version: 1, folder: null, openEditors: [], activePath: null, sidebar: { collapsed: false, width: 260 }, recentFolders: [GONE, MOCK_FOLDER] })
  await page.reload()

  const recent = page.getByTestId('recent-folders')
  await expect(recent.getByRole('button')).toHaveText(['Gone~/Documents/Notes/Gone', 'Notes~/Documents/Notes'])

  await recent.getByTestId(`recent-folder:${GONE}`).click()
  await expect(page.getByText('Folder not found')).toBeVisible()
  await expect(recent.getByRole('button')).toHaveText(['Notes~/Documents/Notes'])
  await expect(page.getByTestId('explorer-folder-missing')).toHaveCount(0)

  await recent.getByTestId(`recent-folder:${MOCK_FOLDER}`).click()
  await expect(page.getByRole('tree')).toBeVisible()
  await expect(page.getByTestId('recent-folders')).toHaveCount(0)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

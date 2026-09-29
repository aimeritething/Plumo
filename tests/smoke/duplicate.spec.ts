import { expect, test, type Page } from '@playwright/test'
// Type-only: brings the browser menu bridge's `window.__plumoTest` declaration into the spec program.
import type {} from '../../src/shell/use-menu-events'
import { MOCK_FOLDER, savedContent, typeAtEnd, watchForErrors } from './harness'

// Duplicate (CONTEXT.md): a copy of a Document or an Image file, beside it,
// named `<name> copy`, from the Explorer's and Pinned's menus on a row and
// from File ▸ Duplicate and the tab bar's "…" on the active Tab. The copy
// holds what the Tab shows, is not pinned, and opens as the active Tab.

const WELCOME = `${MOCK_FOLDER}/Welcome.md`
const WELCOME_COPY = `${MOCK_FOLDER}/Welcome copy.md`
const LAKE = `${MOCK_FOLDER}/Attachments/lake.png`
const AUTOSAVE_IDLE_MS = 1_500

const explorerRow = (page: Page, path: string) => page.getByTestId(`explorer-row:${path}`)
const activeTab = (page: Page) => page.locator('[data-testid^="tab:"][aria-selected="true"]')

async function openFolder(page: Page) {
  await page.goto('/')
  await page.evaluate((chosen) => window.__plumoMockVault?.queueDialogSelection([chosen]), MOCK_FOLDER)
  await page.keyboard.press('Meta+o')
  await expect(page.getByTestId('explorer-toggle')).toHaveAttribute('title', MOCK_FOLDER)
}

function folderPaths(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__plumoMockVault?.files().map((file) => file.path) ?? [])
}

test('the Explorer\'s menu duplicates a Document beside it, opens the copy and selects its row', async ({ page }) => {
  const errors = watchForErrors(page)
  await openFolder(page)

  await explorerRow(page, WELCOME).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()

  await expect(explorerRow(page, WELCOME_COPY)).toBeVisible()
  await expect(activeTab(page)).toHaveAttribute('data-testid', `tab:${WELCOME_COPY}`)
  await expect(page.getByRole('treeitem', { name: 'Welcome copy.md' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')
  expect(await savedContent(page, WELCOME_COPY)).toBe(await savedContent(page, WELCOME))

  // Again, from the copy: Finder's count, not a second "copy".
  await explorerRow(page, WELCOME_COPY).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expect(explorerRow(page, `${MOCK_FOLDER}/Welcome copy 2.md`)).toBeVisible()
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('an Image file duplicates from a Pinned row, and the copy is not pinned', async ({ page }) => {
  await openFolder(page)
  await page.getByLabel('Expand Attachments').click()
  await explorerRow(page, LAKE).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Pin', exact: true }).click()

  await page.getByTestId(`pinned-row:${LAKE}`).click({ button: 'right' })
  const menu = page.getByTestId('pinned-menu')
  expect(await menu.getByRole('menuitem').allTextContents()).toEqual(['Unpin', 'Duplicate'])
  await menu.getByRole('menuitem', { name: 'Duplicate' }).click()

  await expect.poll(() => folderPaths(page)).toContain(`${MOCK_FOLDER}/Attachments/lake copy.png`)
  await expect(activeTab(page)).toHaveAttribute('data-testid', `tab:${MOCK_FOLDER}/Attachments/lake copy.png`)
  await expect(page.getByTestId(`pinned-row:${MOCK_FOLDER}/Attachments/lake copy.png`)).toHaveCount(0)
})

test('File ▸ Duplicate copies the active Tab and opens the copy in the same Raw mode', async ({ page }) => {
  await openFolder(page)
  await explorerRow(page, WELCOME).click()
  await page.getByRole('radio', { name: 'Raw' }).click()
  await expect(page.locator('.cm-content')).toBeVisible()

  await page.evaluate(() => window.__plumoTest?.dispatchBrowserMenuCommand?.('file-duplicate'))

  await expect(activeTab(page)).toHaveAttribute('data-testid', `tab:${WELCOME_COPY}`)
  await expect(page.getByRole('radio', { name: 'Raw' })).toHaveAttribute('aria-checked', 'true')
})

test('the "…" menu copies what the Tab shows, the unsaved edit under a Write failure included', async ({ page }) => {
  await openFolder(page)
  await explorerRow(page, WELCOME).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')
  await page.evaluate((target) => window.__plumoMockVault?.markReadOnly([target]), WELCOME)
  await typeAtEnd(page, ' Only on screen.')
  await expect(page.getByTestId('write-failure-bar')).toBeVisible({ timeout: AUTOSAVE_IDLE_MS + 3_000 })

  await page.getByTestId('tab-more').click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()

  await expect(activeTab(page)).toHaveAttribute('data-testid', `tab:${WELCOME_COPY}`)
  expect(await savedContent(page, WELCOME_COPY)).toContain('Only on screen.')
  expect(await savedContent(page, WELCOME)).not.toContain('Only on screen.')
})

import { expect, test } from '@playwright/test'
import { MOCK_FOLDER, openDocumentThroughDialog, storedSession, watchForErrors } from './harness'

async function openFolder(page: import('@playwright/test').Page, path: string) {
  await page.evaluate((chosen) => window.__plumoMockVault?.queueDialogSelection([chosen]), path)
  await page.keyboard.press('Meta+o')
}

test('Open Folder shows a sorted Explorer, opens Documents, follows Tabs and restores the Folder', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.getByTestId('editor-empty-state')).toBeVisible()
  await openFolder(page, MOCK_FOLDER)
  const explorer = page.getByTestId('explorer')
  const rows = explorer.locator('[data-testid^="explorer-row:"]')
  // The Folder heads the Explorer by name; it is not a row, and "Explorer" is nowhere.
  await expect(page.getByTestId('explorer-toggle')).toHaveText('Notes')
  await expect(page.getByTestId('sidebar')).not.toContainText('Explorer')
  await expect(rows).toHaveText(['Attachments', 'Projects', 'Style catalog', 'Reading list.md', 'Welcome.md'])
  await explorer.getByRole('button', { name: 'Projects', exact: true }).getByTestId('explorer-disclosure').click()
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects/Plumo.md`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')
  await expect(page.getByRole('tab', { selected: true })).toHaveAttribute('data-testid', `tab:${MOCK_FOLDER}/Projects/Plumo.md`)
  await explorer.getByRole('button', { name: 'Projects', exact: true }).getByTestId('explorer-disclosure').click()
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')
  await page.getByTestId(`tab:${MOCK_FOLDER}/Projects/Plumo.md`).click()
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects/Plumo.md`)).toHaveAttribute('data-active', 'true')
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Attachments`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')
  await page.reload()
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects/Plumo.md`)).toBeVisible()
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test("the Folder's name folds the whole tree away, and it stays folded after a relaunch", async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await openFolder(page, MOCK_FOLDER)
  const toggle = page.getByTestId('explorer-toggle')
  await expect(page.getByTestId('explorer-tree')).toBeVisible()

  await toggle.click()
  await expect(page.getByTestId('explorer-tree')).toHaveCount(0)
  await expect.poll(() => storedSession(page)).toMatchObject({ sidebar: { collapsedSections: ['explorer'] } })

  await page.reload()
  await expect(page.getByTestId('explorer-toggle')).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('explorer-tree')).toHaveCount(0)
  await page.getByTestId('explorer-toggle').click()
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`)).toBeVisible()
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('switching and closing Folder flushes edits and closes every Tab', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('editor-empty-state')).toBeVisible()
  await openFolder(page, MOCK_FOLDER)
  await openDocumentThroughDialog(page, `${MOCK_FOLDER}/Welcome.md`)
  await page.locator('.bn-editor p').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Folder switch keeps this edit.')
  await openFolder(page, `${MOCK_FOLDER}/Projects`)
  await expect(page.getByTestId('explorer-toggle')).toHaveText('Projects')
  await expect(page.getByTestId('tab-bar')).toHaveCount(0)
  const saved = await page.evaluate((path) => window.__plumoMockVault?.files().find((file) => file.path === path)?.content, `${MOCK_FOLDER}/Welcome.md`)
  expect(saved).toContain('Folder switch keeps this edit.')
  await page.evaluate(() => window.__plumoTest?.dispatchBrowserMenuCommand?.('file-close-vault'))
  await expect(page.getByTestId('explorer-tree')).toHaveCount(0)
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('plumo:mock-session') ?? '{}'))
  expect(session.folder).toBeNull()
})

test('external changes reload clean Documents, preserve pending edits, and refresh the tree', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.getByTestId('editor-empty-state')).toBeVisible()
  await openFolder(page, MOCK_FOLDER)
  await openDocumentThroughDialog(page, `${MOCK_FOLDER}/Welcome.md`)
  await page.evaluate((root) => {
    const vault = window.__plumoMockVault!
    vault.writeNote(`${root}/Welcome.md`, '# Updated externally\n\nClean changes arrive.\n')
    vault.writeNote(`${root}/Added.md`, '# Added\n')
    vault.removeFile(`${root}/Reading list.md`)
    vault.emitExternalChange([`${root}/Welcome.md`, `${root}/Added.md`, `${root}/Reading list.md`])
  }, MOCK_FOLDER)
  await expect(page.locator('.bn-editor h1')).toHaveText('Updated externally')
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Added.md`)).toBeVisible()
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Reading list.md`)).toHaveCount(0)
  await page.locator('.bn-editor p').first().click()
  await page.keyboard.press('End')
  await page.keyboard.type(' Pending local edit.')
  await page.evaluate((root) => {
    const vault = window.__plumoMockVault!
    vault.writeNote(`${root}/Welcome.md`, '# Must not replace pending edits\n')
    vault.emitExternalChange([`${root}/Welcome.md`])
  }, MOCK_FOLDER)
  await expect(page.locator('.bn-editor')).toContainText('Pending local edit.')
  await page.keyboard.press('Meta+s')
  await expect.poll(() => page.evaluate((root) => window.__plumoMockVault?.files().find((file) => file.path === `${root}/Welcome.md`)?.content, MOCK_FOLDER)).toContain('Pending local edit.')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('outside Documents stay out of the Explorer and the Pinned list, and reload externally', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('editor-empty-state')).toBeVisible()
  await openFolder(page, `${MOCK_FOLDER}/Projects`)
  await openDocumentThroughDialog(page, `${MOCK_FOLDER}/Welcome.md`)
  await expect(page.getByRole('tab', { selected: true })).toHaveAttribute('data-testid', `tab:${MOCK_FOLDER}/Welcome.md`)
  // Pin/Unpin is greyed in the "…": only a file in the Folder can be pinned.
  await page.getByTestId('tab-more').click()
  await expect(page.getByRole('menuitem', { name: 'Pin', exact: true })).toHaveAttribute('data-disabled')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`)).toHaveCount(0)
  await page.evaluate((path) => {
    window.__plumoMockVault?.writeNote(path, '# Outside changed\n')
    window.__plumoMockVault?.emitExternalChange([path])
  }, `${MOCK_FOLDER}/Welcome.md`)
  await expect(page.locator('.bn-editor h1')).toHaveText('Outside changed')
})

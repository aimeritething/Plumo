import { expect, test, type Page } from '@playwright/test'
import { MOCK_FOLDER, openDocumentThroughDialog, watchForErrors, WELCOME_PATH } from './harness'

// Several Documents open as Tabs, the successor rule on close, positional
// navigation and ⌘W.

const READING_LIST_PATH = `${MOCK_FOLDER}/Reading list.md`
const PLUMO_PATH = `${MOCK_FOLDER}/Projects/Plumo.md`

const tabNames = (page: Page) => page.getByRole('tab').allTextContents()
const activeTab = (page: Page) => page.getByRole('tab', { selected: true })

async function openThree(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('tab-bar')).toHaveCount(0)
  await openDocumentThroughDialog(page, WELCOME_PATH)
  await openDocumentThroughDialog(page, READING_LIST_PATH)
  await openDocumentThroughDialog(page, PLUMO_PATH)
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')
}

test('three Documents give three Tabs, the last one active', async ({ page }) => {
  const errors = watchForErrors(page)
  await openThree(page)

  expect(await tabNames(page)).toEqual(['Welcome.md', 'Reading list.md', 'Plumo.md'])
  await expect(activeTab(page)).toHaveText('Plumo.md')
  await expect(page.getByTestId('tab-bar')).toHaveCSS('height', '52px')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('opening an already-open Document activates its Tab instead of adding one', async ({ page }) => {
  await openThree(page)

  await openDocumentThroughDialog(page, WELCOME_PATH)

  await expect(activeTab(page)).toHaveText('Welcome.md')
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')
  expect(await tabNames(page)).toEqual(['Welcome.md', 'Reading list.md', 'Plumo.md'])
})

test('closing the middle Tab activates the one to its right, closing the last the one to its left', async ({ page }) => {
  await openThree(page)

  await page.getByRole('tab', { name: 'Reading list.md' }).click()
  await expect(activeTab(page)).toHaveText('Reading list.md')
  await page.getByRole('tab', { name: 'Reading list.md' }).hover()
  await page.getByRole('tab', { name: 'Reading list.md' }).getByRole('button', { name: 'Close Reading list.md' }).click()

  expect(await tabNames(page)).toEqual(['Welcome.md', 'Plumo.md'])
  await expect(activeTab(page)).toHaveText('Plumo.md')
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')

  await page.getByRole('tab', { name: 'Plumo.md' }).hover()
  await page.getByRole('tab', { name: 'Plumo.md' }).getByRole('button', { name: 'Close Plumo.md' }).click()

  expect(await tabNames(page)).toEqual(['Welcome.md'])
  await expect(activeTab(page)).toHaveText('Welcome.md')
})

test('⌘⇧[ and ⌘⇧] cycle positionally and ⌘2 activates the second Tab', async ({ page }) => {
  await openThree(page)

  await page.keyboard.press('Meta+Shift+[')
  await expect(activeTab(page)).toHaveText('Reading list.md')
  await page.keyboard.press('Meta+Shift+[')
  await expect(activeTab(page)).toHaveText('Welcome.md')
  await page.keyboard.press('Meta+Shift+[')
  await expect(activeTab(page)).toHaveText('Plumo.md')

  await page.keyboard.press('Meta+Shift+]')
  await expect(activeTab(page)).toHaveText('Welcome.md')

  await page.keyboard.press('Meta+2')
  await expect(activeTab(page)).toHaveText('Reading list.md')
  await expect(page.locator('.bn-editor h1')).toHaveText('Reading list')
})

test('⌘W closes the active Tab, and at zero Tabs the tab bar leaves the DOM', async ({ page }) => {
  const errors = watchForErrors(page)
  await openThree(page)

  await page.keyboard.press('Meta+w')
  expect(await tabNames(page)).toEqual(['Welcome.md', 'Reading list.md'])
  await expect(activeTab(page)).toHaveText('Reading list.md')

  await page.keyboard.press('Meta+w')
  await page.keyboard.press('Meta+w')

  await expect(page.getByTestId('tab-bar')).toHaveCount(0)
  await expect(page.getByTestId('editor-empty-state')).toBeVisible()

  // One more ⌘W would close the window in Tauri; here there is none to close.
  await page.keyboard.press('Meta+w')
  await expect(page.getByTestId('editor-empty-state')).toBeVisible()
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('two open Tabs with the same name each show their parent folder, and a third name shows none', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await openDocumentThroughDialog(page, `${MOCK_FOLDER}/Style catalog/Chinese/Everything.md`)
  await openDocumentThroughDialog(page, `${MOCK_FOLDER}/Style catalog/English/Everything.md`)
  await openDocumentThroughDialog(page, WELCOME_PATH)
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')

  expect(await page.getByRole('tab').getByTestId('tab-parent').allTextContents()).toEqual(['Chinese', 'English'])
  await expect(page.getByRole('tab', { name: 'Everything.md, Chinese' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Everything.md, English' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Welcome.md' }).getByTestId('tab-parent')).toHaveCount(0)

  // Closing one leaves the other's name its own again.
  await page.getByRole('tab', { name: 'Everything.md, Chinese' }).hover()
  await page.getByRole('button', { name: 'Close Everything.md' }).first().click()
  await expect(page.getByRole('tab').getByTestId('tab-parent')).toHaveCount(0)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('the "…" menu hands the Document to Finder and to its default app, its Find focuses the find bar, and the "+" is ⌘N', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await page.evaluate((folder) => window.__plumoMockVault?.queueDialogSelection([folder]), MOCK_FOLDER)
  await page.keyboard.press('Meta+o')
  await expect(page.getByRole('tree')).toBeVisible()
  await openDocumentThroughDialog(page, WELCOME_PATH)
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')

  await page.getByRole('button', { name: 'More', exact: true }).click()
  expect(await page.getByTestId('tab-more-menu').getByRole('menuitem').allTextContents()).toEqual([
    'Pin', 'Duplicate', 'Reveal in Finder', 'Open in Default App', 'Find⌘F', 'Close Tab⌘W',
  ])
  await page.getByRole('menuitem', { name: 'Reveal in Finder' }).click()
  await expect.poll(() => page.evaluate(() => window.__plumoMockVault?.revealedPath())).toBe(WELCOME_PATH)
  await page.getByRole('button', { name: 'More', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Open in Default App' }).click()
  await expect.poll(() => page.evaluate(() => window.__plumoMockVault?.openedExternallyPath())).toBe(WELCOME_PATH)

  // Find leaves the focus in the find bar it opened, not on "…", in either mode.
  for (const mode of ['rich', 'raw'] as const) {
    if (mode === 'raw') await page.getByTestId('tab-mode-raw').click()
    await page.getByRole('button', { name: 'More', exact: true }).click()
    await page.getByRole('menuitem', { name: /^Find/ }).click()
    // The menu hands focus back as it finishes closing, after the find bar took it.
    await expect(page.getByTestId('tab-more-menu')).toHaveCount(0)
    const findInput = page.getByTestId(`${mode}-editor-find-input`)
    await expect(findInput).toBeFocused()
    await page.keyboard.type('xyz')
    await expect(findInput).toHaveValue('xyz')
    await page.keyboard.press('Escape')
  }

  await page.getByTestId('tab-bar-new-document').click()
  await expect(page.getByRole('tab')).toHaveCount(2)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

import { expect, test, type Page } from '@playwright/test'
import { MOCK_FOLDER, watchForErrors } from './harness'

// ⌘N writes a Document before it is named, the new row enters inline
// rename, and the Linear-styled context menu carries Rename…, Reveal in Finder
// and Copy Path.

async function openFolder(page: Page, path = MOCK_FOLDER) {
  await page.goto('/')
  await expect(page.getByTestId('editor-empty-state')).toBeVisible()
  await page.evaluate((chosen) => window.__plumoMockVault?.queueDialogSelection([chosen]), path)
  await page.keyboard.press('Meta+o')
  await expect(page.getByTestId('explorer-toggle')).toHaveText(path.slice(path.lastIndexOf('/') + 1))
}

function renameInput(page: Page) {
  return page.getByTestId('explorer-rename-input')
}

function folderPaths(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__plumoMockVault?.files().map((file) => file.path) ?? [])
}

test('⌘N creates a Document where the selection points and opens it in rename', async ({ page }) => {
  const errors = watchForErrors(page)
  await openFolder(page)

  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects`).click()
  await page.keyboard.press('Meta+n')

  await expect(renameInput(page)).toHaveValue('Untitled')
  await expect(page.getByText('.md', { exact: true })).toBeVisible()
  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Projects/Untitled.md`)).toBeVisible()
  expect(await folderPaths(page)).toContain(`${MOCK_FOLDER}/Projects/Untitled.md`)

  // The stem arrives selected, so typing replaces it.
  const selection = await renameInput(page).evaluate((node: HTMLInputElement) => [node.selectionStart, node.selectionEnd])
  expect(selection).toEqual([0, 'Untitled'.length])

  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('a second and third ⌘N suffix Finder style', async ({ page }) => {
  await openFolder(page)

  await page.keyboard.press('Meta+n')
  await expect(renameInput(page)).toBeVisible()
  await page.keyboard.press('Meta+n')
  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Untitled 2.md`)).toBeVisible()
  await page.keyboard.press('Meta+n')
  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Untitled 3.md`)).toBeVisible()

  const paths = await folderPaths(page)
  expect(paths).toContain(`${MOCK_FOLDER}/Untitled.md`)
  expect(paths).toContain(`${MOCK_FOLDER}/Untitled 2.md`)
  expect(paths).toContain(`${MOCK_FOLDER}/Untitled 3.md`)
})

test('New Folder makes a folder and renames it without opening a Tab', async ({ page }) => {
  await openFolder(page)

  await page.getByTestId('explorer-more-actions').click()
  await page.getByRole('menuitem', { name: 'New Folder' }).click()

  await expect(renameInput(page)).toHaveValue('New Folder')
  await expect(page.getByTestId('tab-bar')).toHaveCount(0)

  await renameInput(page).fill('Archive')
  await page.keyboard.press('Enter')

  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Archive`)).toBeVisible()
  expect(await folderPaths(page)).toContain(`${MOCK_FOLDER}/Archive`)
})

test('a committed rename re-sorts the row and moves the Tab with it', async ({ page }) => {
  await openFolder(page)
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')

  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename…' }).click()
  await renameInput(page).fill('Aardvark')
  await page.keyboard.press('Enter')

  const explorer = page.getByTestId('explorer')
  await expect(explorer.locator('[data-testid^="explorer-row:"]'))
    .toHaveText(['Attachments', 'Projects', 'Style catalog', 'Aardvark.md', 'Reading list.md'])
  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Aardvark.md`)).toHaveAttribute('aria-label', 'Aardvark.md')
  await expect(page.getByRole('tab', { selected: true })).toHaveAttribute('data-testid', `tab:${MOCK_FOLDER}/Aardvark.md`)
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Aardvark.md`).locator('..')).toHaveAttribute('aria-selected', 'true')
})

test('a colliding name is refused inline, and Escape puts the row back', async ({ page }) => {
  await openFolder(page)

  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename…' }).click()
  await renameInput(page).fill('Reading list')
  await page.keyboard.press('Enter')

  await expect(page.getByTestId('explorer-rename-error'))
    .toHaveText('A Document named Reading list.md already exists')
  await expect(renameInput(page)).toHaveAttribute('aria-invalid', 'true')
  expect(await folderPaths(page)).toContain(`${MOCK_FOLDER}/Welcome.md`)

  await page.keyboard.press('Escape')
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`)).toBeVisible()
  await expect(renameInput(page)).toHaveCount(0)
})

test('a slash never enters a name and a trailing dot is refused on commit', async ({ page }) => {
  await openFolder(page)

  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename…' }).click()
  await renameInput(page).fill('')
  await renameInput(page).pressSequentially('a/b')
  await expect(renameInput(page)).toHaveValue('ab')

  await renameInput(page).fill('Draft.')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('explorer-rename-error')).toHaveText('A name cannot end with a space or a dot')

  // A trailing space too, which the Rust side would otherwise trim away in silence.
  await renameInput(page).fill('Draft ')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('explorer-rename-error')).toHaveText('A name cannot end with a space or a dot')
  expect(await folderPaths(page)).toContain(`${MOCK_FOLDER}/Welcome.md`)
})

test('renaming a folder retargets every Tab beneath it', async ({ page }) => {
  await openFolder(page)
  await page.getByRole('button', { name: 'Expand Projects' }).click()
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects/Plumo.md`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')

  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects`).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename…' }).click()
  await renameInput(page).fill('Work')
  await page.keyboard.press('Enter')

  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Work/Plumo.md`)).toBeVisible()
  await expect(page.getByRole('tab', { selected: true })).toHaveAttribute('data-testid', `tab:${MOCK_FOLDER}/Work/Plumo.md`)
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')
  // The folder is what was renamed, so the folder row keeps the selection —
  // not the Document that moved with it.
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Work`).locator('..')).toHaveAttribute('aria-selected', 'true')
})

test('right-click leaves the selection and the active Tab alone', async ({ page }) => {
  await openFolder(page)
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')

  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Reading list.md`).click({ button: 'right' })

  await expect(page.getByRole('menuitem', { name: 'Copy Path' })).toBeVisible()
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`).locator('..')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Reading list.md`)).toHaveCount(0)
})

test('Reveal in Finder and Copy Path hand off the row they were opened on', async ({ page }) => {
  await openFolder(page)

  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Copy Path' }).click()
  await expect.poll(() => page.evaluate(() => window.__plumoMockVault?.clipboardText()))
    .toBe(`${MOCK_FOLDER}/Welcome.md`)

  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Reveal in Finder' }).click()
  await expect.poll(() => page.evaluate(() => window.__plumoMockVault?.revealedPath()))
    .toBe(`${MOCK_FOLDER}/Welcome.md`)
})

test('with no Folder open, ⌘N does nothing', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.getByTestId('editor-empty-state')).toBeVisible()

  await page.keyboard.press('Meta+n')

  await expect(page.getByTestId('tab-bar')).toHaveCount(0)
  await expect(renameInput(page)).toHaveCount(0)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

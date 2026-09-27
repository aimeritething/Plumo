import { expect, test, type Page } from '@playwright/test'
import { MOCK_FOLDER, openFolderThroughDialog, watchForErrors } from './harness'

// A double-click in the Explorer is one open: the first click opens the Tab or
// the folder, and the sidebar drops the second click of the pair, wherever it lands.

const READING_LIST = `${MOCK_FOLDER}/Reading list.md`
const WELCOME = `${MOCK_FOLDER}/Welcome.md`

const explorerRow = (page: Page, path: string) => page.getByTestId(`explorer-row:${path}`)
const tabFor = (page: Page, path: string) => page.getByTestId(`tab:${path}`)

/**
 * Double-click as a hand does it: the pointer stays where it is, and the
 * second click comes after the first one's Tab has appeared.
 */
async function doubleClickInPlace(page: Page, path: string) {
  const box = (await explorerRow(page, path).boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.up()
  await expect(tabFor(page, path)).toBeVisible()
  await page.mouse.down({ clickCount: 2 })
  await page.mouse.up({ clickCount: 2 })
}

test('double-clicking a Document opens that Document once', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await openFolderThroughDialog(page, MOCK_FOLDER)
  await explorerRow(page, READING_LIST).click()
  await expect(page.getByRole('tab', { name: 'Reading list.md' })).toHaveAttribute('aria-selected', 'true')

  await doubleClickInPlace(page, WELCOME)

  await expect(page.getByRole('tab', { name: 'Welcome.md' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab')).toHaveText(['Reading list.md', 'Welcome.md'])
  await expect(explorerRow(page, WELCOME).locator('..')).toHaveAttribute('aria-selected', 'true')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('double-clicking the first Document of a session leaves the selection on it', async ({ page }) => {
  await page.goto('/')
  await openFolderThroughDialog(page, MOCK_FOLDER)

  await doubleClickInPlace(page, WELCOME)

  await expect(page.getByRole('tab')).toHaveText(['Welcome.md'])
  await expect(explorerRow(page, WELCOME).locator('..')).toHaveAttribute('aria-selected', 'true')
})

test('a quick second click on a folder\'s arrow still folds it back', async ({ page }) => {
  await page.goto('/')
  await openFolderThroughDialog(page, MOCK_FOLDER)

  await page.getByTestId('explorer').getByRole('button', { name: 'Expand Projects' }).dblclick()

  await expect(explorerRow(page, `${MOCK_FOLDER}/Projects/Plumo.md`)).toHaveCount(0)
})

test('double-clicking a folder\'s name opens it once, and it stays open', async ({ page }) => {
  await page.goto('/')
  await openFolderThroughDialog(page, MOCK_FOLDER)

  await page.getByTestId('explorer').getByText('Projects', { exact: true }).dblclick()

  await expect(explorerRow(page, `${MOCK_FOLDER}/Projects/Plumo.md`)).toBeVisible()
  await expect(explorerRow(page, `${MOCK_FOLDER}/Projects`).locator('..')).toHaveAttribute('aria-expanded', 'true')
})

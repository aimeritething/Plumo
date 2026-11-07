import { expect, test, type Page } from '@playwright/test'
import { MOCK_FOLDER, storedSession, watchForErrors } from './harness'

// Pinned (CONTEXT.md): Pin from the Explorer's menu, the tab bar's "…" and
// the Command Menu, reorder by dragging, and the list survives a relaunch and
// a Folder change. A rename in the Explorer carries a pin along; a file
// deleted in Finder is unpinned. A page reload stands in for a relaunch.

const WELCOME = `${MOCK_FOLDER}/Welcome.md`
const READING = `${MOCK_FOLDER}/Reading list.md`
const PLUMO = `${MOCK_FOLDER}/Projects/Plumo.md`
const PROJECTS = `${MOCK_FOLDER}/Projects`

const pinnedNames = (page: Page) => page.getByTestId('pinned').getByRole('list').getByRole('button').allTextContents()
const explorerRow = (page: Page, path: string) => page.getByTestId(`explorer-row:${path}`)
const pinnedRow = (page: Page, path: string) => page.getByTestId(`pinned-row:${path}`)

async function openFolder(page: Page, path: string) {
  await page.evaluate((chosen) => window.__plumoMockVault?.queueDialogSelection([chosen]), path)
  await page.keyboard.press('Meta+o')
  await expect(page.getByTestId('explorer-toggle')).toHaveText(path.slice(path.lastIndexOf('/') + 1))
}

async function pinFromExplorer(page: Page, path: string) {
  await explorerRow(page, path).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Pin', exact: true }).click()
}

test('three pins, reordered by a drag, come back in that order after a relaunch and a Folder change', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await openFolder(page, MOCK_FOLDER)
  await expect(page.getByTestId('pinned')).toHaveCount(0)

  // The Explorer's menu, then the tab bar's "…", then the Command Menu.
  await pinFromExplorer(page, READING)
  await explorerRow(page, WELCOME).click()
  await page.getByTestId('tab-more').click()
  await page.getByRole('menuitem', { name: 'Pin', exact: true }).click()
  await page.getByTestId('explorer-tree').getByRole('button', { name: 'Projects', exact: true }).getByTestId('explorer-disclosure').click()
  await explorerRow(page, PLUMO).click()
  await page.keyboard.press('Meta+k')
  await page.keyboard.type('Pin/Unpin')
  await page.keyboard.press('Enter')
  await expect.poll(() => pinnedNames(page)).toEqual(['Reading list.md', 'Welcome.md', 'Plumo.md'])

  // The active Tab's file is marked in both sections.
  await expect(pinnedRow(page, PLUMO)).toHaveAttribute('data-active', 'true')
  await expect(page.locator(`[data-testid="explorer-row:${PLUMO}"][data-active=true]`)).toBeVisible()

  await pinnedRow(page, PLUMO).dragTo(pinnedRow(page, READING), { targetPosition: { x: 20, y: 4 } })
  await expect.poll(() => pinnedNames(page)).toEqual(['Plumo.md', 'Reading list.md', 'Welcome.md'])
  await expect.poll(() => storedSession(page)).toMatchObject({ pinned: { [MOCK_FOLDER]: [PLUMO, READING, WELCOME] } })

  await page.reload()
  await expect.poll(() => pinnedNames(page)).toEqual(['Plumo.md', 'Reading list.md', 'Welcome.md'])

  // Another Folder has its own (empty) list; the first gets its pins back.
  await openFolder(page, PROJECTS)
  await expect(page.getByTestId('pinned')).toHaveCount(0)
  await openFolder(page, MOCK_FOLDER)
  await expect.poll(() => pinnedNames(page)).toEqual(['Plumo.md', 'Reading list.md', 'Welcome.md'])
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('a rename in the Explorer renames the pin, and a delete in Finder unpins it', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await openFolder(page, MOCK_FOLDER)
  await pinFromExplorer(page, READING)
  await pinFromExplorer(page, WELCOME)

  await explorerRow(page, READING).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Rename…' }).click()
  await page.getByTestId('explorer-rename-input').fill('Books')
  await page.keyboard.press('Enter')
  const books = `${MOCK_FOLDER}/Books.md`
  await expect(pinnedRow(page, books)).toHaveText('Books.md')
  await expect.poll(() => pinnedNames(page)).toEqual(['Books.md', 'Welcome.md'])

  await page.evaluate((path) => {
    window.__plumoMockVault?.removeFile(path)
    window.__plumoMockVault?.emitExternalChange([path])
  }, books)
  await expect.poll(() => pinnedNames(page)).toEqual(['Welcome.md'])
  await expect.poll(() => storedSession(page)).toMatchObject({ pinned: { [MOCK_FOLDER]: [WELCOME] } })

  // A sub-folder has no Pin; the last Unpin hides the section.
  await explorerRow(page, PROJECTS).click({ button: 'right' })
  await expect(page.getByRole('menuitem', { name: 'Pin', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await pinnedRow(page, WELCOME).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Unpin' }).click()
  await expect(page.getByTestId('pinned')).toHaveCount(0)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('the section folds away under its label, and stays folded after a relaunch', async ({ page }) => {
  await page.goto('/')
  await openFolder(page, MOCK_FOLDER)
  await pinFromExplorer(page, WELCOME)

  await page.getByTestId('pinned-toggle').click()
  await expect(page.getByTestId('pinned').getByRole('list').getByRole('button')).toHaveCount(0)
  await expect.poll(() => storedSession(page)).toMatchObject({ sidebar: { collapsedSections: ['pinned'] } })

  await page.reload()
  await expect(page.getByTestId('pinned-toggle')).toHaveAttribute('aria-expanded', 'false')
  await page.getByTestId('pinned-toggle').click()
  await expect.poll(() => pinnedNames(page)).toEqual(['Welcome.md'])
})

import { expect, test, type Page } from '@playwright/test'
import { MOCK_FOLDER, openFolderThroughDialog, openWelcome, watchForErrors } from './harness'

// Quick Open finds a Document by name, and the Command Menu around it. One
// palette, two modes: ⌘P is files only,
// ⌘K is every menu-bar command plus file names as you type. ↵ opens, ⌘↵ opens
// a Document in Raw, esc closes. With no Folder ⌘P is disabled and ⌘K lists
// commands only; with text selected in Rich mode ⌘K is the editor's link.

const palette = (page: Page) => page.getByTestId('command-menu')
const rows = (page: Page) => page.getByTestId('command-menu-row')
const rowNames = (page: Page) => page.getByTestId('command-menu-row-name')
const input = (page: Page) => page.getByTestId('command-menu-input')

async function openFolder(page: Page) {
  await page.goto('/')
  await openFolderThroughDialog(page, MOCK_FOLDER)
}

async function retype(page: Page, text: string) {
  await input(page).fill('')
  await page.keyboard.type(text)
}

test('Quick Open finds a Document by name, shows files only, and ↵ opens it', async ({ page }) => {
  const errors = watchForErrors(page)
  await openFolder(page)

  await page.keyboard.press('Meta+p')

  await expect(palette(page)).toHaveAttribute('data-mode', 'files')
  await expect(input(page)).toBeFocused()
  // Every file in the Folder, by name, and not one command. The style catalog's
  // files are listed too; what they are called is not this spec's business.
  await expect(rowNames(page).filter({ hasText: /^(Plumo\.md|lake\.png|Reading list\.md|Welcome\.md)$/ })).toHaveCount(4)
  await expect(page.getByTestId('command-menu-row-type').filter({ hasText: 'Command' })).toHaveCount(0)

  await page.keyboard.type('plu')

  const row = rows(page).first()
  await expect(rows(page)).toHaveCount(1)
  await expect(row.getByTestId('command-menu-row-name')).toHaveText('Plumo.md')
  await expect(row.locator('mark')).toHaveText('Plu')
  await expect(row.getByTestId('command-menu-row-detail')).toHaveText('Notes › Projects')
  await expect(row.getByTestId('command-menu-row-type')).toHaveText('Document')
  await expect(page.getByTestId('command-menu-footer')).toHaveText('↵ open · ⌘↵ open in Raw · esc close')
  await expect(page.getByTestId('command-menu-footer')).toHaveCSS('font-family', /^ui-monospace,/)

  await page.keyboard.press('Enter')

  await expect(palette(page)).toHaveCount(0)
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')
  await expect(page.getByRole('radio', { name: 'Rich' })).toBeChecked()
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('⌘K opens the palette at its geometry, lists every command with its shortcut in the system face, and matches commands and files together', async ({ page }) => {
  await openFolder(page)

  await page.keyboard.press('Meta+k')

  await expect(palette(page)).toHaveAttribute('data-mode', 'commands')
  // The palette zooms in over 150ms; its geometry is the settled one.
  await palette(page).evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)))
  const box = (await palette(page).boundingBox())!
  const viewport = page.viewportSize()!
  expect(box.width).toBe(560)
  expect(Math.abs(box.x + box.width / 2 - viewport.width / 2)).toBeLessThan(1)
  expect(Math.abs(box.y - viewport.height * 0.24)).toBeLessThan(1)
  await expect(palette(page)).toHaveCSS('border-radius', '12px')
  await expect(input(page)).toHaveCSS('height', '56px')
  await expect(input(page)).toHaveCSS('font-size', '17px')
  await expect(rows(page).first()).toHaveCSS('height', '40px')

  // Every manifest command with a menu item, in menu order, nothing else yet.
  await expect(rowNames(page).first()).toHaveText('New Document')
  await expect(rowNames(page).last()).toHaveText(/^Quit/)
  await expect(page.getByTestId('command-menu-row-type').filter({ hasNotText: 'Command' })).toHaveCount(0)
  // Playwright's Desktop Chrome profile is not a Mac to the renderer, which then spells the chord Ctrl+[.
  const sidebarRow = rows(page).filter({ has: page.getByText('Toggle Sidebar', { exact: true }) })
  await expect(sidebarRow.getByTestId('command-menu-row-shortcut')).toHaveText(/^(⌘|Ctrl\+)\[$/)
  await expect(sidebarRow.getByTestId('command-menu-row-shortcut')).toHaveCSS('font-family', /^system-ui/)
  await expect(sidebarRow.getByTestId('command-menu-row-shortcut')).toHaveCSS('font-size', '11px')
  await expect(sidebarRow.getByTestId('command-menu-row-shortcut')).toHaveCSS('font-weight', '500')

  // The two Toggle commands lead; a scattered match (Pas\*t\*e with\*o\*ut Formattin\*g\*) may trail them.
  await page.keyboard.type('tog')
  await expect(rowNames(page).nth(0)).toHaveText('Toggle Sidebar')
  await expect(rowNames(page).nth(1)).toHaveText('Toggle Rich/Raw')

  await retype(page, 'lake')
  await expect(rows(page)).toHaveCount(1)
  await expect(rows(page).getByTestId('command-menu-row-type')).toHaveText('Image')
  await expect(rows(page).getByTestId('command-menu-row-detail')).toHaveText('Notes › Attachments')

  await retype(page, 'welcome')
  await expect(rows(page).getByTestId('command-menu-row-type')).toHaveText('Document')

  await page.keyboard.press('Escape')
  await expect(palette(page)).toHaveCount(0)
})

test('⌘↵ opens a Document in Raw, and plainly opens an Image file', async ({ page }) => {
  const errors = watchForErrors(page)
  await openFolder(page)

  await page.keyboard.press('Meta+k')
  await page.keyboard.type('plumo')
  await page.keyboard.press('Meta+Enter')

  await expect(page.getByTestId('raw-editor-codemirror')).toBeVisible()
  await expect(page.getByRole('radio', { name: 'Raw' })).toBeChecked()
  await expect(page.locator('.bn-editor')).toHaveCount(0)
  // The palette stays mounted through its exit animation; ⌘P before it has gone would reopen it with "plumo" still typed.
  await expect(palette(page)).toHaveCount(0)

  await page.keyboard.press('Meta+p')
  await page.keyboard.type('lake')
  await page.keyboard.press('Meta+Enter')

  await expect(page.getByTestId('image-file-preview')).toBeVisible()
  await expect(page.getByRole('tab', { selected: true })).toContainText('lake.png')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('a command row runs its command, and a greyed one does nothing', async ({ page }) => {
  await openFolder(page)
  await expect(page.getByTestId('explorer')).toBeVisible()

  await page.keyboard.press('Meta+k')
  await page.keyboard.type('toggle side')
  await page.keyboard.press('Enter')

  await expect(palette(page)).toHaveCount(0)
  await expect(page.getByTestId('explorer')).toHaveCount(0)

  // No Document is open: Save is greyed, and ↵ on it leaves the palette up.
  await page.keyboard.press('Meta+k')
  await page.keyboard.type('save')
  await expect(rows(page).first()).toHaveAttribute('aria-disabled', 'true')
  await page.keyboard.press('Enter')
  await expect(palette(page)).toBeVisible()
})

test('with no Folder, ⌘P is disabled and ⌘K lists commands only', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('editor-empty-state')).toBeVisible()

  await page.keyboard.press('Meta+p')
  await page.waitForTimeout(250)
  await expect(palette(page)).toHaveCount(0)

  await page.keyboard.press('Meta+k')
  await expect(palette(page)).toHaveAttribute('data-mode', 'commands')
  await expect(page.getByTestId('command-menu-row-type').filter({ hasNotText: 'Command' })).toHaveCount(0)
  // Quick Open, New Document and Close Folder are greyed with no Folder.
  await expect(rows(page).filter({ has: page.getByText('Quick Open', { exact: true }) })).toHaveAttribute('aria-disabled', 'true')
  await expect(rows(page).filter({ has: page.getByText('New Document', { exact: true }) })).toHaveAttribute('aria-disabled', 'true')
  await expect(rows(page).filter({ has: page.getByText('Open Folder…', { exact: true }) })).not.toHaveAttribute('aria-disabled', 'true')

  await page.keyboard.type('welcome')
  await expect(page.getByTestId('command-menu-empty')).toHaveText('No matches')
})

test('in Rich mode with text selected, ⌘K is the editor\'s link command, not the Command Menu', async ({ page }) => {
  await openWelcome(page)
  await page.locator('.bn-editor p').first().dblclick()
  await expect.poll(() => page.evaluate(() => window.getSelection()?.isCollapsed)).toBe(false)
  // The chord goes to the editor only once the formatting toolbar's link button is mounted;
  // before that it falls through to the Command Menu by design, so wait for the toolbar.
  await expect(page.locator('[data-formatting-toolbar] [data-test="createLink"]')).toBeVisible()

  await page.keyboard.press('Meta+k')

  await page.waitForTimeout(250)
  await expect(palette(page)).toHaveCount(0)
  await expect(page.getByPlaceholder('Edit URL')).toBeVisible()
})

test('⌘F opens find in Rich mode and in Raw mode', async ({ page }) => {
  const errors = watchForErrors(page)
  await openWelcome(page)

  await page.keyboard.press('Meta+f')

  const richFind = page.getByTestId('rich-editor-find-input')
  await expect(richFind).toBeFocused()
  await page.keyboard.type('welcome')
  await expect(page.getByTestId('rich-editor-find-count')).toHaveText('1 / 1')
  await expect(page.locator('.bn-editor .plumo-rich-find-match--active')).toHaveText('Welcome')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('rich-editor-find-bar')).toHaveCount(0)

  await page.keyboard.press('Meta+Backslash')
  await expect(page.getByTestId('raw-editor-codemirror')).toBeVisible()
  await page.keyboard.press('Meta+f')

  await expect(page.getByTestId('raw-editor-find-input')).toBeFocused()
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

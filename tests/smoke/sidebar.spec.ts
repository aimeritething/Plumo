import { expect, test, type Page } from '@playwright/test'
import {
  MOCK_FOLDER, openDocumentThroughDialog, openFolderThroughDialog, openWelcome, storedSession, watchForErrors, WELCOME_PATH,
} from './harness'

// The two panes and the collapsed layout, ⌘[ and View → Toggle Sidebar,
// collapse on a lone Document, and the sidebar state's place in the Session.

const sidebar = (page: Page) => page.getByTestId('sidebar')
const pane = (page: Page) => page.getByTestId('editor-pane')
const toggle = (page: Page) => page.getByTestId('sidebar-toggle')

/** The editor pane edge to edge: no margin, radius or shadow, and nothing left of it. */
async function expectPaneFlush(page: Page) {
  await expect(pane(page)).toHaveCSS('margin', '0px')
  await expect(pane(page)).toHaveCSS('border-top-left-radius', '0px')
  await expect(pane(page)).toHaveCSS('box-shadow', 'none')
}

// The sidebar slides for 220ms; the sidebar leaving the DOM is the slide's end.
async function expectFlush(page: Page) {
  await expect(sidebar(page)).toHaveCount(0)
  await expectPaneFlush(page)
  expect((await pane(page).boundingBox())!.x).toBe(0)
  await expect(toggle(page)).toHaveAccessibleName('Show sidebar')
}

async function expectExpanded(page: Page) {
  await expect(sidebar(page)).toBeVisible()
  await expect(sidebar(page)).toHaveCSS('border-right', '1px solid rgb(229, 229, 229)')
  await expectPaneFlush(page)
  // Settled: the sidebar is at the window's left edge and the pane starts at its right edge.
  await expect.poll(async () => (await sidebar(page).boundingBox())!.x).toBe(0)
  const sidebarBox = (await sidebar(page).boundingBox())!
  await expect.poll(async () => (await pane(page).boundingBox())!.x).toBe(sidebarBox.width)
  await expect(toggle(page)).toHaveAccessibleName('Hide sidebar')
}

test('⌘[ toggles; collapsed, the editor is flush and the sidebar icon follows the traffic lights over the tab bar', async ({ page }) => {
  const errors = watchForErrors(page)
  await openWelcome(page)

  // A lone Document collapses the sidebar on open.
  await expectFlush(page)
  const tabBar = page.getByTestId('tab-bar')
  const show = page.getByRole('button', { name: 'Show sidebar' })
  await expect(show).toBeVisible()
  const showBox = (await show.boundingBox())!
  const tabBox = (await page.getByRole('tab', { name: 'Welcome.md' }).boundingBox())!
  // The icon sits at x 82 in both states, centred on the 52px row; the first Tab follows at 120.
  expect(showBox.x).toBe(82)
  expect(showBox.y).toBe(14)
  expect(tabBox.x).toBe(120)
  await expect(tabBar).toHaveCSS('height', '52px')
  expect((await tabBar.boundingBox())!.y).toBe(0)

  await show.hover()
  const tooltip = page.getByRole('tooltip')
  await expect(tooltip).toHaveText('Show sidebar ⌘[')
  await expect(tooltip.locator('kbd')).toHaveText(['⌘', '['])
  await expect(tooltip.locator('kbd').first()).toHaveCSS('font-family', /JetBrains Mono/)

  await page.keyboard.press('Meta+BracketLeft')
  await expectExpanded(page)
  // The sidebar's top row is the tab bar's height, so the traffic lights keep one y in both states.
  const top = sidebar(page).getByTestId('sidebar-top')
  await expect(top).toHaveCSS('height', '52px')
  expect((await top.boundingBox())!.y).toBe(0)
  expect((await tabBar.boundingBox())!.y).toBe(0)
  const hide = page.getByRole('button', { name: 'Hide sidebar' })
  await expect(hide).toBeVisible()
  expect((await hide.boundingBox())!.x).toBe(82)
  expect((await hide.boundingBox())!.y).toBe(14)

  await page.keyboard.press('Meta+BracketLeft')
  await expectFlush(page)

  // The icon works both ways.
  await page.getByRole('button', { name: 'Show sidebar' }).click()
  await expectExpanded(page)
  await page.getByRole('button', { name: 'Hide sidebar' }).click()
  await expectFlush(page)

  // View → Toggle Sidebar reaches the same handler. It is dispatched as the
  // native menu would, and the dispatcher drops a menu dispatch of the command
  // a keyboard shortcut ran within the last 150 ms, as it would a native
  // accelerator's echo; the wait keeps this one outside that window.
  await page.waitForTimeout(200)
  await page.evaluate(() => window.__plumoTest?.dispatchBrowserMenuCommand?.('view-toggle-sidebar'))
  await expectExpanded(page)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('the empty editor keeps the way back while collapsed', async ({ page }) => {
  await openWelcome(page)
  await expectFlush(page)

  await page.keyboard.press('Meta+w')

  await expect(page.getByTestId('editor-empty-state')).toBeVisible()
  await expectFlush(page)
  await page.getByRole('button', { name: 'Show sidebar' }).click()
  await expectExpanded(page)
})

test('⌘⇧O with no Folder collapses the sidebar; with a Folder open it leaves the sidebar as it was', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await openFolderThroughDialog(page, MOCK_FOLDER)

  await openDocumentThroughDialog(page, WELCOME_PATH)
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')
  await expectExpanded(page)

  await page.evaluate(() => window.__plumoTest?.dispatchBrowserMenuCommand?.('file-close-vault'))
  await expect(page.getByRole('tree')).toHaveCount(0)
  await expectExpanded(page)
  await openDocumentThroughDialog(page, WELCOME_PATH)
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')
  await expectFlush(page)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('dragging the sidebar edge resizes it, and the width and collapsed state survive a relaunch', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await openFolderThroughDialog(page, MOCK_FOLDER)
  await expect(sidebar(page)).toHaveCSS('width', '260px')
  await expect.poll(() => storedSession(page)).toMatchObject({ sidebar: { collapsed: false, width: 260 } })

  const edge = page.getByRole('separator', { name: 'Resize sidebar' })
  const box = (await edge.boundingBox())!
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 30, y)
  await page.mouse.move(x + 60, y)
  await expect(sidebar(page)).toHaveCSS('width', '320px')
  await page.mouse.up()

  await expect(sidebar(page)).toHaveCSS('width', '320px')
  await expect.poll(() => storedSession(page)).toMatchObject({ sidebar: { collapsed: false, width: 320 } })

  await page.keyboard.press('Meta+BracketLeft')
  await expect.poll(() => storedSession(page)).toMatchObject({ sidebar: { collapsed: true, width: 320 } })

  await page.reload()

  await expectFlush(page)
  await expect(page.getByTestId('editor-empty-state')).toBeVisible()
  await page.keyboard.press('Meta+BracketLeft')
  await expectExpanded(page)
  await expect(sidebar(page)).toHaveCSS('width', '320px')
  await expect(page.getByRole('tree')).toBeVisible()
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

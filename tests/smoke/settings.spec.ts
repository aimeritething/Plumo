import { expect, test, type Page } from '@playwright/test'
import { MOCK_FOLDER, openFolderThroughDialog, openWelcome, storedSession, watchForErrors, WELCOME_PATH } from './harness'

// Settings (CONTEXT.md): ⌘,, the Plumo menu and the Folder switcher open one
// dialog; a theme chosen there applies at once, lands in the Settings file
// apart from the Session, and View → Appearance and the dialog show the same
// value. A Custom Primary color typed there lands in the Settings file too.
// ⌘W closes the dialog and leaves the Tabs alone.

const APP_COMMAND_EVENT_NAME = 'plumo:dispatch-command' // src/shell/app-command-dispatcher.ts

const storedSettings = (page: Page) => page.evaluate(() => window.__plumoMockVault?.invoke('read_settings'))
const settingsDialog = (page: Page) => page.getByTestId('settings-dialog')
const themeSelect = (page: Page) => page.getByRole('combobox', { name: 'Theme' })
const colorSelect = (page: Page) => page.getByRole('combobox', { name: 'Primary color' })
/** What a select shows as chosen, without its chevron. */
const shown = (select: ReturnType<Page['getByRole']>) => select.locator('[data-slot="select-value"]')

async function dispatchCommand(page: Page, id: string) {
  await page.evaluate(
    ([eventName, commandId]) => window.dispatchEvent(new CustomEvent(eventName, { detail: commandId })),
    [APP_COMMAND_EVENT_NAME, id] as const,
  )
}

test('⌘, opens the Settings with no Folder open, and a theme chosen there applies at once and survives a relaunch', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.getByTestId('folder-switcher')).toHaveCount(0)

  await page.keyboard.press('Meta+Comma')

  await expect(settingsDialog(page)).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Settings' })).toBeVisible()
  await expect(shown(themeSelect(page))).toHaveText('Light')

  await themeSelect(page).click()
  await page.getByRole('option', { name: 'Dark' }).click()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(shown(themeSelect(page))).toHaveText('Dark')
  await expect.poll(() => storedSettings(page)).toEqual({ version: 1, theme: 'dark', primaryColor: '#0082fb' })
  expect(await storedSession(page)).not.toHaveProperty('theme')

  await page.keyboard.press('Escape')
  await expect(settingsDialog(page)).toHaveCount(0)

  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('the Folder switcher\'s menu ends with Settings, which opens the dialog', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await openFolderThroughDialog(page, MOCK_FOLDER)

  await page.getByTestId('folder-switcher-row').click()
  const item = page.getByTestId('folder-switcher-menu').getByRole('menuitem').last()
  await expect(item).toHaveText('Settings⌘,')
  await item.click()

  await expect(settingsDialog(page)).toBeVisible()
  await expect(page.getByTestId('folder-switcher-menu')).toHaveCount(0)
  // The menu closing hands focus to the dialog, not back to the switcher's row;
  // Tab walks the nav, the close button, then the theme.
  await expect(settingsDialog(page)).toBeFocused()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(themeSelect(page)).toBeFocused()
  // The arrows open the list and move through it; Enter chooses.
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('option', { name: 'Light' })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await expect(shown(themeSelect(page))).toHaveText('Dark')
  await expect(themeSelect(page)).toBeFocused()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('View → Appearance and the dialog show the same theme, and ⌘W closes the dialog, not the Tab', async ({ page }) => {
  const errors = watchForErrors(page)
  await openWelcome(page)
  await dispatchCommand(page, 'app-settings')
  await expect(settingsDialog(page)).toBeVisible()

  await dispatchCommand(page, 'view-appearance-system')
  await expect(shown(themeSelect(page))).toHaveText('System')

  await dispatchCommand(page, 'app-settings')
  await expect(settingsDialog(page)).toHaveCount(1)

  await page.keyboard.press('Meta+w')
  await expect(settingsDialog(page)).toHaveCount(0)
  await expect(page.getByTestId(`tab:${WELCOME_PATH}`)).toBeVisible()
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('Custom puts a hex field after the select, and six digits typed there are the Primary color', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await page.keyboard.press('Meta+Comma')
  await expect(shown(colorSelect(page))).toHaveText('Blue')

  await colorSelect(page).click()
  await page.getByRole('option', { name: 'Custom' }).click()
  const field = page.getByRole('textbox', { name: 'Custom color' })
  await expect(field).toHaveValue('#0082FB')

  await field.fill('3a83f7')
  await expect.poll(() => storedSettings(page)).toEqual({ version: 1, theme: 'light', primaryColor: '#3a83f7' })
  await page.keyboard.press('Tab')
  await expect(field).toHaveValue('#3A83F7')

  await page.keyboard.press('Escape')
  await page.keyboard.press('Meta+Comma')
  await expect(shown(colorSelect(page))).toHaveText('Custom')
  await expect(page.getByRole('textbox', { name: 'Custom color' })).toHaveValue('#3A83F7')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

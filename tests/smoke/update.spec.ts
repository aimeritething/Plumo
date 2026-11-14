import { expect, test, type Page } from '@playwright/test'
import type { UpdateInfo } from '@/update/update-commands'
import { openWelcome, typeAtEnd, savedContent, watchForErrors, WELCOME_PATH } from './harness'

// The Update (CONTEXT.md): once one is downloaded, the Update button sits to
// the right of the sidebar icon in both sidebar states; its popover shows the
// version and its notes, and Restart and Update there writes pending edits
// and ends in the install instead of the quit. `offerUpdate` stands in for
// the background check, which only the packaged app runs.

const UPDATE: UpdateInfo = { version: '0.2.0', notes: '### Added\n\n- Plumo updates itself.\n\n### Fixed\n\n- A crash on launch.' }

const offerUpdate = (page: Page) => page.evaluate((update) => window.__plumoTest?.offerUpdate?.(update), UPDATE)
const callCount = (page: Page, command: string) =>
  page.evaluate((name) => window.__plumoMockVault?.calls.filter((call) => call.command === name).length ?? 0, command)
const updateButton = (page: Page) => page.getByTestId('update-button')

test('the Update button appears beside the sidebar icon once an Update is ready, in both sidebar states, and the Tabs make room for it when the sidebar is collapsed', async ({ page }) => {
  const errors = watchForErrors(page)
  await openWelcome(page)
  await expect(updateButton(page)).toHaveCount(0)

  await offerUpdate(page)
  await expect(updateButton(page)).toBeVisible()

  // A lone Document opens with the sidebar collapsed: the button sits over the
  // tab bar's inset, 6px after the sidebar icon and on its centre line.
  await expect(page.getByTestId('sidebar')).toHaveCount(0)
  const toggle = (await page.getByTestId('sidebar-toggle').boundingBox())!
  const button = (await updateButton(page).boundingBox())!
  expect(button.x).toBe(toggle.x + toggle.width + 6)
  expect(button.y + button.height / 2).toBe(toggle.y + toggle.height / 2)
  // The first Tab moves on to make room, once the inset has slid.
  await expect.poll(async () => (await page.getByRole('tab').first().boundingBox())!.x).toBeGreaterThanOrEqual(button.x + button.width + 8)
  if (process.env.UPDATE_SHOTS) await page.screenshot({ path: `${process.env.UPDATE_SHOTS}/collapsed.png` })

  // With the sidebar open the button holds still, over the sidebar's top row.
  await page.getByTestId('sidebar-toggle').click()
  await expect(page.getByTestId('sidebar')).toBeVisible()
  expect((await updateButton(page).boundingBox())!.x).toBe(button.x)
  if (process.env.UPDATE_SHOTS) await page.screenshot({ path: `${process.env.UPDATE_SHOTS}/open.png` })

  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('the popover shows the version and its notes, and Restart and Update writes the pending edit and installs instead of quitting', async ({ page }) => {
  const errors = watchForErrors(page)
  await openWelcome(page)
  await offerUpdate(page)

  await updateButton(page).click()
  const popover = page.getByTestId('update-popover')
  await expect(popover).toContainText('Plumo 0.2.0 is ready')
  await expect(popover).toContainText('Plumo updates itself.')
  await expect(popover).toContainText('A crash on launch.')
  expect(await callCount(page, 'install_update')).toBe(0)
  if (process.env.UPDATE_SHOTS) await page.screenshot({ path: `${process.env.UPDATE_SHOTS}/popover.png` })

  await page.keyboard.press('Escape')
  await typeAtEnd(page, ' written before the restart')
  await updateButton(page).click()
  await popover.getByRole('button', { name: 'Restart and Update' }).click()

  await expect.poll(() => callCount(page, 'install_update')).toBe(1)
  expect(await callCount(page, 'quit_app')).toBe(0)
  expect(await savedContent(page, WELCOME_PATH)).toContain('written before the restart')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

import { expect, test, type Page } from '@playwright/test'
// Type-only: brings the fixture's `window.__plumoMockVault` declaration into the spec program.
import type { MockVault, MockVaultImage } from '../../src/platform/mock/vault-fixture'
import { MOCK_FOLDER, watchForErrors } from './harness'

// An Image file opens as a real Tab, fitted to the editor pane, with its
// dimensions and size in the tab bar beside Open ↗, which hands the file to a
// proper image app, and Copy path. Outside Tauri there is no asset protocol, so the fixture
// serves each picture as an SVG data URL of the seeded natural size; that is
// also what lets this spec plant a `<script>` an `<img>` must never run.

const LAKE = `${MOCK_FOLDER}/Attachments/lake.png`
const WIDE = `${MOCK_FOLDER}/Attachments/wide.png`
const SMALL = `${MOCK_FOLDER}/Attachments/small.png`
const SCRIPTED = `${MOCK_FOLDER}/Attachments/scripted.svg`
const WELCOME = `${MOCK_FOLDER}/Welcome.md`

const storedSession = (page: Page) => page.evaluate(() => window.__plumoMockVault?.invoke('read_session'))
const activeTab = (page: Page) => page.getByRole('tab', { selected: true })
const imageInTab = (page: Page) => page.getByTestId('image-file-preview')

async function openFolder(page: Page) {
  await page.goto('/')
  await page.evaluate((chosen) => window.__plumoMockVault?.queueDialogSelection([chosen]), MOCK_FOLDER)
  await page.keyboard.press('Meta+o')
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Attachments`)).toBeVisible()
}

/** Write an Image file into the Folder and let the watcher bring it into the Explorer. */
async function addImage(page: Page, path: string, picture: MockVaultImage) {
  await page.evaluate(([target, image]) => {
    const vault: MockVault | undefined = window.__plumoMockVault
    if (!vault) throw new Error('The Folder fixture is not installed')
    vault.writeImage(target as string, image as MockVaultImage)
    vault.emitExternalChange([target as string])
  }, [path, picture] as const)
}

async function expandAttachments(page: Page) {
  const expand = page.getByTestId('explorer').getByRole('button', { name: 'Expand Attachments' })
  if (await expand.count()) await expand.click()
}

async function openInExplorer(page: Page, path: string) {
  await expandAttachments(page)
  await page.getByTestId(`explorer-row:${path}`).click()
}

test('an Image file opens as a Tab with its picture, dimensions, size and two hand-offs', async ({ page }) => {
  const errors = watchForErrors(page)
  await openFolder(page)

  await openInExplorer(page, LAKE)

  await expect(activeTab(page)).toHaveText('lake.png')
  await expect(page.getByTestId(`tab:${LAKE}`)).toBeVisible()
  await expect(page.getByRole('tab', { selected: true })).toHaveAttribute('title', LAKE)
  await expect(page.getByTestId('image-meta')).toHaveText('1920 × 1080 · 240 KB')
  await expect(page.getByRole('button', { name: 'Open ↗' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copy path' })).toBeVisible()
  await expect(page.locator('.bn-editor')).toHaveCount(0)

  // Open ↗ is Open in Default App.
  await page.getByRole('button', { name: 'Open ↗' }).click()
  await expect.poll(() => page.evaluate(() => window.__plumoMockVault?.openedExternallyPath())).toBe(LAKE)

  // Clicking it again activates the Tab it already has.
  await openInExplorer(page, LAKE)
  await expect(page.getByRole('tab')).toHaveCount(1)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('Copy path puts the absolute path on the clipboard', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await openFolder(page)
  await openInExplorer(page, LAKE)

  await page.getByRole('button', { name: 'Copy path' }).click()

  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(LAKE)
  await expect(page.locator('[data-sonner-toast]')).toHaveText('Copied path to clipboard')
})

test('a large picture is scaled down to fit and a small one is left at its own size, with nothing to scroll', async ({ page }) => {
  await openFolder(page)
  await addImage(page, WIDE, { width: 4000, height: 2250, fileSize: 4_000_000 })
  await addImage(page, SMALL, { width: 200, height: 150, fileSize: 9_000 })

  await openInExplorer(page, WIDE)
  await expect(page.getByTestId('image-meta')).toHaveText('4000 × 2250 · 3.8 MB')
  const view = await page.getByTestId('image-view').boundingBox()
  const wide = await imageInTab(page).boundingBox()
  expect(wide!.width).toBeLessThanOrEqual(view!.width)
  expect(wide!.height).toBeLessThanOrEqual(view!.height)
  expect(await page.getByTestId('image-view').evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight)).toBe(true)

  await openInExplorer(page, SMALL)
  await expect(page.getByTestId('image-meta')).toHaveText('200 × 150 · 8.8 KB')
  const small = await imageInTab(page).boundingBox()
  expect(small!.width).toBe(200)
  expect(small!.height).toBe(150)
})

test('an SVG carrying a script renders without running it', async ({ page }) => {
  const errors = watchForErrors(page)
  await openFolder(page)
  await addImage(page, SCRIPTED, {
    width: 320,
    height: 240,
    fileSize: 1_024,
    markup: '<script>window.top.__svgScriptRan = true</script>',
  })

  await openInExplorer(page, SCRIPTED)

  await expect(imageInTab(page)).toBeVisible()
  await expect(page.getByTestId('image-meta')).toHaveText('320 × 240 · 1 KB')
  expect(await page.evaluate(() => Reflect.get(window, '__svgScriptRan'))).toBeUndefined()
  expect(errors.pageErrors).toEqual([])
})

test('an Image Tab is never written: ⌘S does nothing and ⌘W closes it under the successor rule', async ({ page }) => {
  await openFolder(page)
  await page.getByTestId(`explorer-row:${WELCOME}`).click()
  await openInExplorer(page, LAKE)
  await expect(activeTab(page)).toHaveText('lake.png')

  await page.keyboard.press('Meta+s')
  await expect.poll(() => page.evaluate(() => window.__plumoMockVault?.calls.filter((call) => call.command === 'save_note_content').length)).toBe(0)
  await expect(page.getByTestId('write-failure-bar')).toHaveCount(0)

  await page.keyboard.press('Meta+w')
  await expect(page.getByRole('tab')).toHaveCount(1)
  await expect(activeTab(page)).toHaveText('Welcome.md')
})

test('a picture overwritten in another app refreshes in its Tab', async ({ page }) => {
  await openFolder(page)
  await openInExplorer(page, LAKE)
  await expect(page.getByTestId('image-meta')).toHaveText('1920 × 1080 · 240 KB')
  const before = await imageInTab(page).getAttribute('src')

  await addImage(page, LAKE, { width: 800, height: 600, fileSize: 120_000, fill: '#c03535' })

  await expect(page.getByTestId('image-meta')).toHaveText('800 × 600 · 117.2 KB')
  const afterResize = await imageInTab(page).getAttribute('src')
  expect(afterResize).not.toBe(before)

  // Same size, same second: the listing cannot tell it moved, so the watcher's
  // own reload count is what makes the picture be fetched again (ADR-0007).
  await addImage(page, LAKE, { width: 800, height: 600, fileSize: 120_000, fill: '#2f8f4f' })

  await expect.poll(() => imageInTab(page).getAttribute('src')).not.toBe(afterResize)
  await expect(page.getByTestId('image-meta')).toHaveText('800 × 600 · 117.2 KB')
})

test('relaunch restores an Image Tab from an entry with no mode, and tolerates a hand-edited one', async ({ page }) => {
  const errors = watchForErrors(page)
  await openFolder(page)
  await page.getByTestId(`explorer-row:${WELCOME}`).click()
  await openInExplorer(page, LAKE)

  await expect.poll(() => storedSession(page)).toMatchObject({
    folder: MOCK_FOLDER,
    openEditors: [{ path: WELCOME, mode: 'rich' }, { path: LAKE }],
    activePath: LAKE,
  })

  await page.reload()

  await expect(page.getByRole('tab')).toHaveCount(2)
  await expect(activeTab(page)).toHaveText('lake.png')
  await expect(page.getByTestId('image-meta')).toHaveText('1920 × 1080 · 240 KB')
  await expect(page.getByTestId(`explorer-row:${LAKE}`).locator('..')).toHaveAttribute('aria-selected', 'true')

  await page.evaluate((seed) => window.__plumoMockVault?.seedSession(seed), {
    version: 1,
    folder: MOCK_FOLDER,
    openEditors: [{ path: LAKE, mode: 'raw' }],
    activePath: LAKE,
    sidebar: { collapsed: false, width: 260 },
  })
  await page.reload()

  await expect(page.getByRole('tab')).toHaveCount(1)
  await expect(activeTab(page)).toHaveText('lake.png')
  await expect(imageInTab(page)).toBeVisible()
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('an Image file in the Session that is no longer in the Folder is dropped', async ({ page }) => {
  await page.goto('/')
  await page.evaluate((seed) => window.__plumoMockVault?.seedSession(seed), {
    version: 1,
    folder: MOCK_FOLDER,
    openEditors: [{ path: `${MOCK_FOLDER}/Attachments/gone.png` }, { path: WELCOME, mode: 'rich' }],
    activePath: `${MOCK_FOLDER}/Attachments/gone.png`,
    sidebar: { collapsed: false, width: 260 },
  })

  await page.reload()

  await expect(page.getByRole('tab')).toHaveCount(1)
  await expect(activeTab(page)).toHaveText('Welcome.md')
})

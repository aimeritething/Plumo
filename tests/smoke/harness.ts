import { expect, type Page } from '@playwright/test'
import type { MockVault, MockVaultCall } from '../../src/platform/mock/vault-fixture'

// Shared helpers for the smoke specs: the error watcher with the harness's own
// noise filtered out, and the fixture calls the specs make through
// `window.__plumoMockVault` (see src/platform/mock/vault-fixture.ts).

export const MOCK_FOLDER = '/Users/plumo/Documents/Notes'
export const WELCOME_PATH = `${MOCK_FOLDER}/Welcome.md`

// Plumo ships no favicon; a headed Chromium asks for one and Vite answers 404.
// Playwright's tracing (on for every run so it can be kept on failure)
// injects a script into each frame; the HTML block's sandboxed srcdoc frame
// refuses it and Chromium logs that refusal. Both are the harness, not the app.
const HARNESS_NOISE = ['favicon.ico', "Blocked script execution in 'about:srcdoc'"]

function isHarnessNoise(text: string): boolean {
  return HARNESS_NOISE.some((noise) => text.includes(noise))
}

export function watchForErrors(page: Page) {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error' && !isHarnessNoise(message.text())) consoleErrors.push(message.text())
  })
  return { pageErrors, consoleErrors }
}

/** The Session file as the fixture holds it. */
export function storedSession(page: Page): Promise<unknown> {
  return page.evaluate(() => window.__plumoMockVault?.invoke('read_session'))
}

/** Queue `path` as the directory dialog's answer, so the next ⌘O or Open Folder click opens it. */
export async function queueFolderSelection(page: Page, path: string) {
  await page.evaluate((chosen) => window.__plumoMockVault?.queueDialogSelection([chosen]), path)
}

/** Queue `path` as the directory dialog's answer, press ⌘O and wait for the Explorer tree. */
export async function openFolderThroughDialog(page: Page, path: string) {
  await queueFolderSelection(page, path)
  await page.keyboard.press('Meta+o')
  await expect(page.getByTestId('explorer-tree')).toBeVisible()
}

/** Queue `path` as the dialog's answer and press ⌘⇧O. */
export async function openDocumentThroughDialog(page: Page, path: string) {
  await page.evaluate((selected) => {
    const vault: MockVault | undefined = window.__plumoMockVault
    if (!vault) throw new Error('The Folder fixture is not installed')
    vault.queueDialogSelection([selected])
  }, path)
  await page.keyboard.press('Meta+Shift+o')
}

export async function openWelcome(page: Page) {
  await page.goto('/')
  await openDocumentThroughDialog(page, WELCOME_PATH)
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')
}

export function saveCalls(page: Page): Promise<MockVaultCall[]> {
  return page.evaluate(() => window.__plumoMockVault?.calls.filter((call) => call.command === 'save_note_content') ?? [])
}

export function savedContent(page: Page, path: string): Promise<string | undefined> {
  return page.evaluate(
    (target) => window.__plumoMockVault?.files().find((file) => file.path === target)?.content,
    path,
  )
}

/** Click the end of the last paragraph and type. */
export async function typeAtEnd(page: Page, text: string) {
  await page.locator('.bn-editor p').last().click()
  await page.keyboard.press('End')
  await page.keyboard.type(text)
}

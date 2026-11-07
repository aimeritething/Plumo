import { expect, test, type Page } from '@playwright/test'
// Type-only: brings the fixture's `window.__plumoMockVault` declaration into the spec program.
import type { MockVault } from '../../src/platform/mock/vault-fixture'
import { MOCK_FOLDER, openDocumentThroughDialog, openWelcome, watchForErrors } from './harness'

// Light on first launch, View → Appearance switches and the choice lives in
// the Settings file, apart from the Session; `system` follows the OS live. The native menu is the
// Rust side's; here the manifest command arrives as the app-command event the
// renderer also listens for, and is dispatched to the same handler.

const APP_COMMAND_EVENT_NAME = 'plumo:dispatch-command' // src/shell/app-command-dispatcher.ts

const storedSettings = (page: Page) => page.evaluate(() => window.__plumoMockVault?.invoke('read_settings'))
const storedSession = (page: Page) => page.evaluate(() => window.__plumoMockVault?.invoke('read_session'))
const documentTheme = (page: Page) => page.locator('html').getAttribute('data-theme')

async function chooseAppearance(page: Page, mode: 'system' | 'dark' | 'light') {
  await page.evaluate(
    ([eventName, id]) => window.dispatchEvent(new CustomEvent(eventName, { detail: id })),
    [APP_COMMAND_EVENT_NAME, `view-appearance-${mode}`] as const,
  )
}

const SAMPLE_PATH = `${MOCK_FOLDER}/Sample.md`
const SAMPLE = [
  '# Title', '', 'Body with `inline code`.', '', '## Section', '', '- [ ] Task', '', '> Quote', '',
  '```ts', 'const a = 1', '```', '', '| A | B |', '| --- | --- |', '| 1 | 2 |', '', '---', '',
].join('\n')

/** Plant a Document that uses every block the ticket measures, and open it. */
async function openSample(page: Page) {
  await page.goto('/')
  await page.evaluate(([path, content]) => {
    const vault: MockVault | undefined = window.__plumoMockVault
    if (!vault) throw new Error('The Folder fixture is not installed')
    vault.writeNote(path, content)
  }, [SAMPLE_PATH, SAMPLE] as const)
  await openDocumentThroughDialog(page, SAMPLE_PATH)
  await expect(page.locator('.bn-editor h1')).toHaveText('Title')
}

test('first launch is light: the sidebar, the editor pane and the body text sample to the Radix gray roles', async ({ page }) => {
  const errors = watchForErrors(page)
  await openWelcome(page)

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await page.keyboard.press('Meta+BracketLeft') // a lone Document collapsed the sidebar
  await expect(page.getByTestId('sidebar')).toHaveCSS('color', 'rgb(32, 32, 32)')
  await expect(page.getByTestId('shell')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(page.getByTestId('editor-pane')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  // --document-foreground: 60% gray-12 over gray-11, a little softer than the UI's text.
  await expect(page.locator('.bn-editor')).toHaveCSS('color', /^oklab\(0\.347/)
  await expect(page.locator('.bn-editor h1')).toHaveCSS('color', 'rgb(32, 32, 32)')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('a sample Document measures at the specified typography', async ({ page }) => {
  const errors = watchForErrors(page)
  await openSample(page)
  const editor = page.locator('.bn-editor')

  await expect(editor).toHaveCSS('font-family', /^system-ui/)
  await expect(editor).toHaveCSS('font-size', '16px')
  await expect(editor).toHaveCSS('line-height', '28.8px')
  await expect(editor).toHaveCSS('font-weight', '400')
  await expect(editor.locator('h1')).toHaveCSS('font-size', '26px')
  await expect(editor.locator('h1')).toHaveCSS('line-height', '33.8px')
  await expect(editor.locator('h1')).toHaveCSS('font-weight', '600')
  await expect(editor.locator('h2')).toHaveCSS('font-size', '22px')
  await expect(editor.locator('h2')).toHaveCSS('line-height', '28.6px')
  await expect(editor.locator('h2')).toHaveCSS('font-weight', '600')
  const inlineCode = editor.locator('.bn-inline-content code').first()
  await expect(inlineCode).toHaveCSS('font-size', '14px')
  await expect(inlineCode).toHaveCSS('font-family', /^ui-monospace,/)
  await expect(inlineCode).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.06)')
  await expect(editor.locator('[data-content-type="codeBlock"]')).toHaveCSS('font-size', '13px')
  await expect(editor.locator('[data-content-type="codeBlock"]')).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(editor.locator('[data-content-type="codeBlock"]')).toHaveCSS('border-top-left-radius', '6px')
  await expect(editor.locator('blockquote').first()).toHaveCSS('border-left-width', '4px')
  await expect(editor.locator('blockquote').first()).toHaveCSS('border-left-color', 'rgba(0, 0, 0, 0.12)')
  await expect(editor.locator('input[type="checkbox"]').first()).toHaveCSS('width', '14px')
  await expect(editor.locator('input[type="checkbox"]').first()).toHaveCSS('border-top-width', '1px')
  await expect(editor.locator('th').first()).toHaveCSS('background-color', 'rgba(0, 0, 0, 0.06)')
  await expect(editor.locator('hr')).toHaveCSS('border-top-width', '1px')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('View → Appearance → Dark switches the document, persists in the Settings and survives a relaunch', async ({ page }) => {
  const errors = watchForErrors(page)
  await openWelcome(page)

  await chooseAppearance(page, 'dark')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByTestId('shell')).toHaveCSS('background-color', 'rgb(17, 17, 17)')
  await expect(page.getByTestId('editor-pane')).toHaveCSS('background-color', 'rgb(17, 17, 17)')
  await expect(page.locator('.bn-editor')).toHaveCSS('color', /^oklab\(0\.877/)
  await expect(page.locator('.bn-editor h1')).toHaveCSS('color', 'rgb(238, 238, 238)')
  await expect.poll(() => storedSettings(page)).toEqual({ version: 1, theme: 'dark', primaryColor: '#0082fb' })
  expect(await storedSession(page)).not.toHaveProperty('theme')

  await page.reload()

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')
  await expect.poll(() => storedSettings(page)).toMatchObject({ theme: 'dark' })

  await chooseAppearance(page, 'light')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  await expect.poll(() => storedSettings(page)).toMatchObject({ theme: 'light' })
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('System follows a live OS appearance change and is what the Settings remember', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.emulateMedia({ colorScheme: 'dark' })
  await openWelcome(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await chooseAppearance(page, 'system')

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(() => storedSettings(page)).toMatchObject({ theme: 'system' })

  await page.emulateMedia({ colorScheme: 'light' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.reload()
  expect(await documentTheme(page)).toBe('light')
  await expect.poll(() => storedSettings(page)).toMatchObject({ theme: 'system' })
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('the light theme draws nothing in the old indigo', async ({ page }) => {
  await openSample(page)
  const indigo = await page.evaluate(() => {
    const old = ['rgb(109, 120, 213)', 'rgb(94, 105, 209)', 'rgb(94, 106, 210)']
    const hits: string[] = []
    for (const element of Array.from(document.querySelectorAll('*'))) {
      const style = getComputedStyle(element)
      for (const property of ['color', 'background-color', 'border-top-color', 'border-left-color', 'outline-color', 'box-shadow']) {
        const value = style.getPropertyValue(property)
        if (old.some((colour) => value.includes(colour))) hits.push(`${element.tagName.toLowerCase()} ${property}`)
      }
    }
    return hits
  })
  expect(indigo).toEqual([])
})

test('no text face is fetched: the sans and mono faces are the system\'s', async ({ page }) => {
  const fontRequests: string[] = []
  page.on('request', (request) => {
    if (request.resourceType() === 'font') fontRequests.push(request.url())
  })
  await openWelcome(page)
  await page.evaluate(() => document.fonts.ready)

  expect(fontRequests.filter((url) => /jetbrains|inter|plex|mantine|fontsource/i.test(url))).toEqual([])
})

test('a Primary color chosen in Settings repaints the page, persists and is painted again before the bundle on relaunch', async ({ page }) => {
  const errors = watchForErrors(page)
  await openWelcome(page)
  const primary = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--primary-9').trim())
  expect(await primary()).toBe('#0082fb')

  await page.evaluate((eventName) => window.dispatchEvent(new CustomEvent(eventName, { detail: 'app-settings' })), APP_COMMAND_EVENT_NAME)
  await page.getByTestId('settings-primary-color:purple').click()

  await expect.poll(primary).toBe('#8e4ec6')
  await expect.poll(() => storedSettings(page)).toMatchObject({ primaryColor: '#8e4ec6' })

  await page.reload()
  // index.html's pre-paint script lays the mirrored style sheet over the page.
  expect(await page.evaluate(() => document.getElementById('plumo-primary-color')?.textContent ?? '')).toContain('--primary-9: #8e4ec6;')
  await expect.poll(primary).toBe('#8e4ec6')

  await page.evaluate((eventName) => window.dispatchEvent(new CustomEvent(eventName, { detail: 'app-settings' })), APP_COMMAND_EVENT_NAME)
  await page.getByTestId('settings-primary-color:blue').click()
  await expect.poll(primary).toBe('#0082fb')
  await expect(page.locator('#plumo-primary-color')).toHaveCount(0)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

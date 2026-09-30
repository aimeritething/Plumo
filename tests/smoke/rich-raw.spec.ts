import { expect, test, type Page } from '@playwright/test'
import {
  MOCK_FOLDER,
  openDocumentThroughDialog,
  openWelcome,
  saveCalls,
  savedContent,
  storedSession,
  typeAtEnd,
  watchForErrors,
  WELCOME_PATH,
} from './harness'

// The Rich/Raw round trip, each Tab's own
// mode surviving a relaunch (a reload, with the fixture's Session file), the
// Frontmatter bytes a Rich save protects, and invalid Frontmatter forcing
// Raw mode until it is fixed.

const PLUMO_PATH = `${MOCK_FOLDER}/Projects/Plumo.md`
const BROKEN_PATH = `${MOCK_FOLDER}/Broken.md`
const BROKEN_CONTENT = '---\nthis is not yaml\n---\n# Broken\n\nBody\n'
const PLUMO_FRONTMATTER = '---\ntitle: Plumo\n---\n'
const TABLE_PATH = `${MOCK_FOLDER}/Table.md`
const TABLE_CONTENT = [
  '# Week',
  '',
  '| Day | Plan |',
  '| --- | --- |',
  '| Morning | Writing |',
  '| Afternoon | Meetings |',
  '',
  '## After the table',
  '',
].join('\n')

const rawEditor = (page: Page) => page.getByTestId('raw-editor-codemirror')
const rawText = (page: Page) => page.evaluate(() => {
  const host = document.querySelector('[data-testid="raw-editor-codemirror"]') as (Element & { __cmView?: { state: { doc: { toString(): string } } } }) | null
  return host?.__cmView?.state.doc.toString() ?? null
})
/** The 1-based line the CodeMirror caret is on, and the line holding `text`. */
const rawCaretLines = (page: Page, text: string) => page.evaluate((needle) => {
  const host = document.querySelector('[data-testid="raw-editor-codemirror"]') as (Element & { __cmView?: { state: { doc: { toString(): string; lineAt(pos: number): { number: number } }; selection: { main: { head: number } } } } }) | null
  const view = host?.__cmView
  if (!view) return null
  const lines = view.state.doc.toString().split('\n')
  return { caret: view.state.doc.lineAt(view.state.selection.main.head).number, target: lines.findIndex((line) => line.includes(needle)) + 1 }
}, text)
/** The text of the BlockNote block holding the DOM selection. */
const richCaretBlock = (page: Page) => page.evaluate(() => {
  const node = window.getSelection()?.anchorNode
  const element = node instanceof Element ? node : node?.parentElement
  return element?.closest('.bn-block-content')?.textContent ?? null
})
const richSegment = (page: Page) => page.getByRole('radio', { name: 'Rich' })
const rawSegment = (page: Page) => page.getByRole('radio', { name: 'Raw' })

test('⌘\\ and the segmented control switch modes, the Markdown shows in Raw, and the content comes back intact', async ({ page }) => {
  const errors = watchForErrors(page)
  await openWelcome(page)
  await typeAtEnd(page, ' Typed in Rich.')
  await expect(richSegment(page)).toBeChecked()

  await page.keyboard.press('Meta+Backslash')

  await expect(rawEditor(page)).toBeVisible()
  await expect(rawSegment(page)).toBeChecked()
  await expect.poll(() => rawText(page)).toContain('# Welcome')
  expect(await rawText(page)).toContain('Typed in Rich.')
  await expect(page.locator('.bn-editor')).toHaveCount(0)
  // The caret was in the edited paragraph; in Raw it lands at the end of that paragraph's line.
  await expect.poll(async () => {
    const lines = await rawCaretLines(page, 'Typed in Rich.')
    return lines && lines.target > 0 && lines.caret === lines.target
  }).toBe(true)

  // Move the caret to the heading line, then go back to Rich: it lands in the heading block.
  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+Home')
  await richSegment(page).click()

  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')
  await expect(page.locator('.bn-editor')).toContainText('Typed in Rich.')
  await expect(richSegment(page)).toBeChecked()
  await expect(rawEditor(page)).toHaveCount(0)
  await expect.poll(() => richCaretBlock(page)).toBe('Welcome')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('a cursor in a table cell is a cursor on that row in Raw, typing there replaces nothing, and Rich comes back to the row', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(([path, content]) => window.__plumoMockVault?.writeNote(path, content), [TABLE_PATH, TABLE_CONTENT])
  await openDocumentThroughDialog(page, TABLE_PATH)
  await page.locator('.bn-editor td', { hasText: 'Meetings' }).click()

  await page.keyboard.press('Meta+Backslash')

  await expect(rawEditor(page)).toBeVisible()
  await expect.poll(async () => {
    const lines = await rawCaretLines(page, '| Afternoon')
    return lines && lines.caret === lines.target
  }).toBe(true)
  // Typing right after the switch adds to the row: the table is not selected, so nothing is replaced.
  await page.keyboard.type(' x')
  expect(await rawText(page)).toContain('| Morning | Writing |\n| Afternoon | Meetings | x\n')

  await page.keyboard.press('Meta+z')
  await page.keyboard.press('Meta+z')
  await page.keyboard.press('Meta+Backslash')

  await expect(page.locator('.bn-editor table')).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const node = window.getSelection()?.anchorNode
    const element = node instanceof Element ? node : node?.parentElement
    return element?.closest('tr')?.textContent ?? null
  })).toBe('AfternoonMeetings')
})

test('the control carries a tooltip naming the shortcut as a mono chip', async ({ page }) => {
  await openWelcome(page)

  await rawSegment(page).hover()

  const tip = page.getByRole('tooltip')
  await expect(tip).toHaveText('Raw ⌘\\')
  await expect(tip.locator('kbd')).toHaveText('⌘\\')
  await expect(tip.locator('kbd')).toHaveCSS('font-family', /JetBrains Mono/)
})

test('Raw edits reach disk with the exact bytes, and ⌘S writes them at once', async ({ page }) => {
  const errors = watchForErrors(page)
  await openWelcome(page)
  await page.keyboard.press('Meta+Backslash')
  await expect(rawEditor(page)).toBeVisible()

  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+End')
  await page.keyboard.type('\nRaw bytes.')
  await page.keyboard.press('Meta+s')

  await expect.poll(() => saveCalls(page), { timeout: 1_000 }).toHaveLength(1)
  expect(await savedContent(page, WELCOME_PATH)).toMatch(/Raw bytes\.\n?$/)
  // The raw editor's own idle timer must not write a second copy.
  await page.waitForTimeout(2_000)
  expect(await saveCalls(page)).toHaveLength(1)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('two Tabs keep different modes at once, and a relaunch restores each Tab\'s mode', async ({ page }) => {
  const errors = watchForErrors(page)
  await openWelcome(page)
  await page.keyboard.press('Meta+Backslash')
  await expect(rawEditor(page)).toBeVisible()

  await openDocumentThroughDialog(page, PLUMO_PATH)
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')
  await expect(richSegment(page)).toBeChecked()

  await page.keyboard.press('Meta+1')
  await expect(rawEditor(page)).toBeVisible()
  await expect(rawSegment(page)).toBeChecked()
  await expect.poll(() => storedSession(page)).toMatchObject({
    openEditors: [{ path: WELCOME_PATH, mode: 'raw' }, { path: PLUMO_PATH, mode: 'rich' }],
    activePath: WELCOME_PATH,
  })

  await page.reload()

  await expect(page.getByRole('tab')).toHaveCount(2)
  await expect(rawEditor(page)).toBeVisible()
  await expect.poll(() => rawText(page)).toContain('# Welcome')
  await page.keyboard.press('Meta+2')
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')
  await expect(richSegment(page)).toBeChecked()
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('a Document with Frontmatter shows it as Properties, not as blocks, and keeps the bytes through a body save', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await openDocumentThroughDialog(page, PLUMO_PATH)
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')

  await expect(page.locator('.bn-editor')).not.toContainText('title')
  await expect(page.getByRole('group', { name: 'Properties' }).getByRole('textbox', { name: 'title' })).toHaveValue('Plumo')

  await typeAtEnd(page, ' Body edit.')
  await page.keyboard.press('Meta+s')
  await expect.poll(() => savedContent(page, PLUMO_PATH)).toContain('Body edit.')
  // The diff is body-only: the Frontmatter bytes are the same and the original body is still there.
  const saved = String(await savedContent(page, PLUMO_PATH))
  expect(saved.slice(0, PLUMO_FRONTMATTER.length)).toBe(PLUMO_FRONTMATTER)
  expect(saved.slice(PLUMO_FRONTMATTER.length)).toMatch(/^# Plumo\n\nA small desktop app for Markdown files\./)

  await rawSegment(page).click()

  await expect(rawEditor(page)).toBeVisible()
  await expect.poll(() => rawText(page)).toMatch(/^---\ntitle: Plumo\n---\n/)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('invalid Frontmatter opens in Raw with Rich disabled and its reason as the tooltip; fixing it re-enables Rich', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await page.evaluate(([path, content]) => window.__plumoMockVault?.writeNote(path, content), [BROKEN_PATH, BROKEN_CONTENT])
  await openDocumentThroughDialog(page, BROKEN_PATH)

  await expect(rawEditor(page)).toBeVisible()
  await expect(rawSegment(page)).toBeChecked()
  await expect(richSegment(page)).toBeDisabled()
  await richSegment(page).hover()
  await expect(page.getByRole('tooltip')).toHaveText('Fix the frontmatter to use Rich mode')
  await page.keyboard.press('Meta+Backslash')
  await expect(rawEditor(page)).toBeVisible()
  await expect.poll(() => storedSession(page)).toMatchObject({ openEditors: [{ path: BROKEN_PATH, mode: 'raw' }] })

  // Fix the YAML in Raw: the second line becomes a key.
  await page.locator('.cm-content').click()
  await page.keyboard.press('Meta+Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Home')
  await page.keyboard.press('Shift+End')
  await page.keyboard.type('title: Fixed')
  await page.keyboard.press('Meta+s')
  await expect.poll(() => savedContent(page, BROKEN_PATH)).toMatch(/^---\ntitle: Fixed\n---\n/)

  await expect(richSegment(page)).toBeEnabled()
  await expect(rawSegment(page)).toBeChecked()
  await richSegment(page).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Broken')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('Toggle Rich/Raw does nothing with no Document open', async ({ page }) => {
  const errors = watchForErrors(page)
  await page.goto('/')
  await expect(page.getByTestId('editor-empty-state')).toBeVisible()

  await page.keyboard.press('Meta+Backslash')
  await page.evaluate(() => window.__plumoTest?.dispatchBrowserMenuCommand?.('edit-toggle-raw-editor'))

  await expect(page.getByTestId('editor-empty-state')).toBeVisible()
  await expect(rawEditor(page)).toHaveCount(0)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

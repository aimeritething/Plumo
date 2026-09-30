import { expect, test, type Page } from '@playwright/test'
import { MOCK_FOLDER, openDocumentThroughDialog, savedContent, watchForErrors } from './harness'

// Properties: the Frontmatter above the body in Rich mode. An edit rewrites
// only the lines of the Property it touches, goes on the body's Undo history,
// and Autosave writes it.

const PATH = `${MOCK_FOLDER}/Props.md`
const CONTENT = [
  '---',
  'title: Everything   # the title',
  'tags: [style-catalog, overview]',
  'date: 2026-09-19',
  'draft: false',
  'summary: |',
  '  One of each block.',
  '  Used to check the rhythm.',
  'author:',
  '  name: Ann',
  '  url: ann.dev',
  '---',
  '# Everything',
  '',
  'First paragraph.',
  '',
].join('\n')

async function openProps(page: Page, content = CONTENT) {
  await page.goto('/')
  await page.evaluate(({ path, text }) => window.__plumoMockVault?.writeNote(path, text), { path: PATH, text: content })
  await openDocumentThroughDialog(page, PATH)
  await expect(page.locator('.bn-editor h1')).toHaveText('Everything')
}

const properties = (page: Page) => page.getByRole('group', { name: 'Properties' })
const value = (page: Page, key: string) => properties(page).locator(`[data-property-key="${key}"] [data-property-value]`).first()
const saved = (page: Page) => savedContent(page, PATH)

test('Properties shows every Property above the body, one row each, in disk order', async ({ page }) => {
  const errors = watchForErrors(page)
  await openProps(page)
  const keys = await properties(page).locator('[data-property-key]').evaluateAll((rows) => rows.map((row) => row.getAttribute('data-property-key')))
  expect(keys).toEqual(['title', 'tags', 'date', 'draft', 'summary', 'author'])
  await expect(value(page, 'title')).toHaveValue('Everything')
  await expect(properties(page).getByText('style-catalog')).toBeVisible()
  await expect(value(page, 'summary')).toHaveValue('One of each block.\nUsed to check the rhythm.')
  await expect(properties(page).getByText('name: Ann, url: ann.dev')).toBeVisible()
  expect(errors.pageErrors).toEqual([])
})

test('an edit rewrites only its own lines, and Autosave writes it', async ({ page }) => {
  await openProps(page)
  await value(page, 'title').fill('Overview')
  await value(page, 'title').press('Enter')
  await page.getByRole('checkbox', { name: 'draft' }).click()
  await expect.poll(() => saved(page)).toBe(CONTENT
    .replace('title: Everything   # the title', 'title: Overview   # the title')
    .replace('draft: false', 'draft: true'))
})

test('Undo in the body takes back a Property edit, one step each, and Redo puts it back', async ({ page }) => {
  await openProps(page)
  await page.getByRole('checkbox', { name: 'draft' }).click()
  await expect.poll(() => saved(page)).toContain('draft: true')
  await page.locator('.bn-editor p').last().click()
  await page.keyboard.press('Meta+z')
  await expect(page.getByRole('checkbox', { name: 'draft' })).toHaveAttribute('aria-checked', 'false')
  await expect.poll(() => saved(page)).toBe(CONTENT)
  await page.keyboard.press('Meta+Shift+z')
  await expect(page.getByRole('checkbox', { name: 'draft' })).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => saved(page)).toContain('draft: true')
})

test('a Property is added, renamed and removed; removing the last one removes the block', async ({ page }) => {
  await openProps(page, '---\ntitle: A\n---\n# Everything\n\nBody\n')
  await properties(page).getByRole('button', { name: 'Add property' }).click()
  await page.keyboard.type('status')
  await page.keyboard.press('Enter')
  await expect(value(page, 'status')).toBeFocused()
  await page.keyboard.type('draft')
  await page.keyboard.press('Enter')
  await expect.poll(() => saved(page)).toBe('---\ntitle: A\nstatus: draft\n---\n# Everything\n\nBody\n')

  const key = properties(page).locator('[data-property-key="status"] input[aria-label="Property name"]')
  await key.fill('title')
  await expect(key).toHaveAttribute('aria-invalid', 'true')
  await key.fill('state')
  await key.press('Enter')
  await expect.poll(() => saved(page)).toBe('---\ntitle: A\nstate: draft\n---\n# Everything\n\nBody\n')

  for (const name of ['state', 'title']) {
    await properties(page).locator(`[data-property-key="${name}"]`).hover()
    await properties(page).getByRole('button', { name: `Remove ${name}` }).click()
  }
  await expect.poll(() => saved(page)).toBe('# Everything\n\nBody\n')
  await expect(properties(page)).toHaveCount(0)
})

test('a list edits as chips and keeps its inline style', async ({ page }) => {
  await openProps(page)
  const input = value(page, 'tags')
  await input.click()
  await page.keyboard.type('new one')
  await page.keyboard.press('Enter')
  await expect.poll(() => saved(page)).toContain('tags: [style-catalog, overview, new one]')
  await page.keyboard.press('Backspace')
  await expect.poll(() => saved(page)).toContain('tags: [style-catalog, overview]\n')
  await properties(page).getByText('overview').hover()
  await properties(page).getByRole('button', { name: 'Remove overview' }).click()
  await expect.poll(() => saved(page)).toContain('tags: [style-catalog]\n')
})

test('↑ from the first line of the body goes into Properties, ↓ from the last one comes back', async ({ page }) => {
  await openProps(page)
  await page.locator('.bn-editor h1').click()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowUp')
  // The last Property that takes the caret: author's Edit in Raw.
  await expect(properties(page).getByRole('button', { name: 'Edit in Raw' })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(value(page, 'summary')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(properties(page).getByRole('button', { name: 'Edit in Raw' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.type('X')
  await expect(page.locator('.bn-editor h1')).toHaveText('XEverything')
})

test('Frontmatter YAML refuses opens in Rich mode, says so, and is written back untouched', async ({ page }) => {
  const broken = '---\ntitle: a: b\ntags: [a, b\n---\n# Everything\n\nFirst paragraph.\n'
  await openProps(page, broken)
  await expect(properties(page).getByText('The Frontmatter can’t be read.')).toBeVisible()
  await page.locator('.bn-editor p', { hasText: 'First paragraph.' }).click()
  await page.keyboard.press('End')
  await page.keyboard.type(' More.')
  await expect.poll(() => saved(page)).toBe(broken.replace('First paragraph.', 'First paragraph. More.'))
})

test('a Document with no Frontmatter shows no Properties', async ({ page }) => {
  await openProps(page, '# Everything\n\nBody\n')
  await expect(properties(page)).toHaveCount(0)
})

test('Raw mode shows a Property edit, and an edit made in Raw shows in Rich', async ({ page }) => {
  await openProps(page)
  await value(page, 'date').fill('2026-10-01')
  await value(page, 'date').press('Enter')
  await page.getByRole('radio', { name: 'Raw' }).click()
  const raw = page.getByTestId('raw-editor-codemirror')
  await expect(raw).toContainText('date: 2026-10-01')
  await raw.getByText('date: 2026-10-01').click()
  await page.keyboard.press('End')
  await page.keyboard.type('X')
  await page.getByRole('radio', { name: 'Rich' }).click()
  await expect(value(page, 'date')).toHaveValue('2026-10-01X')
  await expect.poll(() => saved(page)).toContain('date: 2026-10-01X\n')
})

test('switching modes with the caret in a Property keeps it on that Property', async ({ page }) => {
  await openProps(page)
  await value(page, 'date').click()
  await page.keyboard.press('Meta+Backslash')
  await expect(page.getByTestId('raw-editor-codemirror')).toBeVisible()
  await expect.poll(() => page.evaluate(() => {
    const host = document.querySelector('[data-testid="raw-editor-codemirror"]') as (Element & { __cmView?: { state: { doc: { lineAt(pos: number): { text: string } }; selection: { main: { head: number } } } } }) | null
    const view = host?.__cmView
    return view ? view.state.doc.lineAt(view.state.selection.main.head).text : null
  })).toBe('date: 2026-09-19')

  // Down to the summary's second line, then back to Rich: the summary takes the caret.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Meta+Backslash')
  await expect(value(page, 'summary')).toBeFocused()
})

test('Edit ▸ Add property creates the Frontmatter of a Document that has none', async ({ page }) => {
  await openProps(page, '# Everything\n\nBody\n')
  await page.locator('.bn-editor p', { hasText: 'Body' }).click()
  await page.keyboard.press('Meta+k')
  await page.keyboard.type('Add Property')
  await page.keyboard.press('Enter')
  await expect(properties(page).getByRole('textbox', { name: 'New Property name' })).toBeFocused()
  await page.keyboard.type('status')
  await page.keyboard.press('Enter')
  await expect.poll(() => saved(page)).toBe('---\nstatus:\n---\n# Everything\n\nBody\n')
})

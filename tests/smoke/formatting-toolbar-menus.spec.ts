import { expect, test, type Page } from '@playwright/test'
import { openWelcome, savedContent, watchForErrors, WELCOME_PATH } from './harness'

// The formatting toolbar's two menus, the block type select and the highlight
// colour caret, portal their lists to the body and take the focus while open.
// The toolbar must stay through that, a choice must land the focus back in
// the text, and the toolbar must still be there afterwards.

const activeElement = (page: Page) => page.evaluate(() => {
  const active = document.activeElement
  return active?.closest('.bn-editor') ? 'editor' : active?.tagName.toLowerCase() ?? 'none'
})

// Select the last `text` of the first paragraph, from its end; the toolbar
// follows the selection.
async function selectEndOfFirstParagraph(page: Page, text: string) {
  const paragraph = page.locator('.bn-editor p').first()
  await paragraph.click()
  await expect(page.locator('.bn-editor')).toBeFocused()
  await page.keyboard.press('End')
  await page.keyboard.down('Shift')
  for (let index = 0; index < text.length; index += 1) await page.keyboard.press('ArrowLeft', { delay: 10 })
  await page.keyboard.up('Shift')
  await expect.poll(() => page.evaluate(() => String(window.getSelection()))).toBe(text)
  await expect(page.locator('[data-formatting-toolbar]')).toBeVisible()
}

test('the highlight colour caret opens its menu without closing the toolbar', async ({ page }) => {
  const errors = watchForErrors(page)
  await openWelcome(page)
  await selectEndOfFirstParagraph(page, 'the page.')
  const toolbar = page.locator('[data-formatting-toolbar]')
  const menu = page.getByRole('menu')

  await page.locator('[data-test="highlightColorMenu"]').click()
  await expect(menu).toBeVisible()
  await expect(toolbar).toBeVisible()

  await page.getByRole('menuitem', { name: 'Red' }).click()
  await expect(menu).toBeHidden()
  await expect(toolbar).toBeVisible()
  expect(await activeElement(page)).toBe('editor')
  await expect(page.locator('.bn-editor mark.markdown-highlight')).toHaveCount(1)
  await expect.poll(() => savedContent(page, WELCOME_PATH)).toContain('==🔴the page.==')

  // Escape leaves the toolbar too.
  await page.locator('[data-test="highlightColorMenu"]').click()
  await expect(menu).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toBeHidden()
  await expect(toolbar).toBeVisible()

  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('the highlight toggle clears a coloured highlight and sets a yellow one', async ({ page }) => {
  await openWelcome(page)
  await selectEndOfFirstParagraph(page, 'the page.')
  await page.locator('[data-test="highlightColorMenu"]').click()
  await page.getByRole('menuitem', { name: 'Blue' }).click()
  await expect.poll(() => savedContent(page, WELCOME_PATH)).toContain('==🔵the page.==')

  await page.locator('[data-test="highlight"]').click()
  await expect(page.locator('.bn-editor mark.markdown-highlight')).toHaveCount(0)
  await expect.poll(() => savedContent(page, WELCOME_PATH)).not.toContain('==')

  await page.locator('[data-test="highlight"]').click()
  await expect.poll(() => savedContent(page, WELCOME_PATH)).toContain('==the page.==')
  await expect(page.locator('[data-formatting-toolbar]')).toBeVisible()
})

test('a block type choice keeps the toolbar and the focus in the text', async ({ page }) => {
  await openWelcome(page)
  await selectEndOfFirstParagraph(page, ' page.')

  await page.getByRole('button', { name: /Paragraph/ }).click()
  await page.getByRole('menuitem', { name: 'Heading 2' }).click()

  await expect(page.locator('.bn-editor h2')).toHaveText('This Folder lives in memory. Edits stay for the life of the page.')
  await expect(page.locator('[data-formatting-toolbar]')).toBeVisible()
  await expect(page.getByRole('button', { name: /Heading 2/ })).toBeVisible()
  expect(await activeElement(page)).toBe('editor')

  await page.keyboard.type('X')
  await expect.poll(() => savedContent(page, WELCOME_PATH)).toContain('## This Folder lives in memory. Edits stay for the life of theX')
})

test('the colour button beside a highlight the cursor is in recolours it', async ({ page }) => {
  await openWelcome(page)
  await selectEndOfFirstParagraph(page, 'the page.')
  await page.locator('[data-test="highlight"]').click()
  await expect.poll(() => savedContent(page, WELCOME_PATH)).toContain('==the page.==')

  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowRight')
  const boundary = page.locator('[data-test="highlightBoundaryColorMenu"]')
  await expect(boundary).toBeVisible()
  await boundary.click()
  await page.getByRole('menuitem', { name: 'Green' }).click()
  await expect.poll(() => savedContent(page, WELCOME_PATH)).toContain('==🟢the page.==')

  // The focus is back in the text: typing lands in the Document.
  await page.keyboard.press('End')
  await page.keyboard.type(' tail')
  await expect.poll(() => savedContent(page, WELCOME_PATH)).toContain('the page. tail')
})

test('Esc in the link field hands the caret back to the text, the selection kept', async ({ page }) => {
  const errors = watchForErrors(page)
  await openWelcome(page)
  await selectEndOfFirstParagraph(page, 'page.')

  await page.locator('[data-test="createLink"]').click()
  await expect(page.locator('[data-test="linkUrl"]')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-test="linkUrl"]')).toHaveCount(0)
  await expect.poll(() => activeElement(page)).toBe('editor')
  await expect.poll(() => page.evaluate(() => String(window.getSelection()))).toBe('page.')

  await page.keyboard.type('Z')
  await expect(page.locator('.bn-editor p').first()).toHaveText('This Folder lives in memory. Edits stay for the life of the Z')
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

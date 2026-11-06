import { expect, test, type Page } from '@playwright/test'
import { MOCK_FOLDER, openDocumentThroughDialog, watchForErrors } from './harness'

// An Image block selected and resized with the pointer (AIM-529): the picture
// is not selectable text, a selected one is tinted rather than outlined, a
// handle dragged inward shrinks it while the formatting toolbar is open, and
// undo puts the width back. The Document sits beside the style catalog's
// pictures so `../images/<name>` resolves under `pnpm dev`.

const PATH = `${MOCK_FOLDER}/Style catalog/English/Resize.md`
const CONTENT = '# Resize\n\n![Lake](../images/cerknica-landscape.jpg)\n\nAfter the picture.\n'

async function openResize(page: Page) {
  await page.goto('/')
  await page.evaluate(([path, content]) => window.__plumoMockVault?.writeNote(path, content), [PATH, CONTENT])
  await openDocumentThroughDialog(page, PATH)
  const picture = page.locator('[data-content-type="image"] img')
  await expect.poll(() => picture.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  return picture
}

function wrapperWidth(page: Page) {
  return page.locator('[data-content-type="image"] .bn-file-block-content-wrapper')
    .evaluate((element) => Math.round(element.getBoundingClientRect().width))
}

test('a selected picture is tinted, not outlined, and is not selectable text', async ({ page }) => {
  const errors = watchForErrors(page)
  const picture = await openResize(page)
  await picture.click()

  const wrapper = page.locator('[data-content-type="image"] .bn-file-block-content-wrapper')
  await expect(page.locator('.ProseMirror-selectednode [data-content-type="image"], [data-content-type="image"].ProseMirror-selectednode')).toHaveCount(1)
  expect(await wrapper.evaluate((element) => getComputedStyle(element).outlineStyle)).toBe('none')
  expect(await page.locator('[data-content-type="image"] .bn-visual-media-wrapper')
    .evaluate((element) => getComputedStyle(element, '::before').content)).not.toBe('none')
  expect(await picture.evaluate((img) => getComputedStyle(img).userSelect)).toBe('none')
  expect(errors.pageErrors).toEqual([])
})

test('dragging a handle inward shrinks a selected picture, and undo restores its width', async ({ page }) => {
  const errors = watchForErrors(page)
  const picture = await openResize(page)
  await picture.click()
  await expect(page.locator('.bn-formatting-toolbar')).toBeVisible()
  const before = await wrapperWidth(page)

  await picture.hover()
  const handle = page.locator('[data-content-type="image"] .bn-resize-handle').last()
  const box = (await handle.boundingBox())!
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  // The picture follows the pointer from the first moves, before the button
  // is released: a swallowed drag only caught up once the pointer had gone a
  // long way, then jumped.
  await page.mouse.move(start.x - 30, start.y, { steps: 3 })
  expect(await wrapperWidth(page)).toBe(before - 30)
  await page.mouse.move(start.x - 150, start.y, { steps: 5 })
  await page.mouse.up()

  await expect.poll(() => wrapperWidth(page)).toBe(before - 150)

  await page.locator('.bn-editor p', { hasText: 'After the picture.' }).click()
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => wrapperWidth(page)).toBe(before)
  expect(errors.pageErrors).toEqual([])
})

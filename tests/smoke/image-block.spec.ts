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

test('a selected picture stays selected when the pointer leaves it', async ({ page }) => {
  const errors = watchForErrors(page)
  const picture = await openResize(page)
  await picture.click()
  const box = (await picture.boundingBox())!

  // WebKit, which Plumo runs in, re-checks a selection when a node inside it
  // is removed and collapses one around a picture into a caret in the Block
  // above; ProseMirror then reads that caret back. So the resize handles stay
  // in the page and are only hidden when the pointer leaves: Chromium keeps the
  // selection either way, but sees the removals.
  await page.evaluate(() => {
    const removed: string[] = []
    new MutationObserver((records) => {
      for (const record of records) removed.push(...[...record.removedNodes].map((node) => node.nodeName))
    }).observe(document.querySelector('[data-content-type="image"]')!, { childList: true, subtree: true })
    Object.assign(window, { __removedFromImageBlock: removed })
  })
  for (const point of [
    { x: box.x + box.width / 2, y: box.y + box.height + 30 },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    { x: box.x - 60, y: box.y + box.height / 2 },
  ]) {
    await page.mouse.move(point.x, point.y, { steps: 5 })
    await page.waitForTimeout(100)
  }

  await expect(page.locator('.ProseMirror-selectednode [data-content-type="image"], [data-content-type="image"].ProseMirror-selectednode')).toHaveCount(1)
  expect(await page.evaluate(() => (window as unknown as { __removedFromImageBlock: string[] }).__removedFromImageBlock)).toEqual([])
  await expect(page.locator('[data-content-type="image"] .bn-resize-handle').first()).toBeHidden()
  expect(errors.pageErrors).toEqual([])
})

test('clicking another line after a picture closes the toolbar where it was, without a flash at the click', async ({ page }) => {
  const errors = watchForErrors(page)
  const picture = await openResize(page)
  await picture.click()
  await expect(page.locator('.bn-formatting-toolbar')).toBeVisible()

  // Every frame's toolbar, from before the click until it has gone: it never
  // moves to the line that was clicked, nor turns into the text toolbar there.
  await page.evaluate(() => {
    const tops: number[] = []
    const sample = () => {
      const toolbar = document.querySelector('.bn-formatting-toolbar')
      if (toolbar) tops.push(toolbar.getBoundingClientRect().top)
      requestAnimationFrame(sample)
    }
    sample()
    Object.assign(window, { __toolbarTops: tops })
  })
  await page.locator('.bn-editor p', { hasText: 'After the picture.' }).click()
  await expect(page.locator('.bn-formatting-toolbar')).toHaveCount(0)

  const tops = await page.evaluate(() => (window as unknown as { __toolbarTops: number[] }).__toolbarTops)
  expect(new Set(tops).size).toBe(1)
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

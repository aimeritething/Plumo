import { expect, test, type Page } from '@playwright/test'
import { MOCK_FOLDER, openDocumentThroughDialog, savedContent, watchForErrors } from './harness'

// An Image block selected and resized with the pointer (AIM-529, AIM-531): the
// picture is not selectable text, a selected one is tinted rather than
// outlined and shows the Image toolbar in its corner (never the formatting
// toolbar), a handle dragged inward shrinks it from both edges, undo puts the
// width back, and the caption and alt text are typed in place. The Document
// sits beside the style catalog's pictures so `../images/<name>` resolves
// under `pnpm dev`.

const PATH = `${MOCK_FOLDER}/Style catalog/English/Resize.md`
const CONTENT = '# Resize\n\n![Lake](../images/cerknica-landscape.jpg)\n\nAfter the picture.\n'

async function openResize(page: Page, content = CONTENT) {
  await page.goto('/')
  await page.evaluate(([path, text]) => window.__plumoMockVault?.writeNote(path, text), [PATH, content])
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

test('a selected picture shows the Image toolbar in its corner, and no formatting toolbar', async ({ page }) => {
  const errors = watchForErrors(page)
  const picture = await openResize(page)
  await picture.click()

  const toolbar = page.getByTestId('image-toolbar')
  await expect(toolbar).toHaveCSS('opacity', '1')
  await expect(page.locator('.bn-formatting-toolbar')).toHaveCount(0)
  const pictureBox = (await picture.boundingBox())!
  const toolbarBox = (await toolbar.boundingBox())!
  expect(toolbarBox.y).toBeGreaterThanOrEqual(pictureBox.y)
  expect(toolbarBox.x + toolbarBox.width).toBeLessThanOrEqual(pictureBox.x + pictureBox.width)

  await page.locator('.bn-editor p', { hasText: 'After the picture.' }).click()
  await page.mouse.move(0, 0)
  await expect(toolbar).toHaveCSS('opacity', '0')
  expect(errors.pageErrors).toEqual([])
})

test('dragging a handle inward shrinks a selected picture from both edges, and undo restores its width', async ({ page }) => {
  const errors = watchForErrors(page)
  const picture = await openResize(page)
  await picture.click()
  const before = await wrapperWidth(page)
  const centre = async () => {
    const box = (await picture.boundingBox())!
    return Math.round(box.x + box.width / 2)
  }
  const centreBefore = await centre()

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
  expect(await wrapperWidth(page)).toBe(before - 60)
  await expect(page.getByTestId('image-toolbar')).toHaveCSS('opacity', '0')
  await page.mouse.move(start.x - 150, start.y, { steps: 5 })
  await page.mouse.up()

  await expect.poll(() => wrapperWidth(page)).toBe(before - 300)
  expect(Math.abs(await centre() - centreBefore)).toBeLessThanOrEqual(1)

  await page.locator('.bn-editor p', { hasText: 'After the picture.' }).click()
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(() => wrapperWidth(page)).toBe(before)
  expect(errors.pageErrors).toEqual([])
})

test('a resize is saved as the width in the Markdown image, and none once it fills the text column', async ({ page }) => {
  const errors = watchForErrors(page)
  const picture = await openResize(page)
  await picture.click()
  const before = await wrapperWidth(page)

  async function dragRightHandle(dx: number) {
    await picture.hover()
    const box = (await page.locator('[data-content-type="image"] .bn-resize-handle').last().boundingBox())!
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await page.mouse.move(start.x, start.y)
    await page.mouse.down()
    await page.mouse.move(start.x + dx, start.y, { steps: 5 })
    await page.mouse.up()
  }

  await dragRightHandle(-150)
  await expect.poll(() => wrapperWidth(page)).toBe(before - 300)
  await page.keyboard.press('Meta+s')
  await expect.poll(() => savedContent(page, PATH))
    .toContain(`![Lake|${before - 300}](../images/cerknica-landscape.jpg)`)

  // Dragged back out to the text column, the picture is as wide as it is with
  // no width at all, so the Markdown carries none.
  await dragRightHandle(400)
  await expect.poll(() => wrapperWidth(page)).toBe(before)
  await page.keyboard.press('Meta+s')
  await expect.poll(() => savedContent(page, PATH)).toBe(CONTENT)
  expect(errors.pageErrors).toEqual([])
})

test('a caption is typed in place under the picture and saved as the image title', async ({ page }) => {
  const errors = watchForErrors(page)
  const picture = await openResize(page)
  await picture.click()
  await page.getByTestId('image-toolbar-caption').click()

  const input = page.getByTestId('image-caption-input')
  await expect(input).toBeFocused()
  await page.keyboard.type('A lake in spring')
  await page.keyboard.press('Enter')

  await expect(page.getByTestId('image-caption')).toHaveText('A lake in spring')
  await expect(page.locator('.ProseMirror-selectednode [data-content-type="image"], [data-content-type="image"].ProseMirror-selectednode')).toHaveCount(1)
  await page.keyboard.press('Meta+s')
  await expect.poll(() => savedContent(page, PATH))
    .toContain('![Lake](../images/cerknica-landscape.jpg "A lake in spring")')
  expect(errors.pageErrors).toEqual([])
})

test('the alt text is changed from the toolbar menu', async ({ page }) => {
  const errors = watchForErrors(page)
  const picture = await openResize(page)
  await picture.click()
  await page.getByTestId('image-toolbar-more').click()
  await page.getByRole('menuitem', { name: 'Alt text' }).click()

  const input = page.getByTestId('image-alt-text-input')
  await expect(input).toBeFocused()
  await input.fill('Cerknica lake')
  await page.keyboard.press('Enter')

  await expect(input).toHaveCount(0)
  await page.keyboard.press('Meta+s')
  await expect.poll(() => savedContent(page, PATH)).toContain('![Cerknica lake](../images/cerknica-landscape.jpg)')
  expect(errors.pageErrors).toEqual([])
})

test('Replace image swaps the file alone and leaves the picture selected in a focused editor', async ({ page }) => {
  const errors = watchForErrors(page)
  const picture = await openResize(page, '# Resize\n\n![Lake|300](../images/cerknica-landscape.jpg "Spring")\n\nAfter the picture.\n')
  await picture.click()
  await page.getByTestId('image-toolbar-more').click()
  await page.getByRole('menuitem', { name: 'Replace image' }).click()
  await page.getByRole('tab', { name: 'Embed' }).click()
  await page.getByTestId('file-panel-embed-input').fill('../images/no-such-picture.png')
  await page.keyboard.press('Enter')

  await expect(page.getByTestId('file-panel')).toHaveCount(0)
  await expect.poll(() => savedContent(page, PATH))
    .toContain('![Lake|300](../images/no-such-picture.png "Spring")')
  await expect(page.locator('.ProseMirror-selectednode [data-content-type="image"], [data-content-type="image"].ProseMirror-selectednode')).toHaveCount(1)
  expect(await page.evaluate(() => document.activeElement?.closest('.ProseMirror') !== null)).toBe(true)
  expect(errors.pageErrors).toEqual([])
})

test('a picture that fails to load shows its file name, and its Markdown is left as it is', async ({ page }) => {
  const errors = watchForErrors(page)
  const content = '# Broken\n\n![Gone|300](../images/no-such-picture.png "Kept")\n'
  await page.goto('/')
  await page.evaluate(([path, text]) => window.__plumoMockVault?.writeNote(path, text), [PATH, content])
  await openDocumentThroughDialog(page, PATH)

  const placeholder = page.getByTestId('image-placeholder')
  await expect(placeholder).toContainText('no-such-picture.png')
  await expect(page.getByTestId('image-caption')).toHaveText('Kept')
  await placeholder.hover()
  await expect(page.getByTestId('image-toolbar')).toHaveCSS('opacity', '1')
  await expect(page.getByTestId('image-toolbar-preview')).toBeDisabled()
  await expect(page.locator('[data-content-type="image"] .bn-resize-handle').first()).toBeHidden()
  expect(errors.pageErrors).toEqual([])
})

import { expect, test, type Locator, type Page } from '@playwright/test'
import { MOCK_FOLDER, openDocumentThroughDialog, openFolderThroughDialog, watchForErrors } from './harness'

// Where an image dropped from Finder lands in a wide window, read from the
// real layout: a release in the empty margins beside Rich mode's centred text
// column, or beside Raw mode's lines, lands beside the block or line at that
// height, and the side menu's block drag reads the margins the same way. A
// Finder drop is Tauri's native event, which a browser has not got, so the
// specs drive the HTML5 path the hook shares its rule with (ADR-0006).

const PATH = `${MOCK_FOLDER}/Margins.md`
const CONTENT = '# Margins\n\nFirst paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n'

test.use({ viewport: { width: 1600, height: 900 } })

async function openMargins(page: Page) {
  await page.goto('/')
  await page.evaluate(([path, content]) => window.__plumoMockVault?.writeNote(path, content), [PATH, CONTENT])
  await openDocumentThroughDialog(page, PATH)
  await expect(page.locator('.bn-editor h1')).toHaveText('Margins')
}

/** The x of a point in the empty margin left or right of the editor's own element, and inside the scroll area. */
async function marginX(page: Page, side: 'left' | 'right', editorSelector: string): Promise<number> {
  return page.evaluate(([which, selector]) => {
    const editor = document.querySelector(selector)!.getBoundingClientRect()
    const area = document.querySelector('.editor-scroll-area')!.getBoundingClientRect()
    return which === 'left' ? (area.left + editor.left) / 2 : (editor.right + area.right) / 2
  }, [side, editorSelector] as const)
}

/** Drag a PNG over the point and release it there, as the browser's HTML5 events would. */
async function dragImageTo(page: Page, x: number, y: number, release = true) {
  await page.evaluate(([clientX, clientY, drop]) => {
    const transfer = new DataTransfer()
    transfer.items.add(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'shot.png', { type: 'image/png' }))
    const target = document.elementFromPoint(clientX, clientY)!
    const init = { bubbles: true, cancelable: true, clientX, clientY, dataTransfer: transfer }
    target.dispatchEvent(new DragEvent('dragover', init))
    if (drop) target.dispatchEvent(new DragEvent('drop', init))
  }, [x, y, release] as const)
}

async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = (await locator.boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

/** The top-level blocks, an image as `image`, leaving out the empty paragraph BlockNote keeps at the end. */
function blockOrder(page: Page) {
  return page.evaluate(() => Array.from(
    document.querySelectorAll('.bn-editor > .bn-block-group > .bn-block-outer'),
    (block) => (block.querySelector('[data-content-type="image"]') ? 'image' : block.textContent?.trim() ?? ''),
  ).filter(Boolean))
}

test('an image released in the margin beside Rich mode\'s text column lands beside the block at that height', async ({ page }) => {
  const errors = watchForErrors(page)
  await openMargins(page)
  const paragraph = page.locator('.bn-editor p', { hasText: 'Second paragraph.' })
  const box = (await paragraph.boundingBox())!

  const left = await marginX(page, 'left', '.bn-editor')
  await dragImageTo(page, left, box.y + box.height * 0.25, false)
  await expect(page.getByText('Drop image here')).toBeVisible()
  await dragImageTo(page, left, box.y + box.height * 0.25)
  await expect.poll(() => blockOrder(page)).toEqual(['Margins', 'First paragraph.', 'image', 'Second paragraph.', 'Third paragraph.'])

  const moved = (await paragraph.boundingBox())!
  await dragImageTo(page, await marginX(page, 'right', '.bn-editor'), moved.y + moved.height * 0.75)
  await expect.poll(() => blockOrder(page)).toEqual(['Margins', 'First paragraph.', 'image', 'Second paragraph.', 'image', 'Third paragraph.'])
  expect(errors.pageErrors).toEqual([])
})

test('an image released over the sidebar, the tab bar or the find bar goes nowhere and raises no affordance', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(([path, content]) => window.__plumoMockVault?.writeNote(path, content), [PATH, CONTENT])
  await openFolderThroughDialog(page, MOCK_FOLDER)
  await page.getByRole('treeitem', { name: 'Margins.md' }).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Margins')
  await page.keyboard.press('Meta+f')
  const findBar = (await page.getByTestId('rich-editor-find-count').boundingBox())!
  const spots = [
    await centreOf(page.getByRole('tree')),
    await centreOf(page.getByRole('tab', { name: /Margins/u })),
    { x: await marginX(page, 'left', '.bn-editor'), y: findBar.y + findBar.height / 2 },
  ]

  for (const { x, y } of spots) {
    await dragImageTo(page, x, y, false)
    await expect(page.getByText('Drop image here')).toBeHidden()
    await dragImageTo(page, x, y)
  }
  await page.waitForTimeout(200)
  expect(await blockOrder(page)).toEqual(['Margins', 'First paragraph.', 'Second paragraph.', 'Third paragraph.'])
})

test('an image released in Raw mode\'s gutter or right of a short line lands beside the line at that height', async ({ page }) => {
  await openMargins(page)
  await page.getByRole('radio', { name: 'Raw' }).click()
  const line = page.locator('.cm-line', { hasText: 'Second paragraph.' })
  const box = (await line.boundingBox())!
  const gutter = (await page.locator('.cm-gutters').boundingBox())!
  const rawText = () => page.evaluate(() => (document.querySelector('[data-testid="raw-editor-codemirror"]') as HTMLElement & { __cmView?: { state: { doc: { toString(): string } } } }).__cmView!.state.doc.toString())

  await dragImageTo(page, gutter.x + gutter.width / 2, box.y + box.height * 0.25, false)
  await expect(page.getByText('Drop image here')).toBeVisible()
  await dragImageTo(page, gutter.x + gutter.width / 2, box.y + box.height * 0.25)
  await expect.poll(rawText).toMatch(/^# Margins\n\nFirst paragraph\.\n\n!\[\]\(data:image\/png;base64,[^)]+\)\n\nSecond paragraph\.\n\nThird/u)

  const moved = (await line.boundingBox())!
  await dragImageTo(page, 1580, moved.y + moved.height * 0.75)
  await expect.poll(rawText).toMatch(/Second paragraph\.\n\n!\[\]\(data:image\/png;base64,[^)]+\)\n\nThird paragraph\.\n$/u)
})

test('a block dragged by its handle out into either margin shows the drop indicator beside the block at that height', async ({ page }) => {
  await openMargins(page)
  const third = page.locator('.bn-editor p', { hasText: 'Third paragraph.' })
  const target = (await page.locator('.bn-editor p', { hasText: 'First paragraph.' }).boundingBox())!
  const thirdBox = (await third.boundingBox())!
  await page.mouse.move(thirdBox.x + 20, thirdBox.y + thirdBox.height / 2, { steps: 4 })
  await page.mouse.move(thirdBox.x + 40, thirdBox.y + thirdBox.height / 2, { steps: 4 })
  const handle = page.locator('[data-test="dragHandle"]').first()
  await expect(handle).toBeVisible()
  const grip = (await handle.boundingBox())!
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  const indicator = page.getByTestId('editor-block-drop-indicator')

  await page.mouse.move(await marginX(page, 'left', '.bn-editor'), target.y + 3, { steps: 6 })
  await expect(indicator).toBeVisible()
  await page.mouse.move(await marginX(page, 'right', '.bn-editor'), target.y + 3, { steps: 6 })
  await expect(indicator).toBeVisible()
  await page.mouse.up()

  await expect.poll(() => blockOrder(page)).toEqual(['Margins', 'Third paragraph.', 'First paragraph.', 'Second paragraph.'])
})

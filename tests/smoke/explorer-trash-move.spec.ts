import { expect, test, type Page } from '@playwright/test'
import { MOCK_FOLDER, typeAtEnd, watchForErrors } from './harness'

// Move to Trash, the drag-and-drop move, and what an external change
// does to an open Tab. What Finder would do is done to the fixture directly
// (`removeFile`, `movePath`, `writeNote`) and then announced the way the
// watcher announces it.

async function openFolder(page: Page) {
  await page.goto('/')
  await expect(page.getByTestId('editor-empty-state')).toBeVisible()
  await page.evaluate((chosen) => window.__plumoMockVault?.queueDialogSelection([chosen]), MOCK_FOLDER)
  await page.keyboard.press('Meta+o')
  await expect(page.getByTestId('explorer-toggle')).toHaveText('Notes')
}

function folderPaths(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__plumoMockVault?.files().map((file) => file.path) ?? [])
}

function noteContent(page: Page, path: string): Promise<string | undefined> {
  return page.evaluate(
    (target) => window.__plumoMockVault?.files().find((file) => file.path === target)?.content,
    path,
  )
}

/** What another app did to the Folder, then what the watcher would have reported. */
type ExternalEdit =
  | { remove: string }
  | { move: [from: string, to: string] }
  | { write: [path: string, content: string] }

async function externalChange(page: Page, edit: ExternalEdit, announced: string[]) {
  await page.evaluate(([change, paths]) => {
    const vault = window.__plumoMockVault
    if (!vault) throw new Error('The Folder fixture is not installed')
    if ('remove' in change) vault.removeFile(change.remove)
    else if ('write' in change) vault.writeNote(change.write[0], change.write[1])
    else vault.movePath(change.move[0], change.move[1])
    vault.emitExternalChange(paths)
  }, [edit, announced] as [ExternalEdit, string[]])
}

async function trashRow(page: Page, path: string) {
  await page.getByTestId(`explorer-row:${path}`).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Move to Trash' }).click()
}

test('Move to Trash takes the Document with no dialog and closes its Tab', async ({ page }) => {
  const errors = watchForErrors(page)
  await openFolder(page)
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')

  await trashRow(page, `${MOCK_FOLDER}/Welcome.md`)

  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Welcome.md`)).toHaveCount(0)
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`)).toHaveCount(0)
  await expect(page.getByRole('dialog')).toHaveCount(0)
  expect(await folderPaths(page)).not.toContain(`${MOCK_FOLDER}/Welcome.md`)
  expect(errors.pageErrors).toEqual([])
  expect(errors.consoleErrors).toEqual([])
})

test('an unsaved edit reaches disk before the Document is trashed', async ({ page }) => {
  await openFolder(page)
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')

  await typeAtEnd(page, ' Trashed with this.')
  await trashRow(page, `${MOCK_FOLDER}/Welcome.md`)

  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Welcome.md`)).toHaveCount(0)
  const written = await page.evaluate(() => window.__plumoMockVault?.calls
    .filter((call) => call.command === 'save_note_content')
    .map((call) => String(call.args?.content ?? '')) ?? [])
  expect(written.at(-1)).toContain('Trashed with this.')
})

test('trashing a folder closes every Tab inside it', async ({ page }) => {
  await openFolder(page)
  await externalChange(page, { write: [`${MOCK_FOLDER}/Projects/Plan.md`, '# Plan\n'] }, [`${MOCK_FOLDER}/Projects/Plan.md`])
  await page.getByTestId('explorer-tree').getByRole('button', { name: 'Projects', exact: true }).getByTestId('explorer-disclosure').click()
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects/Plumo.md`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects/Plan.md`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Plan')

  await trashRow(page, `${MOCK_FOLDER}/Projects`)

  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Projects/Plumo.md`)).toHaveCount(0)
  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Projects/Plan.md`)).toHaveCount(0)
  await expect(page.getByTestId('editor-empty-state')).toBeVisible()
  expect(await folderPaths(page)).not.toContain(`${MOCK_FOLDER}/Projects`)
})

test('dragging a Document onto a folder moves it, and its Tab follows without a reload', async ({ page }) => {
  await openFolder(page)
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')

  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`)
    .dragTo(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects`))

  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Projects/Welcome.md`)).toBeVisible()
  await expect(page.getByRole('tab', { selected: true })).toHaveAttribute('data-testid', `tab:${MOCK_FOLDER}/Projects/Welcome.md`)
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')
  expect(await folderPaths(page)).toContain(`${MOCK_FOLDER}/Projects/Welcome.md`)

  // The row re-sorted into the folder, which the active Tab keeps revealed,
  // and it is still the selected row.
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects/Welcome.md`))
    .toHaveAttribute('data-active')
})

test("dragging a Document onto the Folder's name moves it to the top level", async ({ page }) => {
  await openFolder(page)
  await page.getByTestId('explorer-tree').getByRole('button', { name: 'Projects', exact: true }).getByTestId('explorer-disclosure').click()

  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects/Plumo.md`)
    .dragTo(page.getByTestId('explorer-header'))

  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Plumo.md`)).toBeVisible()
  const paths = await folderPaths(page)
  expect(paths).toContain(`${MOCK_FOLDER}/Plumo.md`)
  expect(paths).not.toContain(`${MOCK_FOLDER}/Projects/Plumo.md`)
})

test('a name the folder already holds refuses the move and says so', async ({ page }) => {
  await openFolder(page)
  await externalChange(
    page,
    { write: [`${MOCK_FOLDER}/Projects/Welcome.md`, '# Another Welcome\n'] },
    [`${MOCK_FOLDER}/Projects/Welcome.md`],
  )
  await page.getByTestId('explorer-tree').getByRole('button', { name: 'Projects', exact: true }).getByTestId('explorer-disclosure').click()
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects/Welcome.md`)).toBeVisible()

  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`)
    .dragTo(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects`))

  await expect(page.locator('[data-sonner-toast]')).toHaveText('Projects already has Welcome.md')
  const paths = await folderPaths(page)
  expect(paths).toContain(`${MOCK_FOLDER}/Welcome.md`)
  expect(paths).toContain(`${MOCK_FOLDER}/Projects/Welcome.md`)
  expect(await noteContent(page, `${MOCK_FOLDER}/Projects/Welcome.md`)).toBe('# Another Welcome\n')
})

test('deleting the open Document in Finder closes its Tab and no Autosave brings it back', async ({ page }) => {
  await openFolder(page)
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')
  await typeAtEnd(page, ' An edit still in the buffer.')

  await externalChange(page, { remove: `${MOCK_FOLDER}/Welcome.md` }, [`${MOCK_FOLDER}/Welcome.md`])

  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Welcome.md`)).toHaveCount(0)
  // Well past the Autosave idle wait: the file must not reappear.
  await page.waitForTimeout(2_500)
  expect(await folderPaths(page)).not.toContain(`${MOCK_FOLDER}/Welcome.md`)
})

test('moving the open Document in Finder retargets its Tab, renaming it closes the Tab', async ({ page }) => {
  await openFolder(page)
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Welcome.md`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Welcome')

  await externalChange(
    page,
    { move: [`${MOCK_FOLDER}/Welcome.md`, `${MOCK_FOLDER}/Projects/Welcome.md`] },
    [`${MOCK_FOLDER}/Welcome.md`, `${MOCK_FOLDER}/Projects/Welcome.md`],
  )

  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Projects/Welcome.md`)).toBeVisible()
  await expect(page.getByRole('tab', { selected: true })).toHaveAttribute('data-testid', `tab:${MOCK_FOLDER}/Projects/Welcome.md`)

  await externalChange(
    page,
    { move: [`${MOCK_FOLDER}/Projects/Welcome.md`, `${MOCK_FOLDER}/Projects/Greetings.md`] },
    [`${MOCK_FOLDER}/Projects/Welcome.md`, `${MOCK_FOLDER}/Projects/Greetings.md`],
  )

  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Projects/Greetings.md`)).toHaveCount(0)
  await expect(page.getByTestId('editor-empty-state')).toBeVisible()
  // The new name is a fresh file in the tree, with no Tab of its own.
  await expect(page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects/Greetings.md`)).toBeVisible()
})

test('renaming a folder in Finder retargets every Tab under it', async ({ page }) => {
  await openFolder(page)
  await externalChange(page, { write: [`${MOCK_FOLDER}/Projects/Plan.md`, '# Plan\n'] }, [`${MOCK_FOLDER}/Projects/Plan.md`])
  await page.getByTestId('explorer-tree').getByRole('button', { name: 'Projects', exact: true }).getByTestId('explorer-disclosure').click()
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects/Plumo.md`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Plumo')
  await page.getByTestId(`explorer-row:${MOCK_FOLDER}/Projects/Plan.md`).click()
  await expect(page.locator('.bn-editor h1')).toHaveText('Plan')

  await externalChange(
    page,
    { move: [`${MOCK_FOLDER}/Projects`, `${MOCK_FOLDER}/Work`] },
    [`${MOCK_FOLDER}/Projects`, `${MOCK_FOLDER}/Work`],
  )

  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Work/Plumo.md`)).toBeVisible()
  await expect(page.getByTestId(`tab:${MOCK_FOLDER}/Work/Plan.md`)).toBeVisible()
  await expect(page.getByRole('tab', { selected: true })).toHaveAttribute('data-testid', `tab:${MOCK_FOLDER}/Work/Plan.md`)
  await expect(page.locator('.bn-editor h1')).toHaveText('Plan')
})

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { BlockNoteEditor } from '@blocknote/core'
import { BlockNoteViewRaw } from '@blocknote/react'
import { IconContext, type IconProps } from '@phosphor-icons/react'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/ui/tooltip'
import { schema } from './editor-schema'
import { TableExtendButton } from './table-extend-button'

// The pnpm patch on @blocknote/core swaps its placeholder glyphs for Phosphor
// (AIM-512); a BlockNote bump re-derives it, and this guards the result.
// Every other icon over or inside a Document is Plumo's own control, drawn
// with Phosphor: BlockNote's react-icons components are no longer rendered.

const require = createRequire(import.meta.url)
const packageDist = (name: string) => dirname(require.resolve(name))

const ICON_DEFAULTS = { 'data-icon-stroke': '' } as IconProps

function expectPhosphorIcon(svg: SVGElement | null | undefined) {
  expect(svg).toBeTruthy()
  expect(svg?.getAttribute('viewBox')).toBe('0 0 256 256')
  expect(svg?.hasAttribute('data-icon-stroke')).toBe(true)
}

afterEach(cleanup)

describe('BlockNote icons', () => {
  it('draws every @blocknote/core placeholder icon as a Phosphor glyph', () => {
    const coreDist = packageDist('@blocknote/core')
    const svgs = readdirSync(coreDist)
      .filter((file) => file.endsWith('.js'))
      .flatMap((file) => readFileSync(join(coreDist, file), 'utf8').match(/<svg[^']*<\/svg>/g) ?? [])

    expect(svgs.length).toBeGreaterThan(0)
    for (const svg of svgs) {
      expect(svg).toContain('viewBox="0 0 256 256"')
      expect(svg).toContain('data-icon-stroke=""')
    }
  })

  it('draws the controls in the editor as Phosphor icons that take the app icon line', async () => {
    const editor = BlockNoteEditor.create({
      schema,
      initialContent: [
        { type: 'audio' },
        { type: 'image' },
        { type: 'file', props: { name: 'notes.pdf', url: 'notes.pdf' } },
        { type: 'paragraph', content: 'Text' },
      ],
    })

    const { container } = render(
      <IconContext.Provider value={ICON_DEFAULTS}>
        <TooltipProvider>
          <BlockNoteViewRaw
            editor={editor}
            emojiPicker={false}
            formattingToolbar={false}
            linkToolbar={false}
            slashMenu={false}
            sideMenu={false}
            filePanel={false}
            tableHandles={false}
          >
            <div data-testid="extend-button">
              <TableExtendButton orientation="addOrRemoveRows" hideOtherElements={() => {}} />
            </div>
          </BlockNoteViewRaw>
        </TooltipProvider>
      </IconContext.Provider>,
    )

    const extendButton = container.querySelector<HTMLElement>('[data-testid="extend-button"] button')
    expectPhosphorIcon(extendButton?.querySelector('svg'))
    // At rest the Table's add-row bar is the muted strip, not the darker
    // fill it wears while a drag adds rows.
    expect(extendButton).not.toHaveAttribute('data-selected')
    expect(extendButton).toHaveAttribute('data-variant', 'placeholder')

    // The file Blocks' own icons (the empty slot, a file's line) are Plumo's
    // (add-file-button.tsx, media-blocks.tsx), drawn with Phosphor too.
    await waitFor(() => {
      expect(container.querySelector('[data-content-type="audio"] [data-add-file-button] svg')).toBeTruthy()
    })
    expectPhosphorIcon(container.querySelector('[data-content-type="audio"] [data-add-file-button] svg'))
    expectPhosphorIcon(container.querySelector('[data-content-type="image"] [data-add-file-button] svg'))
    expectPhosphorIcon(container.querySelector('[data-content-type="file"] [data-file-block-frame] svg'))
  })
})

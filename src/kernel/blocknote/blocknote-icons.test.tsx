import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { BlockNoteEditor } from '@blocknote/core'
import { DeleteLinkButton, EditLinkMenuItems, ExtendButton } from '@blocknote/react'
import { BlockNoteView } from '@blocknote/shadcn'
import { IconContext, type IconProps } from '@phosphor-icons/react'
import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/ui/tooltip'
import { schema } from './editor-schema'
import { blockNoteShadCNComponents } from './shadcn-components'

// The pnpm patches on @blocknote/react, core and shadcn swap BlockNote's own
// react-icons glyphs for Phosphor and its `text-gray-400` for the icon button
// (AIM-512). A BlockNote bump re-derives those patches; this guards the result.

const require = createRequire(import.meta.url)
const packageDist = (name: string) => dirname(require.resolve(name))

// Every react-icons glyph BlockNote draws in Plumo, by the file that draws it.
const RENDERED_REACT_ICONS = {
  ri: [
    'RiIndentIncrease', // NestBlockButton
    'RiIndentDecrease', // UnnestBlockButton
    'RiLink', // CreateLinkButton, EditLinkMenuItems
    'RiText', // EditLinkMenuItems
    'RiMergeCellsHorizontal', // TableCellMergeButton
    'RiMergeCellsVertical', // TableCellMergeButton
    'RiInputField', // FileCaptionButton
    'RiImageEditFill', // FileReplaceButton
    'RiFontFamily', // FileRenameButton
    'RiDeleteBin7Line', // FileDeleteButton
    'RiImageAddFill', // FilePreviewButton
    'RiLinkUnlink', // DeleteLinkButton
    'RiAddFill', // ExtendButton
    'RiFile2Line', // AddFileButton, FileNameWithIcon
    'RiVolumeUpFill', // AudioBlock
    'RiVideoFill', // VideoBlock
  ],
  md: [
    'MdDragIndicator', // TableHandle
    'MdArrowDropDown', // TableCellButton
  ],
}

const ICON_DEFAULTS = { 'data-icon-stroke': '' } as IconProps

function glyphPaths(sourceMap: { sources: string[]; sourcesContent: string[] }, set: string, name: string) {
  const source = sourceMap.sourcesContent[sourceMap.sources.findIndex((path) => path.endsWith(`react-icons/${set}/index.mjs`))]
  const start = source.indexOf(`export function ${name} (`)
  const body = source.slice(start, source.indexOf('};', start))
  return [...body.matchAll(/"d":"([^"]+)"/g)].map((match) => match[1]).filter((d) => !d.startsWith('M0 0h24v24H0'))
}

function expectPhosphorIcon(svg: SVGElement | null | undefined) {
  expect(svg).toBeTruthy()
  expect(svg?.getAttribute('viewBox')).toBe('0 0 256 256')
  expect(svg?.hasAttribute('data-icon-stroke')).toBe(true)
}

afterEach(cleanup)

describe('BlockNote icons', () => {
  it('leaves none of the rendered react-icons glyphs in the @blocknote/react dist', () => {
    const distFile = join(packageDist('@blocknote/react'), 'blocknote-react.js')
    const dist = readFileSync(distFile, 'utf8')
    const sourceMap = JSON.parse(readFileSync(`${distFile}.map`, 'utf8'))

    const leftover = Object.entries(RENDERED_REACT_ICONS).flatMap(([set, names]) =>
      names.filter((name) => {
        const paths = glyphPaths(sourceMap, set, name)
        expect(paths.length, name).toBeGreaterThan(0)
        return paths.some((d) => dist.includes(`d: "${d}"`))
      }),
    )

    expect(leftover).toEqual([])
    expect(dist).toContain('from "@phosphor-icons/react"')
  })

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

  it('leaves no text-gray-400 on the @blocknote/shadcn buttons', () => {
    const dist = readFileSync(join(packageDist('@blocknote/shadcn'), 'blocknote-shadcn.js'), 'utf8')
    expect(dist).not.toContain('text-gray-400')
  })

  it('renders the patched glyphs as Phosphor icons that take the app icon line', async () => {
    const editor = BlockNoteEditor.create({
      schema,
      initialContent: [
        { type: 'audio' },
        { type: 'image' },
        { type: 'file', props: { name: 'notes.pdf', url: 'notes.pdf' } },
        { type: 'paragraph', content: 'Text' },
      ],
    })
    const range = { from: 1, to: 1 }

    const { container } = render(
      <IconContext.Provider value={ICON_DEFAULTS}>
        <TooltipProvider>
          <BlockNoteView
            editor={editor}
            shadCNComponents={blockNoteShadCNComponents}
            emojiPicker={false}
            formattingToolbar={false}
            linkToolbar={false}
            slashMenu={false}
            sideMenu={false}
            filePanel={false}
            tableHandles={false}
          >
            <div data-testid="extend-button">
              <ExtendButton orientation="addOrRemoveRows" hideOtherElements={() => {}} />
            </div>
            <div data-testid="delete-link">
              <DeleteLinkButton range={range} />
            </div>
            <div data-testid="edit-link">
              <EditLinkMenuItems url="https://example.com" text="Example" range={range} />
            </div>
          </BlockNoteView>
        </TooltipProvider>
      </IconContext.Provider>,
    )

    const extendButton = container.querySelector('[data-testid="extend-button"] button')
    expectPhosphorIcon(extendButton?.querySelector('svg'))
    // At rest the extend button is the tertiary icon button, not the accent
    // it wears while a drag adds rows (upstream marked it editing always).
    expect(extendButton?.classList).not.toContain('bn-extend-button-editing')
    expect(extendButton?.classList).toContain('text-text-tertiary')
    expect(extendButton?.className).not.toContain('text-gray-400')
    expectPhosphorIcon(container.querySelector('[data-testid="delete-link"] svg'))
    const editLinkIcons = container.querySelectorAll<SVGElement>('[data-testid="edit-link"] svg')
    expect(editLinkIcons).toHaveLength(2)
    editLinkIcons.forEach(expectPhosphorIcon)

    await waitFor(() => {
      expect(container.querySelector('[data-content-type="audio"] .bn-add-file-button-icon svg')).toBeTruthy()
    })
    expectPhosphorIcon(container.querySelector('[data-content-type="audio"] .bn-add-file-button-icon svg'))
    expectPhosphorIcon(container.querySelector('[data-content-type="image"] .bn-add-file-button-icon svg'))
    expectPhosphorIcon(container.querySelector('[data-content-type="file"] .bn-file-icon svg'))
  })
})

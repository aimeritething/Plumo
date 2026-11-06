import { BlockNoteEditor } from '@blocknote/core'
import { describe, expect, it } from 'vitest'
import { schema } from '@/kernel/blocknote/editor-schema'
import { tryParseFastMarkdownBlocks } from '@/kernel/resolve/editor-fast-markdown-blocks'
import { blocksToMarkdownDirect } from './block-note-direct-markdown'
import { injectImageBlocks, readImageAlt } from './image-markdown'
import { injectRichEditorMarkdownBlocks, preProcessRichEditorMarkdown } from './rich-editor-markdown'

type ImageBlock = { type: string; props: Record<string, unknown>; children?: unknown[] }

async function parseFull(markdown: string): Promise<unknown[]> {
  const editor = BlockNoteEditor.create({ schema })
  const parsed = await editor.tryParseMarkdownToBlocks(preProcessRichEditorMarkdown(markdown))
  return injectRichEditorMarkdownBlocks(parsed)
}

function parseFast(markdown: string): unknown[] {
  const result = tryParseFastMarkdownBlocks(preProcessRichEditorMarkdown(markdown))
  expect(result.supported).toBe(true)
  return injectRichEditorMarkdownBlocks(result.blocks)
}

function write(blocks: unknown[]): string {
  return blocksToMarkdownDirect(blocks).markdown
}

const parsers = [
  ['the full parse', parseFull],
  ['the fast path', parseFast],
] as const

describe('Image block width and caption in the Markdown image', () => {
  it('writes the width after the alt text as whole pixels and the caption as the title', () => {
    expect(write([{
      type: 'image',
      props: { name: 'shot', url: 'attachments/shot.png', previewWidth: 400.4, caption: 'A "quoted" \\ caption' },
      children: [],
    }])).toBe('![shot|400](attachments/shot.png "A \\"quoted\\" \\\\ caption")')
  })

  it('writes neither when the block has no width and no caption', () => {
    expect(write([{
      type: 'image',
      props: { name: 'shot', url: 'attachments/shot.png', caption: '' },
      children: [],
    }])).toBe('![shot](attachments/shot.png)')
  })

  it('keeps a caption on the image line', () => {
    expect(write([{
      type: 'image',
      props: { name: '', url: 'a.png', caption: 'first\nsecond' },
      children: [],
    }])).toBe('![](a.png "first second")')
  })

  it('reads `|400` and `|400x300` as a width of 400', () => {
    expect(readImageAlt('shot|400')).toEqual({ name: 'shot', width: 400 })
    expect(readImageAlt('shot|400x300')).toEqual({ name: 'shot', width: 400 })
    expect(readImageAlt('|640')).toEqual({ name: '', width: 640 })
    expect(readImageAlt('shot|0')).toEqual({ name: 'shot|0' })
    expect(readImageAlt('shot|wide')).toEqual({ name: 'shot|wide' })
  })

  describe.each(parsers)('through %s', (_label, parse) => {
    it('reads the width and caption into the Image block', async () => {
      const [image] = await parse('![shot|400x300](./attachments/shot.png "Hello \\"there\\"")') as ImageBlock[]

      expect(image.type).toBe('image')
      expect(image.props).toMatchObject({
        name: 'shot',
        url: './attachments/shot.png',
        previewWidth: 400,
        caption: 'Hello "there"',
      })
    })

    it('round-trips a width and a caption byte-for-byte', async () => {
      const markdown = [
        '# Title',
        '',
        '![shot|400](./attachments/shot.png "A caption")',
        '',
        '![wide|1200](<./attachments/my shot.png>)',
        '',
        '![](./attachments/plain.png "Only a caption")',
      ].join('\n')

      expect(write(await parse(markdown))).toBe(markdown)
    })

    it('round-trips a Document whose images carry neither byte-for-byte', async () => {
      const markdown = '# Title\n\n![shot](./attachments/shot.png)\n\nText after.'
      const blocks = await parse(markdown) as ImageBlock[]

      expect(blocks[1]?.props.previewWidth).toBeUndefined()
      expect(write(blocks)).toBe(markdown)
    })
  })

  it('reads an image nested under a list item', async () => {
    const markdown = '- item\n\n  ![shot|320](./attachments/shot.png "Nested")'
    const [item] = await parseFull(markdown) as ImageBlock[]

    expect(item.children?.[0]).toMatchObject({
      type: 'image',
      props: { name: 'shot', previewWidth: 320, caption: 'Nested' },
    })
    expect(write([item])).toBe(markdown)
  })

  it('leaves an image inside a code fence as code', async () => {
    const markdown = '```md\n![shot|400](a.png "caption")\n```'

    expect(write(await parseFull(markdown))).toBe(markdown)
  })

  it('drops the width BlockNote reads off a parsed picture', () => {
    const block = { type: 'image', props: { url: 'a.png', previewWidth: 16 }, children: [] }

    expect(injectImageBlocks([block])).toEqual([
      { type: 'image', props: { url: 'a.png', previewWidth: undefined }, children: [] },
    ])
  })
})

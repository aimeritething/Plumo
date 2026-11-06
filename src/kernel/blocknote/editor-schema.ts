import {
  BlockNoteSchema,
  createCodeBlockSpec,
  createStyleSpec,
  defaultInlineContentSpecs,
} from '@blocknote/core'
import { MARKDOWN_HIGHLIGHT_STYLE } from '@/kernel/markdown/markdown-highlight-markdown'
import { CalloutBlockSpec } from './callout-block'
import { createCodeBlockOptions } from './code-block-options'
import { HtmlBlockSpec } from './html-block'
import { ImageBlockSpec } from './image-block'
import { MathBlockSpec, MathInlineSpec } from './math-block'
import { AudioBlockSpec, FileBlockSpec, VideoBlockSpec } from './media-blocks'
import { MermaidBlockSpec } from './mermaid-block'
import { TldrawBlockSpec } from './tldraw-block'
import { WikiLinkInlineSpec } from './wikilink-inline'

// The schema only assembles: each block's config, view and parse live in its
// own <name>-block.tsx. The one spec defined here is the highlight style, a
// ProseMirror mark whose class blocknote.css dresses.

function markdownHighlightElement(): { dom: HTMLElement; contentDOM: HTMLElement } {
  const mark = document.createElement('mark')
  mark.className = 'markdown-highlight'
  return { dom: mark, contentDOM: mark }
}

const MarkdownHighlightStyle = createStyleSpec(
  {
    type: MARKDOWN_HIGHLIGHT_STYLE,
    propSchema: 'boolean',
  },
  {
    render: markdownHighlightElement,
    toExternalHTML: markdownHighlightElement,
    parse: element => element.tagName === 'MARK' ? true : undefined,
  },
)

export const schema = BlockNoteSchema.create({
  inlineContentSpecs: {
    ...defaultInlineContentSpecs,
    wikilink: WikiLinkInlineSpec,
    mathInline: MathInlineSpec,
  },
}).extend({
  styleSpecs: {
    [MARKDOWN_HIGHLIGHT_STYLE]: MarkdownHighlightStyle,
  },
  blockSpecs: {
    audio: AudioBlockSpec(),
    calloutBlock: CalloutBlockSpec(),
    file: FileBlockSpec(),
    htmlBlock: HtmlBlockSpec(),
    image: ImageBlockSpec(),
    mathBlock: MathBlockSpec(),
    mermaidBlock: MermaidBlockSpec(),
    tldrawBlock: TldrawBlockSpec(),
    codeBlock: createCodeBlockSpec(createCodeBlockOptions()),
    video: VideoBlockSpec(),
  },
})

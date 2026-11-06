import { lineEnding, lineText } from './durable-markdown-blocks'
import { advanceMarkdownFence, type MarkdownFence } from './markdown-fences'

/**
 * An Image block's width and caption live in its Markdown image (ADR 0011):
 * `![alt|400](url "caption")`. BlockNote's parser keeps neither, so a
 * standalone image that carries one reaches it as a token paragraph, which
 * `injectImageBlocks` turns back into the Image block.
 */

interface ImagePayload {
  caption?: string
  name: string
  url: string
  width?: number
}

interface ImageAlt {
  name: string
  width?: number
}

interface BlockLike {
  type?: string
  content?: unknown
  props?: Record<string, unknown>
  children?: unknown
  [key: string]: unknown
}

const IMAGE_TOKEN_PREFIX = '@@PLUMO_IMAGE:'
const IMAGE_TOKEN_SUFFIX = '@@'
const STANDALONE_IMAGE_PATTERN = /^([ \t]*)!\[((?:\\.|[^\]\\\n])*)\]\((<[^>\n]+>|(?:\\.|[^)\s\n])+)(?:[ \t]+"((?:\\.|[^"\\\n])*)")?\)[ \t]*$/u
const ALT_WIDTH_PATTERN = /^([\s\S]*)\|(\d+)(?:x\d+)?$/u
const BACKSLASH_ESCAPE_PATTERN = /\\([!-/:-@[-`{-~])/gu
const MARKDOWN_ACTIVE_URI_CHARACTERS = /[!'()*_~]/gu

export function unescapeMarkdownText(text: string): string {
  return text.replace(BACKSLASH_ESCAPE_PATTERN, '$1')
}

/** `alt|400` and `alt|400x300` both give a width of 400; the height is not kept. */
export function readImageAlt(alt: string): ImageAlt {
  const match = ALT_WIDTH_PATTERN.exec(alt)
  const width = match ? Number(match[2]) : 0
  return match && width > 0 ? { name: match[1], width } : { name: alt }
}

export function imageWidthMarkdown(previewWidth: unknown): string {
  if (typeof previewWidth !== 'number' || !Number.isFinite(previewWidth)) return ''
  const width = Math.round(previewWidth)
  return width > 0 ? `|${width}` : ''
}

/** Escaped as a file Attachment's caption is; a caption stays on the image's line. */
export function imageTitleMarkdown(caption: unknown): string {
  if (typeof caption !== 'string') return ''
  const text = caption.replace(/\s*[\r\n]+\s*/gu, ' ').trim()
  return text ? ` "${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : ''
}

function unescapeDestination(destination: string): string {
  return destination.startsWith('<') && destination.endsWith('>')
    ? destination.slice(1, -1)
    : destination.replace(/\\([\\()<>])/gu, '$1')
}

function readStandaloneImage(text: string): { indent: string; payload: ImagePayload } | null {
  const match = STANDALONE_IMAGE_PATTERN.exec(text)
  if (!match) return null

  const alt = readImageAlt(unescapeMarkdownText(match[2] ?? ''))
  const caption = match[4] === undefined ? '' : unescapeMarkdownText(match[4])
  if (alt.width === undefined && !caption) return null

  return {
    indent: match[1] ?? '',
    payload: {
      name: alt.name,
      url: unescapeDestination(match[3] ?? ''),
      ...(alt.width === undefined ? {} : { width: alt.width }),
      ...(caption ? { caption } : {}),
    },
  }
}

function imageToken(payload: ImagePayload): string {
  const encoded = encodeURIComponent(JSON.stringify(payload)).replace(
    MARKDOWN_ACTIVE_URI_CHARACTERS,
    character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `${IMAGE_TOKEN_PREFIX}${encoded}${IMAGE_TOKEN_SUFFIX}`
}

function preProcessLine(line: string): string {
  const image = readStandaloneImage(lineText({ line }))
  return image ? `${image.indent}${imageToken(image.payload)}${lineEnding({ line })}` : line
}

export function preProcessImageMarkdown(markdown: string): string {
  if (!markdown.includes('![')) return markdown

  let fence: MarkdownFence | null = null
  return (markdown.match(/[^\n]*(?:\n|$)/gu) ?? []).map((line) => {
    const nextFence = advanceMarkdownFence(lineText({ line }), fence)
    const insideFence = fence !== null || nextFence !== null
    fence = nextFence
    return insideFence ? line : preProcessLine(line)
  }).join('')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPayload(value: unknown): ImagePayload | null {
  if (!isRecord(value) || typeof value.url !== 'string' || !value.url) return null
  return {
    name: typeof value.name === 'string' ? value.name : '',
    url: value.url,
    ...(typeof value.width === 'number' && value.width > 0 ? { width: value.width } : {}),
    ...(typeof value.caption === 'string' && value.caption ? { caption: value.caption } : {}),
  }
}

function readImageToken(block: BlockLike): ImagePayload | null {
  if (block.type !== 'paragraph' || !Array.isArray(block.content) || block.content.length !== 1) return null

  const [item] = block.content as unknown[]
  if (!isRecord(item) || item.type !== 'text' || typeof item.text !== 'string') return null

  const text = item.text.trim()
  if (!text.startsWith(IMAGE_TOKEN_PREFIX) || !text.endsWith(IMAGE_TOKEN_SUFFIX)) return null
  try {
    return readPayload(JSON.parse(decodeURIComponent(
      text.slice(IMAGE_TOKEN_PREFIX.length, -IMAGE_TOKEN_SUFFIX.length),
    )))
  } catch {
    return null
  }
}

function imageBlockFromToken(block: BlockLike, payload: ImagePayload, children: unknown): BlockLike {
  return {
    ...block,
    type: 'image',
    props: {
      backgroundColor: block.props?.backgroundColor ?? 'default',
      textAlignment: block.props?.textAlignment ?? 'left',
      name: payload.name,
      url: payload.url,
      caption: payload.caption ?? '',
      showPreview: true,
      previewWidth: payload.width,
    },
    content: undefined,
    children: Array.isArray(children) ? children : [],
  }
}

/**
 * The width BlockNote reads off a parsed `<img>` is the picture's own size (or
 * a broken image's icon), never the Document's, so it is dropped.
 */
function withoutParsedWidth(block: BlockLike): BlockLike {
  return block.type === 'image' && block.props?.previewWidth !== undefined
    ? { ...block, props: { ...block.props, previewWidth: undefined } }
    : block
}

function injectImageBlock(value: unknown): unknown {
  if (!isRecord(value)) return value
  const block = value as BlockLike

  const children = Array.isArray(block.children) ? injectImageBlocks(block.children) : block.children
  const payload = readImageToken(block)
  if (payload) return imageBlockFromToken(block, payload, children)

  const injected = withoutParsedWidth(block)
  if (children === block.children) return injected
  return { ...injected, children }
}

export function injectImageBlocks(blocks: unknown[]): unknown[] {
  let changed = false
  const injected = blocks.map((block) => {
    const next = injectImageBlock(block)
    changed ||= next !== block
    return next
  })
  return changed ? injected : blocks
}

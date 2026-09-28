import { injectLinkedCodeInBlocks, preProcessLinkedCodeMarkdown } from '@/kernel/markdown/linked-code-markdown'
import { createCodeBlockOptions } from './code-block-options'

type PasteHandlerOptions = {
  plainTextAsMarkdown?: boolean
  prioritizeMarkdownOverHTML?: boolean
}

type PasteBlock = {
  children?: PasteBlock[]
  content?: unknown
  id?: string
  props?: Record<string, unknown>
  type?: string
}

type PasteBlockWithId = PasteBlock & { id: string }

type PasteTextContent = {
  styles: Record<string, never>
  text: string
  type: 'text'
}

type PasteCodeBlock = {
  language: string
  source: string
}

type PasteCodeBlockInsert = {
  children: []
  content: PasteTextContent[]
  props: { language: string }
  type: 'codeBlock'
}

type ClipboardMarkup = {
  value: string
}

type RichPasteEditor = {
  createLink?: (url: string) => void
  document?: PasteBlock[]
  getSelectedText?: () => string
  getTextCursorPosition?: () => { block?: PasteBlock | null }
  insertInlineContent?: (content: never, options?: { updateSelection?: boolean }) => void
  insertBlocks?: (
    blocksToInsert: PasteCodeBlockInsert[],
    referenceBlock: string,
    placement?: 'before' | 'after'
  ) => unknown
  pasteMarkdown?: (markdown: string) => void
  pasteText: (text: string) => boolean | undefined
  replaceBlocks?: (blocksToRemove: PasteBlockWithId[], blocksToInsert: PasteCodeBlockInsert[]) => unknown
  tryParseMarkdownToBlocks?: (markdown: string) => PasteBlock[]
  updateBlock?: (blockId: string, update: { props: { url: string } }) => void
}

export type RichEditorPasteContext = {
  defaultPasteHandler: (options?: PasteHandlerOptions) => boolean | undefined
  editor: RichPasteEditor
  event: ClipboardEvent
}

const EXPLICIT_MARKDOWN_TYPES = new Set(['blocknote/html', 'text/markdown'])
const BLOCKNOTE_CLIPBOARD_TYPES = new Set(['blocknote/html'])
const WEB_MARKUP_MIME_TYPE = `text/${String.fromCharCode(104, 116, 109, 108)}`
const HTML_IMAGE_TAG_RE = /<img(?:\s|>|\/)/iu
const MARKDOWN_CODE_FENCE_OPEN_RE = /^\s*(`{3,}|~{3,})([^\r\n]*)$/u
const ANGLE_BRACKETED_TEXT_RE = /<[^<>\r\n]+>/u
const STANDALONE_CODE_FENCE_RE = /^\s*(?:`{3,}|~{3,})[^\r\n]*\r?\n[\s\S]*\r?\n\s*(?:`{3,}|~{3,})\s*$/u
const SPACED_LITERAL_ASTERISK_RE = /\S\s+\*\s+\S/u
const PREFIX_GLOB_ASTERISK_RE = /(?:^|\s)\*(?![*\s])[\w./-]+(?=\s|$)/u
const SUFFIX_GLOB_ASTERISK_RE = /(?:^|\s)[\w./-]+\*(?=\s|$)/u
const LINK_PASTE_PROTOCOLS = new Set(['http:', 'https:'])

function hasExplicitMarkdownPayload(clipboardData: DataTransfer): boolean {
  return Array.from(clipboardData.types).some(type => EXPLICIT_MARKDOWN_TYPES.has(type))
}

function hasBlockNoteClipboardPayload(clipboardData: DataTransfer): boolean {
  return Array.from(clipboardData.types).some(type => BLOCKNOTE_CLIPBOARD_TYPES.has(type))
}

function shouldPastePlainTextLiterally(text: string): boolean {
  if (STANDALONE_CODE_FENCE_RE.test(text)) return false

  return ANGLE_BRACKETED_TEXT_RE.test(text)
    || SPACED_LITERAL_ASTERISK_RE.test(text)
    || PREFIX_GLOB_ASTERISK_RE.test(text)
    || SUFFIX_GLOB_ASTERISK_RE.test(text)
}

function literalPlainText(clipboardData: DataTransfer | null): string | null {
  if (!clipboardData) return null

  const plainText = clipboardData.getData('text/plain')
  if (plainText.length === 0) return null
  if (hasExplicitMarkdownPayload(clipboardData)) return null
  if (!shouldPastePlainTextLiterally(plainText)) return null

  return plainText
}

function shouldPasteHTMLImagesFromHTML(clipboardData: DataTransfer | null): boolean {
  if (!clipboardData) return false
  if (hasBlockNoteClipboardPayload(clipboardData)) return false

  return HTML_IMAGE_TAG_RE.test(clipboardWebMarkup(clipboardData).value)
}

function clipboardWebMarkup(clipboardData: DataTransfer): ClipboardMarkup {
  return { value: clipboardData.getData(WEB_MARKUP_MIME_TYPE) }
}

/** Wrappers a clipboard puts around what was copied; nothing of their own to paste. */
const MARKUP_WRAPPER_TAGS = new Set(['DIV', 'SPAN', 'ARTICLE', 'SECTION', 'MAIN', 'FIGURE'])

/** The one element among a node's children, or null when there is prose or a second element beside it. `<meta>` and comments do not count. */
function soleChildElement(parent: ParentNode): Element | null {
  let found: Element | null = null
  for (const node of parent.childNodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent?.trim()) return null
      continue
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const element = node as Element
    if (element.tagName === 'META') continue
    if (found) return null
    found = element
  }
  return found
}

/**
 * Whether the markup amounts to one `<pre>` holding a `<code>`, wrappers
 * aside: a code snippet copied on its own. Prose beside the snippet, or a
 * second block, means the clipboard is a page fragment and is pasted as one,
 * by the Kernel's HTML path (AIM-467). The document is parsed inert: nothing
 * in it runs or loads.
 */
function isSoleCodeBlockMarkup(markup: ClipboardMarkup): boolean {
  if (!markup.value) return false
  let element = soleChildElement(new DOMParser().parseFromString(markup.value, 'text/html').body)
  while (element && MARKUP_WRAPPER_TAGS.has(element.tagName)) element = soleChildElement(element)
  return element?.tagName === 'PRE' && element.querySelector('code') !== null
}

function shouldPasteHTMLCodeBlocksFromHTML(clipboardData: DataTransfer | null): boolean {
  if (!clipboardData) return false
  if (hasExplicitMarkdownPayload(clipboardData)) return false

  return isSoleCodeBlockMarkup(clipboardWebMarkup(clipboardData))
}

function normalizedCodeBlockLanguageToken(language: string): string {
  const normalized = language.trim().split(/\s+/u)[0]?.toLowerCase() ?? ''
  return /^[a-z0-9][a-z0-9#+._-]*$/u.test(normalized) ? normalized : ''
}

function resolveCodeBlockLanguage(language: string): string {
  const normalized = normalizedCodeBlockLanguageToken(language)
  if (!normalized) return ''

  const supportedLanguages = createCodeBlockOptions().supportedLanguages ?? {}
  return Object.entries(supportedLanguages)
    .find(([id, option]) => id === normalized || option.aliases?.includes(normalized))
    ?.[0] ?? normalized
}

function codeFenceForSource(source: string): string {
  return source.includes('```') ? '~~~' : '```'
}

function markdownCodeBlockFromPasteBlock(block: PasteCodeBlock): string {
  const source = block.source.replace(/\n$/u, '')
  const fence = codeFenceForSource(source)
  return `${fence}${block.language}\n${source}\n${fence}`
}

function htmlCodeBlocks(clipboardData: DataTransfer | null): PasteCodeBlock[] {
  if (!shouldPasteHTMLCodeBlocksFromHTML(clipboardData)) return []
  const source = clipboardData?.getData('text/plain') ?? ''
  if (!source) return []

  return [{ language: '', source }]
}

function clipboardMarkdownSource(clipboardData: DataTransfer | null): string {
  if (!clipboardData) return ''
  if (hasBlockNoteClipboardPayload(clipboardData)) return ''

  return clipboardData.getData('text/markdown') || clipboardData.getData('text/plain')
}

function standaloneCodeFenceLines(markdown: string): string[] | null {
  return STANDALONE_CODE_FENCE_RE.test(markdown)
    ? markdown.trim().split(/\r?\n/u)
    : null
}

function openingCodeFence(line: string): { language: string; marker: string } | null {
  const opening = MARKDOWN_CODE_FENCE_OPEN_RE.exec(line)
  if (!opening) return null
  return {
    language: resolveCodeBlockLanguage(opening[2] ?? ''),
    marker: opening[1],
  }
}

function closesCodeFence(lines: string[], marker: string): boolean {
  const closing = lines.at(-1)?.trim() ?? ''
  return closing.startsWith(marker.charAt(0).repeat(marker.length))
}

function markdownCodeBlocks(clipboardData: DataTransfer | null): PasteCodeBlock[] {
  const lines = standaloneCodeFenceLines(clipboardMarkdownSource(clipboardData))
  if (!lines || lines.length < 2) return []

  const opening = openingCodeFence(lines[0] ?? '')
  if (!opening || !closesCodeFence(lines, opening.marker)) return []

  return [{
    language: opening.language,
    source: lines.slice(1, -1).join('\n'),
  }]
}

function codeBlockInsert(block: PasteCodeBlock): PasteCodeBlockInsert {
  return {
    children: [],
    content: [{
      styles: {},
      text: block.source.replace(/\n$/u, ''),
      type: 'text',
    }],
    props: { language: block.language || 'text' },
    type: 'codeBlock',
  }
}

function blockText(block: PasteBlock): string {
  const content = block.content
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''

  return content.map(item => (
    typeof item === 'object'
      && item !== null
      && 'text' in item
      && typeof item.text === 'string'
      ? item.text
      : ''
  )).join('')
}

function isEmptyParagraph(block: PasteBlock): boolean {
  return block.type === 'paragraph' && blockText(block).trim() === ''
}

/** The caret sits in a code block, which holds plain text only. */
function cursorInCodeBlock(editor: RichPasteEditor): boolean {
  return editor.getTextCursorPosition?.().block?.type === 'codeBlock'
}

function blockWithId(block: PasteBlock | null | undefined): PasteBlockWithId | null {
  return typeof block?.id === 'string' ? { ...block, id: block.id } : null
}

function insertCodeBlocks(editor: RichPasteEditor, blocks: PasteCodeBlock[]): boolean {
  if (blocks.length === 0 || !editor.insertBlocks || !editor.getTextCursorPosition) return false

  const cursorBlock = blockWithId(editor.getTextCursorPosition().block)
  if (!cursorBlock) return false

  const inserts = blocks.map(codeBlockInsert)
  if (editor.replaceBlocks && isEmptyParagraph(cursorBlock)) {
    editor.replaceBlocks([cursorBlock], inserts)
    return true
  }

  editor.insertBlocks(inserts, cursorBlock.id, 'after')
  return true
}

function codeBlocksAsMarkdown(blocks: PasteCodeBlock[]): string {
  return blocks.map(markdownCodeBlockFromPasteBlock).join('\n\n')
}

function linkedCodeMarkdownSource(clipboardData: DataTransfer | null): string | null {
  if (!clipboardData || hasBlockNoteClipboardPayload(clipboardData)) return null
  if (!hasExplicitMarkdownPayload(clipboardData) && clipboardWebMarkup(clipboardData).value) return null

  const markdown = clipboardMarkdownSource(clipboardData)
  const protectedMarkdown = preProcessLinkedCodeMarkdown(markdown)
  if (!markdown || protectedMarkdown === markdown) return null
  return protectedMarkdown
}

function singleParagraphInlineContent(blocks: PasteBlock[]): unknown[] | null {
  if (blocks.length !== 1) return null

  const [block] = blocks
  if (block.type !== 'paragraph' || block.children?.length) return null
  return Array.isArray(block.content) ? block.content : null
}

function linkedCodeInlineContent(
  clipboardData: DataTransfer | null,
  editor: RichPasteEditor,
): unknown[] | null {
  if (!editor.tryParseMarkdownToBlocks) return null
  const markdown = linkedCodeMarkdownSource(clipboardData)
  if (!markdown) return null

  const parsedBlocks = editor.tryParseMarkdownToBlocks(markdown)
  const injectedBlocks = injectLinkedCodeInBlocks(parsedBlocks) as PasteBlock[]
  return injectedBlocks === parsedBlocks ? null : singleParagraphInlineContent(injectedBlocks)
}

function insertLinkedCodeMarkdown(
  editor: RichPasteEditor,
  clipboardData: DataTransfer | null,
): boolean {
  if (!editor.insertInlineContent) return false
  const content = linkedCodeInlineContent(clipboardData, editor)
  if (!content) return false

  const insertInlineContent = editor.insertInlineContent as unknown as (
    content: unknown[],
    options?: { updateSelection?: boolean },
  ) => void
  insertInlineContent.call(editor, content, { updateSelection: true })
  return true
}

function plainHttpLinkUrl(clipboardData: DataTransfer): string | null {
  if (hasExplicitMarkdownPayload(clipboardData) || clipboardWebMarkup(clipboardData).value) return null

  const plainText = clipboardData.getData('text/plain')
  if (!plainText || plainText !== plainText.trim()) return null

  try {
    return LINK_PASTE_PROTOCOLS.has(new URL(plainText).protocol) ? plainText : null
  } catch {
    return null
  }
}

function editorHasSelectedText(editor: RichPasteEditor): boolean {
  return typeof editor.getSelectedText === 'function' && editor.getSelectedText().length > 0
}

function selectedTextLinkUrl(
  clipboardData: DataTransfer | null,
  editor: RichPasteEditor,
): string | null {
  if (!clipboardData || !editor.createLink || !editorHasSelectedText(editor)) return null
  return plainHttpLinkUrl(clipboardData)
}

function linkSelectedTextFromPaste(
  clipboardData: DataTransfer | null,
  editor: RichPasteEditor,
): boolean {
  const url = selectedTextLinkUrl(clipboardData, editor)
  if (!url) return false

  editor.createLink?.(url)
  return true
}

export function handleRichEditorPaste({
  defaultPasteHandler,
  editor,
  event,
}: RichEditorPasteContext): boolean | undefined {
  // Inside a code block every branch below would make a block of its own
  // under the caret; the Kernel's handler pastes the clipboard's text where
  // the caret is, which is the only paste a code block takes (AIM-467).
  if (cursorInCodeBlock(editor)) return defaultPasteHandler()
  if (linkSelectedTextFromPaste(event.clipboardData, editor)) return true

  // One code block from one source: a fence in the text says its language,
  // so it is read before the HTML that may carry the same snippet.
  const fencedBlocks = markdownCodeBlocks(event.clipboardData)
  const codeBlocks = fencedBlocks.length > 0 ? fencedBlocks : htmlCodeBlocks(event.clipboardData)
  if (insertCodeBlocks(editor, codeBlocks)) return true

  const codeBlockMarkdown = codeBlocksAsMarkdown(codeBlocks)
  if (codeBlockMarkdown && editor.pasteMarkdown) {
    editor.pasteMarkdown(codeBlockMarkdown)
    return true
  }

  if (insertLinkedCodeMarkdown(editor, event.clipboardData)) return true

  if (shouldPasteHTMLImagesFromHTML(event.clipboardData)) {
    return defaultPasteHandler({ prioritizeMarkdownOverHTML: false })
  }

  const plainText = literalPlainText(event.clipboardData)
  if (plainText) return editor.pasteText(plainText)

  return defaultPasteHandler()
}

/**
 * The clipboard flavours BlockNote's default paste reads, in its order of
 * preference (`acceptedMIMETypes` in @blocknote/core, which it does not
 * export). The first one on the clipboard is what a paste becomes.
 */
const BLOCKNOTE_PASTE_FORMATS = ['vscode-editor-data', 'blocknote/html', 'text/markdown', WEB_MARKUP_MIME_TYPE, 'text/plain', 'Files']

/**
 * Whether a paste of this clipboard becomes its files, a pasted image an
 * Attachment, rather than its text. Files come last in BlockNote's order, so
 * only a clipboard with no text on it gives them: a screenshot does, while an
 * image copied with its name or with a web page around it pastes that text.
 * Raw mode asks the same, so a clipboard pastes alike in either mode.
 */
export function pasteTakesClipboardFiles(clipboardData: DataTransfer | null): boolean {
  if (!clipboardData) return false

  const types = Array.from(clipboardData.types)
  return BLOCKNOTE_PASTE_FORMATS.find((format) => types.includes(format)) === 'Files'
}

export function createRichEditorPasteHandler(): (context: RichEditorPasteContext) => boolean | undefined {
  return context => handleRichEditorPaste(context)
}

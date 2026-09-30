import {
  isAlias,
  isMap,
  isScalar,
  isSeq,
  parse,
  parseDocument,
  Scalar,
  type Node as YamlNode,
  type Pair,
} from 'yaml'

/**
 * The Frontmatter as Properties: what Rich mode shows above the body, and the
 * edits it makes. The Frontmatter here is the whole block as `splitFrontmatter`
 * cuts it, `---` lines included, or '' when the Document has none.
 *
 * Every edit rewrites only the source of the one Property it touches (its
 * value, its key, or its lines when it is removed); every other byte of the
 * block stays as it was, comments and blank lines included. An edit that
 * cannot be made that way returns null and the caller changes nothing.
 */

type Frontmatter = string

export type PropertyValue =
  /** A single-line scalar: a string, a number, a date, or nothing. `text` is what the field shows. */
  | { kind: 'text'; text: string }
  | { kind: 'boolean'; value: boolean }
  | { kind: 'list'; items: string[] }
  /** A `|` block scalar, shown as a multi-line field. */
  | { kind: 'multiline'; text: string }
  /** A nested map, a `>` folded scalar, or anything else Properties cannot edit in place. */
  | { kind: 'readonly'; summary: string }

export interface Property {
  key: string
  value: PropertyValue
  /** The Property's first line within the Frontmatter block, 0 being the opening `---`. */
  line: number
}

export type DocumentProperties =
  | { state: 'none' }
  /** The block is there but YAML refuses it (or its top level is not a map): it is shown as such and never edited. */
  | { state: 'unreadable' }
  | { state: 'readable'; properties: Property[] }

interface Block {
  open: string
  body: string
  close: string
  eol: string
}

interface LocatedProperty {
  key: string
  keySpan: [number, number]
  /** Just after the `:` that ends the key. */
  afterColon: number
  /** The end of the value's own source, trailing comments not included. */
  valueEnd: number
  /** The end of the Property's source, trailing comments included. */
  nodeEnd: number
  node: YamlNode | null
}

const OPEN_PATTERN = /^---\r?\n/
const CLOSE_PATTERN = /(^|\r?\n)---(\r?\n)?$/
/** Words a YAML 1.1 reader (still common) takes for a boolean or null; written as text they are quoted. */
const YAML_11_WORDS = /^(y|yes|n|no|on|off|true|false|null|~)$/i
const DEFAULT_INDENT = '  '

function splitBlock(frontmatter: Frontmatter): Block | null {
  const open = OPEN_PATTERN.exec(frontmatter)
  if (!open) return null
  const rest = frontmatter.slice(open[0].length)
  const close = CLOSE_PATTERN.exec(rest)
  if (!close) return null
  const body = rest.slice(0, close.index + close[1].length)
  return {
    open: open[0],
    body,
    close: rest.slice(body.length),
    eol: frontmatter.includes('\r\n') ? '\r\n' : '\n',
  }
}

function joinBlock(block: Block, body: string): Frontmatter {
  if (body.trim() === '') {
    // Only the Property lines were there: with none left, the block goes too.
    return block.body.trim() === '' ? `${block.open}${body}${block.close}` : ''
  }
  const closedBody = body.endsWith('\n') ? body : `${body}${block.eol}`
  return `${block.open}${closedBody}${block.close}`
}

function parseBody(body: string) {
  const doc = parseDocument(body, { keepSourceTokens: true, uniqueKeys: true })
  if (doc.errors.length > 0) return null
  if (doc.contents === null) return []
  if (!isMap(doc.contents) || doc.contents.flow) return null
  return doc.contents.items
}

function keyText(pair: Pair): string | null {
  if (!isScalar(pair.key)) return null
  const value = pair.key.value
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  return null
}

function locate(body: string, pair: Pair): LocatedProperty | null {
  const key = keyText(pair)
  if (key === null || !isScalar(pair.key) || !pair.key.range) return null
  const [keyStart, keyEnd] = pair.key.range
  const colon = body.indexOf(':', keyEnd)
  if (colon < 0) return null
  const node = (pair.value ?? null) as YamlNode | null
  const range = node?.range
  return {
    key,
    keySpan: [keyStart, keyEnd],
    afterColon: colon + 1,
    valueEnd: range ? range[1] : colon + 1,
    nodeEnd: range ? range[2] : colon + 1,
    node,
  }
}

function locateAll(body: string): LocatedProperty[] | null {
  const items = parseBody(body)
  if (items === null) return null
  const located: LocatedProperty[] = []
  for (const pair of items) {
    const property = locate(body, pair)
    if (!property) return null
    located.push(property)
  }
  return located
}

function lineOf(text: string, offset: number): number {
  let line = 0
  for (let index = 0; index < offset; index += 1) {
    if (text[index] === '\n') line += 1
  }
  return line
}

function isPlainScalarList(node: YamlNode): boolean {
  if (!isSeq(node) || node.anchor || node.tag) return false
  return node.items.every((item) => isScalar(item) && !item.anchor && !item.tag && item.type !== 'BLOCK_LITERAL' && item.type !== 'BLOCK_FOLDED')
}

function scalarShownText(node: Scalar): string {
  if (node.value === null) return ''
  if (node.type === 'PLAIN') return String(node.source ?? node.value)
  return String(node.value)
}

function summarize(node: YamlNode | null): string {
  if (node === null) return ''
  if (isScalar(node)) return String(node.value ?? '').replace(/\s+/g, ' ').trim()
  if (isMap(node)) {
    return node.items.map((pair) => {
      const key = isScalar(pair.key) ? String(pair.key.value) : '…'
      const value = isScalar(pair.value) ? String(pair.value.value ?? '') : '…'
      return `${key}: ${value}`
    }).join(', ')
  }
  if (isSeq(node)) return node.items.map((item) => (isScalar(item) ? String(item.value ?? '') : '…')).join(', ')
  return '…'
}

function valueOf(node: YamlNode | null): PropertyValue {
  if (node === null) return { kind: 'text', text: '' }
  if (isAlias(node) || node.anchor || node.tag) return { kind: 'readonly', summary: summarize(node) }
  if (isScalar(node)) {
    if (node.type === 'BLOCK_LITERAL') return { kind: 'multiline', text: String(node.value).replace(/\n$/, '') }
    if (node.type === 'BLOCK_FOLDED') return { kind: 'readonly', summary: summarize(node) }
    if (typeof node.value === 'boolean') return { kind: 'boolean', value: node.value }
    const text = scalarShownText(node)
    if (text.includes('\n')) return { kind: 'readonly', summary: summarize(node) }
    return { kind: 'text', text }
  }
  if (isPlainScalarList(node) && isSeq(node)) {
    return { kind: 'list', items: node.items.map((item) => String((item as Scalar).value ?? '')) }
  }
  return { kind: 'readonly', summary: summarize(node) }
}

export function readProperties(frontmatter: Frontmatter): DocumentProperties {
  const block = splitBlock(frontmatter)
  if (!block) return { state: 'none' }
  const located = locateAll(block.body)
  if (located === null) return { state: 'unreadable' }
  return {
    state: 'readable',
    properties: located.map((property) => ({
      key: property.key,
      value: valueOf(property.node),
      line: lineOf(block.body, property.keySpan[0]) + 1,
    })),
  }
}

/** Whether YAML reads `text`, written bare, back as exactly that string. */
function readsBackAsText(text: string, flow: boolean): boolean {
  if (text === '' || text !== text.trim() || YAML_11_WORDS.test(text)) return false
  if (flow && /[,[\]{}]/.test(text)) return false
  try {
    return parse(text) === text
  } catch {
    return false
  }
}

function readsBackAsNumber(text: string): boolean {
  if (text === '' || text !== text.trim()) return false
  try {
    return typeof parse(text) === 'number'
  } catch {
    return false
  }
}

function doubleQuoted(text: string): string {
  return JSON.stringify(text)
}

function singleQuoted(text: string): string {
  return `'${text.replace(/'/g, "''")}'`
}

function textSource(text: string, original: YamlNode | null, flow = false): string {
  if (isScalar(original) && original.type === 'QUOTE_SINGLE') return singleQuoted(text)
  if (isScalar(original) && original.type === 'QUOTE_DOUBLE') return doubleQuoted(text)
  if (isScalar(original) && typeof original.value === 'number' && readsBackAsNumber(text)) return text
  return readsBackAsText(text, flow) ? text : doubleQuoted(text)
}

function keySource(key: string): string {
  return readsBackAsText(key, true) && !key.includes(':') ? key : doubleQuoted(key)
}

function indentOf(body: string, offset: number): string {
  const lineStart = body.lastIndexOf('\n', offset - 1) + 1
  return /^[ ]*/.exec(body.slice(lineStart))?.[0] ?? ''
}

function lineStartOf(body: string, offset: number): number {
  return body.lastIndexOf('\n', offset - 1) + 1
}

function lineEndOf(body: string, offset: number): number {
  if (offset > 0 && body[offset - 1] === '\n') return offset
  const next = body.indexOf('\n', offset)
  return next < 0 ? body.length : next + 1
}

function replace(body: string, from: number, to: number, text: string): string {
  return `${body.slice(0, from)}${text}${body.slice(to)}`
}

type BodyEdit = (body: string, property: LocatedProperty, eol: string) => string | null

function editProperty(frontmatter: Frontmatter, key: string, edit: BodyEdit): Frontmatter | null {
  const block = splitBlock(frontmatter)
  if (!block) return null
  const located = locateAll(block.body)
  const property = located?.find((candidate) => candidate.key === key)
  if (!property) return null
  const body = edit(block.body, property, block.eol)
  return body === null ? null : joinBlock(block, body)
}

/** Replaces the value's source, from just after the `:`, keeping a trailing comment on a one-line value. */
function replaceValue(body: string, property: LocatedProperty, source: string): string {
  const separator = source.startsWith('\n') || source.startsWith('\r\n') || source === '' ? '' : ' '
  // A block value's source runs through its last line break, which a one-line value must put back.
  const replacedBreak = /\r?\n$/.exec(body.slice(property.afterColon, property.valueEnd))?.[0] ?? ''
  const closingBreak = /\n$/.test(source) ? '' : replacedBreak
  return replace(body, property.afterColon, property.valueEnd, `${separator}${source}${closingBreak}`)
}

export function setPropertyText(frontmatter: Frontmatter, key: string, text: string): Frontmatter | null {
  if (text.includes('\n')) return null
  return editProperty(frontmatter, key, (body, property) => {
    if (valueOf(property.node).kind !== 'text') return null
    const source = text === '' ? '' : textSource(text, property.node)
    return replaceValue(body, property, source)
  })
}

export function setPropertyBoolean(frontmatter: Frontmatter, key: string, value: boolean): Frontmatter | null {
  return editProperty(frontmatter, key, (body, property) => {
    if (valueOf(property.node).kind !== 'boolean') return null
    return replaceValue(body, property, value ? 'true' : 'false')
  })
}

function flowItemSource(text: string, originals: Scalar[]): string {
  const same = originals.find((item) => String(item.value ?? '') === text)
  if (same?.source !== undefined && same.range) return same.type === 'PLAIN' ? String(same.source) : textSource(text, same, true)
  return readsBackAsText(text, true) ? text : doubleQuoted(text)
}

export function setPropertyList(frontmatter: Frontmatter, key: string, items: string[]): Frontmatter | null {
  return editProperty(frontmatter, key, (body, property, eol) => {
    const node = property.node
    if (!node || !isSeq(node) || valueOf(node).kind !== 'list') return null
    const originals = node.items as Scalar[]
    const sources = items.map((item) => flowItemSource(item, originals))
    if (items.length === 0 || node.flow) return replaceValue(body, property, `[${sources.join(', ')}]`)
    const indent = indentOf(body, node.range?.[0] ?? property.afterColon)
    const lines = sources.map((source) => `${indent}- ${source}${eol}`).join('')
    return replace(body, property.afterColon, property.valueEnd, `${eol}${lines}`)
  })
}

/**
 * The `|` header to write: the original's chomping (`-`, `+` or none) kept, and
 * an indentation indicator only when the first line starts with a space, which
 * YAML would otherwise take for the block's indentation.
 */
function blockHeader(originalHeader: string, lines: string[], indent: string): string {
  const chomp = /^\|[0-9]?([+-]?)/.exec(originalHeader)?.[1] ?? ''
  const firstContent = lines.find((line) => line.trim() !== '') ?? ''
  const indicator = firstContent.startsWith(' ') ? String(indent.length) : ''
  return `|${indicator}${chomp}`
}

export function setPropertyMultiline(frontmatter: Frontmatter, key: string, text: string): Frontmatter | null {
  return editProperty(frontmatter, key, (body, property, eol) => {
    const node = property.node
    if (!isScalar(node) || valueOf(node).kind !== 'multiline') return null
    const keyIndent = indentOf(body, property.keySpan[0])
    const headerStart = node.range?.[0] ?? property.afterColon
    const contentStart = body.indexOf('\n', headerStart) + 1
    const originalHeader = body.slice(headerStart, contentStart).trim()
    const indicated = /^\|([1-9])/.exec(originalHeader)?.[1]
    const firstLineEnd = body.indexOf('\n', contentStart)
    const firstLine = body.slice(contentStart, firstLineEnd < 0 ? body.length : firstLineEnd)
    const found = indicated ? `${keyIndent}${' '.repeat(Number(indicated))}` : firstLine.trim() === '' ? '' : (/^[ ]*/.exec(firstLine)?.[0] ?? '')
    const indent = found.length > keyIndent.length ? found : `${keyIndent}${DEFAULT_INDENT}`
    const lines = text.split('\n')
    const header = blockHeader(originalHeader, lines, indent.slice(keyIndent.length))
    const content = lines.map((line) => (line === '' ? eol : `${indent}${line}${eol}`)).join('')
    return replace(body, property.afterColon, property.valueEnd, ` ${header}${eol}${content}`)
  })
}

export function renameProperty(frontmatter: Frontmatter, key: string, nextKey: string): Frontmatter | null {
  const trimmed = nextKey.trim()
  if (trimmed === '' || trimmed.includes('\n')) return null
  if (trimmed === key) return frontmatter
  const current = readProperties(frontmatter)
  if (current.state !== 'readable' || current.properties.some((property) => property.key === trimmed)) return null
  return editProperty(frontmatter, key, (body, property) => replace(body, property.keySpan[0], property.keySpan[1], keySource(trimmed)))
}

export function removeProperty(frontmatter: Frontmatter, key: string): Frontmatter | null {
  return editProperty(frontmatter, key, (body, property) => {
    const from = lineStartOf(body, property.keySpan[0])
    const to = lineEndOf(body, Math.max(property.nodeEnd, property.afterColon))
    return replace(body, from, to, '')
  })
}

/** Appends `key:` as the last Property, creating the Frontmatter when the Document has none. */
export function addProperty(frontmatter: Frontmatter, key: string): Frontmatter | null {
  const trimmed = key.trim()
  if (trimmed === '' || trimmed.includes('\n')) return null
  if (frontmatter === '') return `---\n${keySource(trimmed)}:\n---\n`
  const current = readProperties(frontmatter)
  if (current.state !== 'readable' || current.properties.some((property) => property.key === trimmed)) return null
  const block = splitBlock(frontmatter)
  if (!block) return null
  const body = block.body === '' || block.body.endsWith('\n') ? block.body : `${block.body}${block.eol}`
  return joinBlock(block, `${body}${keySource(trimmed)}:${block.eol}`)
}

/** Whether `key` names a Property the Frontmatter already has; the add and rename fields refuse it. */
export function hasProperty(frontmatter: Frontmatter, key: string): boolean {
  const current = readProperties(frontmatter)
  return current.state === 'readable' && current.properties.some((property) => property.key === key.trim())
}

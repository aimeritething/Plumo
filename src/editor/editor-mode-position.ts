import { splitFrontmatter } from '@/kernel/markdown/wikilinks'
import { serializeRichEditorBlocksToMarkdown } from '@/kernel/markdown/rich-editor-markdown'
import { EditorView } from '@codemirror/view'
import { TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'
import { findNearestTextCursorBlockById } from '@/kernel/blocknote/block-note-cursor-target'

// Where the cursor is, carried across a Rich ↔ Raw switch. The mapping is by
// block, and by row inside a table: a cursor in Rich becomes a cursor at the
// end of its block's last Raw line, and the other way round. Never a
// selection the writer did not make, so typing right after a switch replaces
// nothing. The view follows the cursor: it scrolls only if the cursor's block
// is out of sight.

interface BlockLike {
  id: string
  type?: string
  content?: unknown
  children?: BlockLike[]
}

/** The ProseMirror side of the editor, for what BlockNote's API cannot say: the row of a table. */
interface ProseMirrorLike {
  state: EditorState
  view: {
    dispatch: (transaction: Transaction) => void
    nodeDOM: (pos: number) => Node | null
  }
}

interface BlockSelectionLike {
  blocks: BlockLike[]
}

interface TextCursorPositionLike {
  block?: BlockLike
}

export interface BlockNotePositionEditor {
  document: BlockLike[]
  getSelection?: () => BlockSelectionLike | undefined
  getTextCursorPosition?: () => TextCursorPositionLike
  blocksToMarkdownLossy: (blocks: unknown[]) => string
  setSelection: (startBlock: string, endBlock: string) => void
  setTextCursorPosition: (targetBlock: string, placement: 'start' | 'end') => void
  focus: () => void
  _tiptapEditor?: ProseMirrorLike
}

export interface CodeMirrorViewLike {
  state: {
    doc: { toString: () => string }
    selection: {
      main: {
        anchor: number
        head: number
      }
    }
  }
  scrollDOM: {
    scrollTop: number
    getBoundingClientRect?: () => { top: number; bottom: number }
  }
  coordsAtPos?: (pos: number) => { top: number; bottom: number } | null
  dispatch: (spec: { selection: { anchor: number; head: number }; effects?: unknown }) => void
  focus: () => void
}

interface RawEditorHost extends Element {
  __cmView?: CodeMirrorViewLike
}

export interface RichEditorPositionSnapshot {
  /** Indexes into the top-level blocks; equal for a cursor, and for a selection inside one block. */
  anchorBlockIndex: number
  headBlockIndex: number
  /** The block the cursor is in, when that is a child of the top-level block. */
  cursorBlockId: string | null
  /** The row the cursor is in, when its block is a table. */
  tableRowIndex: number | null
}

export interface RawEditorPositionSnapshot {
  /** The Raw body, Frontmatter left out: the lines below count into it. */
  body: string
  anchorLine: number
  headLine: number
  /** The caret's line when it sits in the Frontmatter, 0 being the opening `---`: Rich mode puts it in that Property. */
  frontmatterLine?: number
}

export interface CodeMirrorRestoreState {
  anchor: number
  head: number
  /**
   * Set only when the state was read off a Raw view of this same Document, so
   * the pixels mean the same thing. Without it the view follows the cursor.
   */
  scrollTop?: number
}

interface BlockLineRange {
  startLine: number
  endLine: number
}

const RAW_EDITOR_SELECTOR = '[data-testid="raw-editor-codemirror"]'
const BLOCKNOTE_SCROLL_SELECTOR = '.editor-scroll-area'

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function clampSelectionOffset(value: number, maxOffset: number): number {
  return Number.isFinite(value) ? clamp(value, 0, maxOffset) : 0
}

function countLines({ text }: { text: string }): number {
  return text.length === 0 ? 1 : text.split('\n').length
}

function countLineBreaks({ text }: { text: string }): number {
  return [...text].filter(char => char === '\n').length
}

function getLineStartOffset({ text, lineIndex }: { text: string; lineIndex: number }): number {
  if (lineIndex <= 0 || text.length === 0) return 0

  let currentLine = 0
  for (let index = 0; index < text.length; index++) {
    if (text.charAt(index) !== '\n') continue
    currentLine += 1
    if (currentLine === lineIndex) {
      return index + 1
    }
  }

  return text.length
}

function getLineEndOffset({ text, lineIndex }: { text: string; lineIndex: number }): number {
  const start = getLineStartOffset({ text, lineIndex })
  const nextBreak = text.indexOf('\n', start)
  return nextBreak === -1 ? text.length : nextBreak
}

function getLineIndexForOffset({ text, offset }: { text: string; offset: number }): number {
  if (text.length === 0) return 0
  const clampedOffset = clamp(offset, 0, text.length)
  return countLineBreaks({ text: text.slice(0, clampedOffset) })
}

function serializeBlock(editor: BlockNotePositionEditor, block: BlockLike): string {
  return serializeRichEditorBlocksToMarkdown({ blocks: [block], editor })
}

function buildBlockLineRanges({
  body,
  editor,
}: {
  body: string
  editor: BlockNotePositionEditor
}): BlockLineRange[] {
  let searchStart = 0
  let fallbackStartLine = 0

  return editor.document.map((block) => {
    // Without the serializer's trailing line break, which would count the next line into this block.
    const serializedBlock = serializeBlock(editor, block).trim()
    if (!serializedBlock) {
      return { startLine: fallbackStartLine, endLine: fallbackStartLine }
    }

    const bodyIndex = body.indexOf(serializedBlock, searchStart)
    if (bodyIndex === -1) {
      const lineCount = countLines({ text: serializedBlock })
      const range = {
        startLine: fallbackStartLine,
        endLine: fallbackStartLine + Math.max(lineCount - 1, 0),
      }
      fallbackStartLine = range.endLine + 1
      return range
    }

    const startLine = countLineBreaks({ text: body.slice(0, bodyIndex) })
    const endLine = countLineBreaks({ text: body.slice(0, bodyIndex + serializedBlock.length) })
    searchStart = bodyIndex + serializedBlock.length
    fallbackStartLine = endLine + 1
    return { startLine, endLine }
  })
}

function findNearestBlockIndex({
  ranges,
  targetLine,
}: {
  ranges: BlockLineRange[]
  targetLine: number
}): number {
  let nearestIndex = 0
  let nearestDistance = Number.POSITIVE_INFINITY

  ranges.forEach((range, index) => {
    if (targetLine >= range.startLine && targetLine <= range.endLine) {
      nearestIndex = index
      nearestDistance = 0
      return
    }

    const distance = targetLine < range.startLine
      ? range.startLine - targetLine
      : targetLine - range.endLine
    if (distance < nearestDistance) {
      nearestIndex = index
      nearestDistance = distance
    }
  })

  return nearestIndex
}

/** The index of the top-level block that is `blockId`, or holds it among its children. */
function topLevelBlockIndex(editor: BlockNotePositionEditor, blockId: string): number | null {
  const holds = (block: BlockLike): boolean => block.id === blockId || (block.children ?? []).some(holds)
  const index = editor.document.findIndex(holds)
  return index === -1 ? null : index
}

function getSelectionIndexes(editor: BlockNotePositionEditor): [number, number] | null {
  if (typeof editor.getSelection !== 'function') return null

  const selection = editor.getSelection()
  const selectedBlocks = selection?.blocks ?? []
  if (selectedBlocks.length === 0) return null

  const startBlock = selectedBlocks.at(0)
  const endBlock = selectedBlocks.at(-1)
  if (!startBlock || !endBlock) return null

  const startIndex = topLevelBlockIndex(editor, startBlock.id)
  const endIndex = topLevelBlockIndex(editor, endBlock.id)
  if (startIndex === null || endIndex === null) return null

  return [startIndex, endIndex]
}

function getCursorBlockId(editor: BlockNotePositionEditor): string | null {
  if (typeof editor.getTextCursorPosition !== 'function') return null

  try {
    return editor.getTextCursorPosition()?.block?.id ?? null
  } catch {
    return null
  }
}

/** The row of the table the cursor is in, counted from the header row; null outside a table. */
function getCursorTableRowIndex(editor: BlockNotePositionEditor): number | null {
  const $head = editor._tiptapEditor?.state.selection.$head
  if (!$head) return null

  for (let depth = $head.depth; depth > 0; depth -= 1) {
    if ($head.node(depth).type.name === 'tableRow') return $head.index(depth - 1)
  }
  return null
}

export function captureRichEditorPositionSnapshot(
  editor: BlockNotePositionEditor,
): RichEditorPositionSnapshot | null {
  if (editor.document.length === 0) return null

  const cursorBlockId = getCursorBlockId(editor)
  const cursorIndex = cursorBlockId ? topLevelBlockIndex(editor, cursorBlockId) : null
  const [anchorBlockIndex, headBlockIndex] = getSelectionIndexes(editor) ?? [cursorIndex, cursorIndex]
  if (anchorBlockIndex === null || headBlockIndex === null) return null

  return {
    anchorBlockIndex,
    headBlockIndex,
    cursorBlockId,
    tableRowIndex: getCursorTableRowIndex(editor),
  }
}

const CODE_FENCE_PATTERN = /^\s*(?:`{3,}|~{3,})\s*$/
const TABLE_LINE_PATTERN = /^\s*\|/

/** A table's first line is its header row, its second the delimiter; row n ≥ 1 is on line n + 1. */
function tableRowToLine(rowIndex: number): number {
  return rowIndex === 0 ? 0 : rowIndex + 1
}

function tableLineToRow(line: number): number {
  return line <= 1 ? 0 : line - 1
}

function findBlockById(blocks: BlockLike[], blockId: string): BlockLike | null {
  for (const block of blocks) {
    if (block.id === blockId) return block
    const child = findBlockById(block.children ?? [], blockId)
    if (child) return child
  }
  return null
}

/** The lines `block` writes by itself, without its children, as they read once any indent is gone. */
function ownLines(editor: BlockNotePositionEditor, block: BlockLike): string[] {
  return serializeBlock(editor, { ...block, children: [] }).trim().split('\n').map(line => line.trim())
}

/**
 * The Raw line a Rich cursor goes to the end of: the last line of its block.
 * In a table that is the cursor's row. In a code block it is the last line of
 * code, not the closing fence, where typing would break the block. A block
 * with children ends with them, so the cursor's own block is looked up among
 * the lines.
 */
function cursorLine({
  editor,
  lines,
  range,
  snapshot,
}: {
  editor: BlockNotePositionEditor
  lines: string[]
  range: BlockLineRange
  snapshot: RichEditorPositionSnapshot
}): number {
  if (snapshot.tableRowIndex !== null && TABLE_LINE_PATTERN.test(lines[range.startLine] ?? '')) {
    return Math.min(range.startLine + tableRowToLine(snapshot.tableRowIndex), range.endLine)
  }

  let lastLine = range.endLine
  const cursorBlock = snapshot.cursorBlockId ? findBlockById(editor.document, snapshot.cursorBlockId) : null
  if (cursorBlock && range.endLine > range.startLine) {
    const own = ownLines(editor, cursorBlock)
    for (let line = range.startLine; line <= range.endLine; line += 1) {
      if ((lines[line] ?? '').trim() !== own[0]) continue
      lastLine = Math.min(line + own.length - 1, range.endLine)
      break
    }
  }

  const endsWithFence = lastLine > range.startLine && CODE_FENCE_PATTERN.test(lines[lastLine] ?? '')
  return endsWithFence ? lastLine - 1 : lastLine
}

export function buildCodeMirrorRestoreState(
  editor: BlockNotePositionEditor,
  content: string,
  snapshot: RichEditorPositionSnapshot,
): CodeMirrorRestoreState | null {
  if (editor.document.length === 0) return null

  const [frontmatter, body] = splitFrontmatter(content)
  const ranges = buildBlockLineRanges({ body, editor })
  if (ranges.length === 0) return null

  const anchorRange = ranges.at(clamp(snapshot.anchorBlockIndex, 0, ranges.length - 1))
  const headRange = ranges.at(clamp(snapshot.headBlockIndex, 0, ranges.length - 1))
  if (!anchorRange || !headRange) return null

  // Only a selection over several blocks stays one: inside one block it would
  // become the whole block, which is not what the writer selected.
  if (anchorRange === headRange) {
    const line = cursorLine({ editor, lines: body.split('\n'), range: headRange, snapshot })
    const offset = frontmatter.length + getLineEndOffset({ text: body, lineIndex: line })
    return { anchor: offset, head: offset }
  }

  return {
    anchor: frontmatter.length + getLineStartOffset({ text: body, lineIndex: anchorRange.startLine }),
    head: frontmatter.length + getLineEndOffset({ text: body, lineIndex: headRange.endLine }),
  }
}

export function getRawEditorView(documentObject: Document): CodeMirrorViewLike | null {
  const host = documentObject.querySelector<RawEditorHost>(RAW_EDITOR_SELECTOR)
  return host?.__cmView ?? null
}

export function captureRawEditorPositionSnapshot(documentObject: Document): RawEditorPositionSnapshot | null {
  const view = getRawEditorView(documentObject)
  if (!view) return null

  const content = view.state.doc.toString()
  const [frontmatter, body] = splitFrontmatter(content)
  const bodyLength = body.length
  const anchorOffset = clamp(view.state.selection.main.anchor - frontmatter.length, 0, bodyLength)
  const headOffset = clamp(view.state.selection.main.head - frontmatter.length, 0, bodyLength)
  const head = view.state.selection.main.head
  return {
    body,
    anchorLine: getLineIndexForOffset({ text: body, offset: anchorOffset }),
    headLine: getLineIndexForOffset({ text: body, offset: headOffset }),
    ...(head < frontmatter.length ? { frontmatterLine: getLineIndexForOffset({ text: content, offset: head }) } : {}),
  }
}

const PROPERTY_LINE_ATTRIBUTE = 'data-property-line'

/** The Frontmatter line of the Property whose row holds the focus, when Properties has it. */
export function focusedPropertyLine(documentObject: Document): number | null {
  const row = documentObject.activeElement?.closest(`[${PROPERTY_LINE_ATTRIBUTE}]`)
  const line = Number(row?.getAttribute(PROPERTY_LINE_ATTRIBUTE))
  return row && Number.isInteger(line) ? line : null
}

/** Raw mode's caret for a Property that had the focus in Rich mode: the end of the Property's first line. */
export function propertyCodeMirrorRestoreState(content: string, line: number): CodeMirrorRestoreState {
  const offset = getLineEndOffset({ text: content, lineIndex: line })
  return { anchor: offset, head: offset }
}

/**
 * Rich mode's side of a Raw caret in the Frontmatter: the value of the
 * Property whose lines hold it takes the focus. False when no Property does
 * (the caret on a `---` or a comment above the first one).
 */
export function focusPropertyAtLine(documentObject: Document, line: number): boolean {
  const rows = [...documentObject.querySelectorAll<HTMLElement>(`[${PROPERTY_LINE_ATTRIBUTE}]`)]
  const row = rows.filter((candidate) => Number(candidate.getAttribute(PROPERTY_LINE_ATTRIBUTE)) <= line).at(-1)
  const control = row?.querySelector<HTMLElement>('[data-property-value]')
  if (!control) return false
  control.focus()
  return true
}

export function captureRawCodeMirrorRestoreState(documentObject: Document): CodeMirrorRestoreState | null {
  const view = getRawEditorView(documentObject)
  if (!view) return null

  return {
    anchor: view.state.selection.main.anchor,
    head: view.state.selection.main.head,
    scrollTop: view.scrollDOM.scrollTop,
  }
}

/** True when the Raw cursor is drawn inside the scroller; a position CodeMirror has not drawn is not. */
function isRawCursorInView(view: CodeMirrorViewLike, head: number): boolean {
  const cursor = view.coordsAtPos?.(head)
  const scroller = view.scrollDOM.getBoundingClientRect?.()
  if (!cursor || !scroller) return false
  return cursor.top >= scroller.top && cursor.bottom <= scroller.bottom
}

export function restoreCodeMirrorView(
  documentObject: Document,
  state: CodeMirrorRestoreState,
): boolean {
  const view = getRawEditorView(documentObject)
  if (!view) return false

  const maxOffset = view.state.doc.toString().length
  const selection = {
    anchor: clampSelectionOffset(state.anchor, maxOffset),
    head: clampSelectionOffset(state.head, maxOffset),
  }
  const followCursor = state.scrollTop === undefined && !isRawCursorInView(view, selection.head)

  try {
    view.dispatch(followCursor
      ? { selection, effects: EditorView.scrollIntoView(selection.head, { y: 'center' }) }
      : { selection })
  } catch {
    return false
  }
  if (state.scrollTop !== undefined) view.scrollDOM.scrollTop = state.scrollTop
  view.focus()
  return true
}

/** The block the Raw line belongs to: the top-level block, or the child of it that wrote the line. */
function findBlockForLine(editor: BlockNotePositionEditor, block: BlockLike, line: string): BlockLike {
  const wroteLine = (candidate: BlockLike): BlockLike | null => {
    if (ownLines(editor, candidate).includes(line.trim())) return candidate
    for (const child of candidate.children ?? []) {
      const found = wroteLine(child)
      if (found) return found
    }
    return null
  }
  return (block.children?.length ? wroteLine(block) : null) ?? block
}

/**
 * Puts the cursor at the end of a table's row, in its last cell, and answers
 * with the row's element. BlockNote's own cursor API knows a table only as a
 * whole, so this goes through ProseMirror.
 */
function setCursorInTableRow(editor: BlockNotePositionEditor, blockId: string, rowIndex: number): Element | null {
  const proseMirror = editor._tiptapEditor
  if (!proseMirror) return null

  let rowPos = -1
  let rowEnd = -1
  proseMirror.state.doc.descendants((node, pos) => {
    if (rowPos !== -1) return false
    if (node.attrs.id !== blockId) return true

    node.descendants((table, tableOffset) => {
      if (table.type.name !== 'table' || table.childCount === 0) return true
      const targetRow = clamp(rowIndex, 0, table.childCount - 1)
      let offset = pos + 1 + tableOffset + 1
      for (let row = 0; row < targetRow; row += 1) offset += table.child(row).nodeSize
      rowPos = offset
      rowEnd = offset + table.child(targetRow).nodeSize
      return false
    })
    return false
  })
  if (rowPos === -1) return null

  const { state, view } = proseMirror
  view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(rowEnd - 1), -1)))
  const rowElement = view.nodeDOM(rowPos)
  return rowElement instanceof Element ? rowElement : null
}

/** Puts the Rich cursor or selection where the Raw one was, and answers with the element it is in. */
function restoreBlockNoteSelection(
  editor: BlockNotePositionEditor,
  snapshot: RawEditorPositionSnapshot,
  documentObject: Document,
): Element | null {
  const ranges = buildBlockLineRanges({ body: snapshot.body, editor })
  const anchorIndex = findNearestBlockIndex({ ranges, targetLine: snapshot.anchorLine })
  const headIndex = findNearestBlockIndex({ ranges, targetLine: snapshot.headLine })
  const blockElement = (blockId: string) => documentObject.querySelector(`[data-id="${blockId}"]`)

  if (anchorIndex !== headIndex) {
    const startBlockId = findNearestTextCursorBlockById(editor.document, editor.document[Math.min(anchorIndex, headIndex)].id)?.id
    const endBlockId = findNearestTextCursorBlockById(editor.document, editor.document[Math.max(anchorIndex, headIndex)].id)?.id
    if (!startBlockId || !endBlockId) return null
    editor.setSelection(startBlockId, endBlockId)
    return blockElement(endBlockId)
  }

  const block = editor.document[headIndex]
  const range = ranges[headIndex]
  if (block.type === 'table') {
    const rowElement = setCursorInTableRow(editor, block.id, tableLineToRow(snapshot.headLine - range.startLine))
    if (rowElement) return rowElement
  }

  const lineBlock = findBlockForLine(editor, block, snapshot.body.split('\n')[snapshot.headLine] ?? '')
  const cursorBlockId = block.type === 'table'
    ? block.id
    : findNearestTextCursorBlockById([lineBlock], lineBlock.id)?.id ?? findNearestTextCursorBlockById(editor.document, block.id)?.id
  if (!cursorBlockId) return null
  editor.setTextCursorPosition(cursorBlockId, 'end')
  return blockElement(cursorBlockId)
}

/**
 * Scrolls `element` to the middle of the Rich scroller, but only when the
 * cursor in it is out of sight: a switch that lands on a visible block leaves
 * the view where it was. The cursor is at the element's end, so an element
 * taller than the scroller shows its end.
 */
function scrollIntoViewIfHidden(element: Element, documentObject: Document): void {
  const scroller = documentObject.querySelector(BLOCKNOTE_SCROLL_SELECTOR)?.getBoundingClientRect()
  const box = element.getBoundingClientRect()
  const taller = scroller !== undefined && box.height > scroller.height
  if (scroller && box.bottom <= scroller.bottom && box.bottom > scroller.top && (taller || box.top >= scroller.top)) return

  element.scrollIntoView({ block: taller ? 'end' : 'center' })
}

export function restoreBlockNoteView(
  editor: BlockNotePositionEditor,
  snapshot: RawEditorPositionSnapshot,
  documentObject: Document,
): boolean {
  if (editor.document.length === 0) return false

  let element: Element | null
  try {
    element = restoreBlockNoteSelection(editor, snapshot, documentObject)
  } catch {
    return false
  }
  editor.focus()
  if (element) scrollIntoViewIfHidden(element, documentObject)
  return true
}

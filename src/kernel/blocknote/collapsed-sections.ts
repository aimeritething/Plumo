import {
  useLayoutEffect,
  useSyncExternalStore,
} from 'react'
import {
  BLOCK_OUTER_SELECTOR,
  editorBlockElement,
  renderedSectionBlockElements,
  type RichEditor,
} from './block-note-dom'

export type CollapsibleBlock = {
  children?: CollapsibleBlock[]
  id?: unknown
  props?: Record<string, unknown>
  type?: unknown
}

/**
 * What is collapsed: headings and list items, by block id. A collapsed
 * heading's section runs to the next heading of its level or higher, unless
 * `sectionEnds` names the block it stops after (with that block's children):
 * a block placed just past a collapsed section, by Enter on its heading or a
 * move, would fall inside it otherwise. Expanding a heading drops its end.
 */
type CollapsedSections = {
  collapsedHeadingIds: ReadonlySet<string>
  sectionEnds: ReadonlyMap<string, string>
}
type CollapsedHeadingStore = {
  collapsedHeadingIds: Set<string>
  sectionEnds: Map<string, string>
  emit: () => void
  getSnapshot: () => number
  listeners: Set<() => void>
  subscribe: (listener: () => void) => () => void
  version: number
}
type CollapsedSectionRenderState = {
  collapsedHeadingIds: Set<string>
  hiddenBlockIds: Set<string>
}
// One block, in document order, as the section walk sees it.
type SectionEntry = {
  depth: number
  headingLevel: number | null
  id: string | undefined
  isListItem: boolean
}
type ActiveCollapsedSection = {
  endDepth: number | null
  endId: string | undefined
  id: string
  level: number
}
type CollapsedHeadingDotsHit = {
  blockId: string
  inlineContent: HTMLElement
}
type CollapsedHeadingRenderingController = {
  attachedEditorElement: HTMLElement | null
  frame: number | null
  ownerWindow: Window | undefined
}
const COLLAPSIBLE_LIST_ITEM_TYPES = new Set(['bulletListItem', 'numberedListItem', 'checkListItem'])
const HEADING_TAG_LEVELS = new Map([
  ['h1', 1],
  ['h2', 2],
  ['h3', 3],
  ['h4', 4],
  ['h5', 5],
  ['h6', 6],
])
const headingCollapseStores = new WeakMap<RichEditor, CollapsedHeadingStore>()
const headingCollapseRenderers = createWeakKeyMap<HTMLElement, () => void>()
const collapsedSectionStyleElements = createWeakKeyMap<HTMLElement, HTMLStyleElement>()
let collapsedSectionScopeSequence = 0

function createWeakKeyMap<Key extends object, Value>(): WeakMap<Key, Value> {
  return new WeakMap<Key, Value>()
}

function createCollapsedHeadingStore(): CollapsedHeadingStore {
  const store: CollapsedHeadingStore = {
    collapsedHeadingIds: new Set(),
    emit: () => {
      store.version += 1
      store.listeners.forEach((listener) => {
        listener()
      })
    },
    getSnapshot: () => store.version,
    listeners: new Set(),
    sectionEnds: new Map(),
    subscribe: (listener) => {
      store.listeners.add(listener)
      return () => store.listeners.delete(listener)
    },
    version: 0,
  }

  return store
}

function collapsedHeadingStore(editor: RichEditor) {
  let store = headingCollapseStores.get(editor)
  if (!store) {
    store = createCollapsedHeadingStore()
    headingCollapseStores.set(editor, store)
  }

  return store
}

export function useCollapsedHeadingIds(editor: RichEditor) {
  const store = collapsedHeadingStore(editor)
  useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot)
  return store.collapsedHeadingIds
}

export function blockHeadingLevel(block: CollapsibleBlock | undefined): number | null {
  if (block?.type !== 'heading') return null

  return normalizedHeadingLevel(block.props?.level)
}

function normalizedHeadingLevel(rawLevel: unknown): number | null {
  const level = headingLevelValue(rawLevel)
  return isValidHeadingLevel(level) ? level : null
}

function headingLevelValue(rawLevel: unknown) {
  if (typeof rawLevel === 'number') return rawLevel
  if (typeof rawLevel === 'string') return Number.parseInt(rawLevel, 10)
  return 1
}

function isListItemBlockType(type: unknown) {
  return typeof type === 'string' && COLLAPSIBLE_LIST_ITEM_TYPES.has(type)
}

function isCollapsibleListItemBlock(block: CollapsibleBlock | undefined) {
  return isListItemBlockType(block?.type)
    && Array.isArray(block?.children)
    && block.children.length > 0
}

function isCollapsibleSectionBlock(block: CollapsibleBlock | undefined) {
  return blockHeadingLevel(block) !== null || isCollapsibleListItemBlock(block)
}

function documentSectionEntries(
  blocks: readonly CollapsibleBlock[],
  depth = 0,
  entries: SectionEntry[] = [],
): SectionEntry[] {
  for (const block of blocks) {
    entries.push({
      depth,
      headingLevel: blockHeadingLevel(block),
      id: typeof block.id === 'string' ? block.id : undefined,
      isListItem: isListItemBlockType(block.type),
    })
    if (Array.isArray(block.children)) documentSectionEntries(block.children, depth + 1, entries)
  }

  return entries
}

function sectionClosesAt(section: ActiveCollapsedSection, entry: SectionEntry) {
  return isClosingHeading(entry.headingLevel, section.level)
    || (section.endDepth !== null && entry.depth <= section.endDepth)
}

/**
 * Walks the blocks in document order and reports each collapsed heading or
 * list item that hides something, and each hidden block with the outermost
 * one hiding it.
 */
function walkCollapsedSections(
  entries: readonly SectionEntry[],
  sections: CollapsedSections,
  report: {
    collapsed?: (blockId: string) => void
    hidden: (blockId: string, hiderId: string) => void
  },
) {
  let active: ActiveCollapsedSection | null = null
  const collapsedListItems: { depth: number; id: string }[] = []

  entries.forEach((entry, index) => {
    if (active && sectionClosesAt(active, entry)) active = null

    if (active) {
      if (entry.id) report.hidden(entry.id, active.id)
      if (entry.id !== undefined && entry.id === active.endId) active.endDepth = entry.depth
      return
    }

    while ((collapsedListItems.at(-1)?.depth ?? -1) >= entry.depth) collapsedListItems.pop()
    const hidingListItem = collapsedListItems.at(0)
    if (entry.id && hidingListItem) report.hidden(entry.id, hidingListItem.id)

    if (!entry.id || !sections.collapsedHeadingIds.has(entry.id)) return

    if (entry.headingLevel !== null) {
      const endId = sections.sectionEnds.get(entry.id)
      active = {
        endDepth: endId === entry.id ? entry.depth : null,
        endId,
        id: entry.id,
        level: entry.headingLevel,
      }
      report.collapsed?.(entry.id)
      return
    }

    const hasChildren = (entries.at(index + 1)?.depth ?? -1) > entry.depth
    if (entry.isListItem && hasChildren) {
      collapsedListItems.push({ depth: entry.depth, id: entry.id })
      report.collapsed?.(entry.id)
    }
  })
}

function collapsedSectionRenderState(
  entries: readonly SectionEntry[],
  sections: CollapsedSections,
): CollapsedSectionRenderState {
  const state = emptyCollapsedSectionRenderState()
  walkCollapsedSections(entries, sections, {
    collapsed: (blockId) => state.collapsedHeadingIds.add(blockId),
    hidden: (blockId) => state.hiddenBlockIds.add(blockId),
  })
  return state
}

function cssString(value: string) {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\A ')
    .replace(/\r/g, '\\D ')}"`
}

function collapsedSectionContainer(editorElement: HTMLElement) {
  const container = editorElement.closest('.editor__blocknote-container')
  return container instanceof HTMLElement ? container : undefined
}

function collapsedSectionStyleScope(editorElement: HTMLElement) {
  const container = collapsedSectionContainer(editorElement)
  if (!container) return ''

  container.dataset.plumoCollapseScope ??= String(++collapsedSectionScopeSequence)
  return `[data-plumo-collapse-scope=${cssString(container.dataset.plumoCollapseScope)}]`
}

function collapsedSectionStyleElement(editorElement: HTMLElement) {
  const existingStyle = collapsedSectionStyleElements.get(editorElement)
  if (existingStyle) return existingStyle

  const styleElement = editorElement.ownerDocument.createElement('style')
  styleElement.setAttribute('data-plumo-collapsed-sections', 'true')
  editorElement.ownerDocument.head.appendChild(styleElement)
  collapsedSectionStyleElements.set(editorElement, styleElement)
  return styleElement
}

function blockOuterSelectorsForStyle(
  editorElement: HTMLElement,
  blockId: string,
  scope = collapsedSectionStyleScope(editorElement),
) {
  const prefix = scope ? `${scope} ` : ''
  const id = cssString(blockId)
  return [
    `${prefix}.bn-block-outer[data-id=${id}]`,
    `${prefix}[data-node-type="blockOuter"][data-id=${id}]`,
  ]
}

function headingDotsSelectorsForStyle(
  editorElement: HTMLElement,
  blockId: string,
  scope = collapsedSectionStyleScope(editorElement),
) {
  return blockOuterSelectorsForStyle(editorElement, blockId, scope)
    .map((selector) => (
      `${selector} .bn-block-content .bn-inline-content::after`
    ))
}

function headingDotsCssDeclarations() {
  return [
    'content: "...";',
    'display: inline-flex;',
    'align-items: center;',
    'justify-content: center;',
    'min-width: 34px;',
    'height: 24px;',
    'margin-inline-start: 10px;',
    'padding: 0 8px;',
    'border-radius: 8px;',
    'background: var(--surface-shade);',
    'color: var(--text-muted);',
    'transition: background-color 120ms ease, color 120ms ease;',
    'font-size: 0.5em;',
    'font-weight: 700;',
    'line-height: 1;',
    'vertical-align: middle;',
    'cursor: pointer;',
    'pointer-events: auto;',
  ].join('\n')
}

function headingDotsHoverCssDeclarations() {
  return [
    'background: var(--state-hover);',
    'color: var(--text-secondary);',
  ].join('\n')
}

function collapsedSectionStyleText(
  editorElement: HTMLElement,
  renderState: CollapsedSectionRenderState,
) {
  const hiddenSelectors = Array.from(renderState.hiddenBlockIds)
    .flatMap((blockId) => blockOuterSelectorsForStyle(editorElement, blockId))
  const collapsedHeadingSelectors = Array.from(renderState.collapsedHeadingIds)
    .flatMap((blockId) => headingDotsSelectorsForStyle(editorElement, blockId))
  const collapsedHeadingHoverSelectors = collapsedHeadingHoverRuleSelectors(editorElement, renderState)

  const rules: string[] = []
  if (hiddenSelectors.length > 0) {
    rules.push(`${hiddenSelectors.join(',\n')} {\ndisplay: none !important;\n}`)
  }
  if (collapsedHeadingSelectors.length > 0) {
    rules.push(`${collapsedHeadingSelectors.join(',\n')} {\n${headingDotsCssDeclarations()}\n}`)
  }
  if (collapsedHeadingHoverSelectors.length > 0) {
    rules.push(`${collapsedHeadingHoverSelectors.join(',\n')} {\n${headingDotsHoverCssDeclarations()}\n}`)
  }

  return rules.join('\n\n')
}

function collapsedHeadingHoverRuleSelectors(
  editorElement: HTMLElement,
  renderState: CollapsedSectionRenderState,
) {
  const scope = collapsedSectionStyleScope(editorElement)
  if (!scope) return []

  return Array.from(renderState.collapsedHeadingIds)
    .flatMap((blockId) => headingDotsSelectorsForStyle(
      editorElement,
      blockId,
      `${scope}[data-plumo-collapse-hover-id=${cssString(blockId)}]`,
    ))
}

function syncCollapsedSectionStyle(
  editorElement: HTMLElement,
  renderState: CollapsedSectionRenderState,
) {
  collapsedSectionStyleElement(editorElement).textContent = collapsedSectionStyleText(editorElement, renderState)
}

function renderedBlockElementById(editorElement: HTMLElement, blockId: string): HTMLElement | undefined {
  return renderedSectionBlockElements(editorElement)
    .find((element) => element.dataset.id === blockId)
}

function headingLevelFromRenderedBlock(element: HTMLElement): number | null {
  const headingContent = renderedHeadingContent(element)
  if (!headingContent) return null

  return headingDataLevel(headingContent) ?? headingTagLevel(headingContent) ?? 1
}

function renderedHeadingContent(element: HTMLElement) {
  const headingContent = element.querySelector('[data-content-type="heading"]')
  return headingContent instanceof HTMLElement ? headingContent : undefined
}

function headingDataLevel(headingContent: HTMLElement): number | undefined {
  const dataLevel = headingContent.dataset.level
  const parsedDataLevel = dataLevel ? Number.parseInt(dataLevel, 10) : Number.NaN
  return isValidHeadingLevel(parsedDataLevel) ? parsedDataLevel : undefined
}

function headingTagLevel(headingContent: HTMLElement): number | undefined {
  const headingElement = headingContent.querySelector('h1, h2, h3, h4, h5, h6')
  return HEADING_TAG_LEVELS.get(headingElement?.tagName.toLowerCase() ?? '')
}

function isValidHeadingLevel(level: number) {
  return Number.isInteger(level) && level >= 1 && level <= 6
}

function isRenderedListItemBlock(element: HTMLElement) {
  const contentType = element.querySelector('.bn-block-content')?.getAttribute('data-content-type')
  return isListItemBlockType(contentType)
}

function renderedChildBlockElements(element: HTMLElement) {
  const blockId = element.dataset.id
  if (!blockId) return []

  return Array.from(element.querySelectorAll(BLOCK_OUTER_SELECTOR))
    .filter((child): child is HTMLElement => (
      child instanceof HTMLElement && child.dataset.id !== blockId
    ))
}

function renderedListItemHasChildren(element: HTMLElement) {
  return isRenderedListItemBlock(element) && renderedChildBlockElements(element).length > 0
}

function emptyCollapsedSectionRenderState(): CollapsedSectionRenderState {
  return {
    collapsedHeadingIds: new Set(),
    hiddenBlockIds: new Set(),
  }
}

function isClosingHeading(headingLevel: number | null, activeCollapsedLevel: number) {
  return headingLevel !== null && headingLevel <= activeCollapsedLevel
}

function renderedBlockDepth(element: HTMLElement, blockElements: ReadonlySet<HTMLElement>) {
  let depth = 0
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (blockElements.has(parent)) depth += 1
  }
  return depth
}

function renderedSectionEntries(elements: readonly HTMLElement[]): SectionEntry[] {
  const blockElements = new Set(elements)
  return elements.map((element) => ({
    depth: renderedBlockDepth(element, blockElements),
    headingLevel: headingLevelFromRenderedBlock(element),
    id: element.dataset.id,
    isListItem: isRenderedListItemBlock(element),
  }))
}

function mergeCollapsedSectionRenderStates(...states: CollapsedSectionRenderState[]): CollapsedSectionRenderState {
  const merged = emptyCollapsedSectionRenderState()

  for (const state of states) {
    state.collapsedHeadingIds.forEach((blockId) => {
      merged.collapsedHeadingIds.add(blockId)
    })
    state.hiddenBlockIds.forEach((blockId) => {
      merged.hiddenBlockIds.add(blockId)
    })
  }

  return merged
}

// The Document and the rendered blocks both count: either can be a step behind the other.
function currentCollapsedSectionRenderState(
  editorElement: HTMLElement | null,
  sections: CollapsedSections,
  fallbackBlocks: readonly CollapsibleBlock[],
): CollapsedSectionRenderState {
  const blockElements = editorElement ? renderedSectionBlockElements(editorElement) : []
  return mergeCollapsedSectionRenderStates(
    fallbackBlocks.length > 0
      ? collapsedSectionRenderState(documentSectionEntries(fallbackBlocks), sections)
      : emptyCollapsedSectionRenderState(),
    blockElements.length > 0
      ? collapsedSectionRenderState(renderedSectionEntries(blockElements), sections)
      : emptyCollapsedSectionRenderState(),
  )
}

function applyCollapsedSectionRenderingToElement(
  editorElement: HTMLElement,
  sections: CollapsedSections,
  fallbackBlocks: readonly CollapsibleBlock[],
) {
  syncCollapsedSectionStyle(
    editorElement,
    currentCollapsedSectionRenderState(editorElement, sections, fallbackBlocks),
  )
}

function applyCollapsedSectionRenderingFromHeadingIds(
  editorElement: HTMLElement,
  sections: CollapsedSections,
  fallbackBlocks: readonly CollapsibleBlock[] = [],
) {
  applyCollapsedSectionRenderingToElement(editorElement, sections, fallbackBlocks)
}

function applyCollapsedSectionRendering(
  editor: RichEditor,
  sections: CollapsedSections,
) {
  const editorElement = editorBlockElement(editor)
  if (!editorElement) return

  applyCollapsedSectionRenderingToElement(
    editorElement,
    sections,
    editor.document as readonly CollapsibleBlock[],
  )
}

export function collapsedSectionHiddenBlockIds(editor: RichEditor): ReadonlySet<string> {
  const store = collapsedHeadingStore(editor)
  if (store.collapsedHeadingIds.size === 0) return new Set()

  return currentCollapsedSectionRenderState(
    editorBlockElement(editor),
    store,
    editor.document as readonly CollapsibleBlock[],
  ).hiddenBlockIds
}

export function isCollapsibleSectionBlockForEditor(
  editor: RichEditor,
  block: CollapsibleBlock | undefined,
) {
  if (isCollapsibleSectionBlock(block)) return true
  if (!block || !isListItemBlockType(block.type) || typeof block.id !== 'string') return false

  const editorElement = editorBlockElement(editor)
  const blockElement = editorElement ? renderedBlockElementById(editorElement, block.id) : undefined
  return Boolean(blockElement && renderedListItemHasChildren(blockElement))
}

function parseCssPixelLength(value: string) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function lastInlineContentRect(inlineContent: HTMLElement): DOMRect | undefined {
  const ownerDocument = inlineContent.ownerDocument
  const range = ownerDocument.createRange()
  range.selectNodeContents(inlineContent)
  const rect = Array.from(range.getClientRects())
    .filter((candidate) => candidate.width > 0 && candidate.height > 0)
    .at(-1)
  range.detach()

  return rect
}

function isCollapsedHeadingDotsHit(inlineContent: HTMLElement, clientX: number, clientY: number) {
  const ownerWindow = inlineContent.ownerDocument.defaultView
  if (!ownerWindow) return false

  const textRect = lastInlineContentRect(inlineContent)
  if (!textRect) return false

  const contentRect = inlineContent.getBoundingClientRect()
  const afterStyle = ownerWindow.getComputedStyle(inlineContent, '::after')
  const marginStart = parseCssPixelLength(afterStyle.getPropertyValue('margin-inline-start'))
  const dotsWidth = Math.max(
    parseCssPixelLength(afterStyle.width),
    parseCssPixelLength(afterStyle.minWidth),
  ) + parseCssPixelLength(afterStyle.paddingLeft) + parseCssPixelLength(afterStyle.paddingRight)
  const verticalSlop = 4
  const isRtl = ownerWindow.getComputedStyle(inlineContent).direction === 'rtl'
  const dotsStart = isRtl ? textRect.left - marginStart - dotsWidth : textRect.right + marginStart
  const dotsEnd = isRtl ? textRect.left - marginStart : dotsStart + dotsWidth

  return clientX >= dotsStart
    && clientX <= dotsEnd
    && clientY >= Math.min(textRect.top, contentRect.top) - verticalSlop
    && clientY <= Math.max(textRect.bottom, contentRect.bottom) + verticalSlop
}

function collapsedHeadingDotsHitAtPoint(
  editorElement: HTMLElement,
  store: CollapsedHeadingStore,
  clientX: number,
  clientY: number,
) {
  for (const blockElement of renderedSectionBlockElements(editorElement)) {
    const blockId = blockElement.dataset.id
    if (!blockId || !store.collapsedHeadingIds.has(blockId)) continue

    const inlineContent = blockElement.querySelector('.bn-block-content .bn-inline-content')
    if (!(inlineContent instanceof HTMLElement)) continue
    if (isCollapsedHeadingDotsHit(inlineContent, clientX, clientY)) return { blockId, inlineContent }
  }

  return undefined
}

function collapsedHeadingDotsHitFromEvent(
  editorElement: HTMLElement,
  store: CollapsedHeadingStore,
  event: MouseEvent,
) {
  return collapsedHeadingDotsHitAtPoint(editorElement, store, event.clientX, event.clientY)
    ?? collapsedHeadingDotsHitFromTarget(editorElement, store, event)
}

function collapsedHeadingDotsHitFromTarget(
  editorElement: HTMLElement,
  store: CollapsedHeadingStore,
  event: MouseEvent,
) {
  const inlineContent = inlineContentFromEventTarget(editorElement, event.target)
  if (!inlineContent) return undefined

  const blockElement = collapsedBlockElementForInlineContent(editorElement, inlineContent)
  if (!blockElement) return undefined

  const blockId = blockElement.dataset.id
  if (!blockId || !store.collapsedHeadingIds.has(blockId)) return undefined
  if (!isCollapsedHeadingDotsHit(inlineContent, event.clientX, event.clientY)) return undefined

  return { blockId, inlineContent }
}

function inlineContentFromEventTarget(editorElement: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Element)) return undefined

  const inlineContent = target.closest('.bn-inline-content')
  return inlineContent instanceof HTMLElement && editorElement.contains(inlineContent)
    ? inlineContent
    : undefined
}

function collapsedBlockElementForInlineContent(
  editorElement: HTMLElement,
  inlineContent: HTMLElement,
) {
  const blockElement = inlineContent.closest(BLOCK_OUTER_SELECTOR)
  return blockElement instanceof HTMLElement && editorElement.contains(blockElement)
    ? blockElement
    : undefined
}

function collapsedHeadingIdFromDotsEvent(
  editorElement: HTMLElement,
  store: CollapsedHeadingStore,
  event: MouseEvent,
) {
  return collapsedHeadingDotsHitFromEvent(editorElement, store, event)?.blockId
}

function expandCollapsedHeading(
  editorElement: HTMLElement,
  store: CollapsedHeadingStore,
  headingId: string,
  fallbackBlocks: readonly CollapsibleBlock[] = [],
) {
  const collapsedHeadingIds = new Set(store.collapsedHeadingIds)
  if (!collapsedHeadingIds.delete(headingId)) return

  store.collapsedHeadingIds = collapsedHeadingIds
  store.sectionEnds = withoutSectionEnd(store.sectionEnds, headingId)
  applyCollapsedSectionRenderingFromHeadingIds(editorElement, store, fallbackBlocks)
  store.emit()
}

function ensureCollapsedHeadingRenderer(
  editor: RichEditor,
  editorElement: HTMLElement,
  store = collapsedHeadingStore(editor),
) {
  if (headingCollapseRenderers.has(editorElement)) return

  const ownerWindow = editorElement.ownerDocument.defaultView
  if (!ownerWindow) return

  let frame: number | null = null
  const apply = () => { applyCollapsedSectionRenderingFromHeadingIds(
    editorElement,
    store,
    editor.document as readonly CollapsibleBlock[],
  ); }
  const scheduleApply = () => {
    if (frame !== null) return
    frame = ownerWindow.requestAnimationFrame(() => {
      frame = null
      apply()
    })
  }
  const mutationObserver = new ownerWindow.MutationObserver(scheduleApply)
  mutationObserver.observe(editorElement, {
    childList: true,
    subtree: true,
  })
  let hoveredDotsElement: HTMLElement | null = null
  const setHoveredDotsHit = (hit?: CollapsedHeadingDotsHit) => {
    if (hoveredDotsElement && hoveredDotsElement !== hit?.inlineContent) {
      hoveredDotsElement.style.removeProperty('cursor')
    }

    const container = collapsedSectionContainer(editorElement)
    if (container) {
      if (hit) container.dataset.plumoCollapseHoverId = hit.blockId
      else delete container.dataset.plumoCollapseHoverId
    }

    hoveredDotsElement = hit?.inlineContent ?? null
    if (hoveredDotsElement) {
      editorElement.style.setProperty('cursor', 'pointer')
      hoveredDotsElement.style.setProperty('cursor', 'pointer')
    } else {
      editorElement.style.removeProperty('cursor')
    }
  }
  const handleCollapsedHeadingMouseMove = (event: MouseEvent) => {
    setHoveredDotsHit(collapsedHeadingDotsHitFromEvent(editorElement, store, event))
  }
  const handleCollapsedHeadingMouseLeave = () => { setHoveredDotsHit(); }
  const handleCollapsedHeadingMouseDown = (event: MouseEvent) => {
    if (!collapsedHeadingIdFromDotsEvent(editorElement, store, event)) return

    event.preventDefault()
    event.stopPropagation()
  }
  const handleCollapsedHeadingClick = (event: MouseEvent) => {
    const headingId = collapsedHeadingIdFromDotsEvent(editorElement, store, event)
    if (!headingId) return

    event.preventDefault()
    event.stopPropagation()
    setHoveredDotsHit()
    expandCollapsedHeading(
      editorElement,
      store,
      headingId,
      editor.document as readonly CollapsibleBlock[],
    )
  }
  editorElement.addEventListener('mousemove', handleCollapsedHeadingMouseMove, true)
  editorElement.addEventListener('mouseleave', handleCollapsedHeadingMouseLeave, true)
  editorElement.addEventListener('mousedown', handleCollapsedHeadingMouseDown, true)
  editorElement.addEventListener('click', handleCollapsedHeadingClick, true)
  const unsubscribeStore = store.subscribe(scheduleApply)
  const unsubscribeEditorChange = editor.onChange(scheduleApply)
  const cleanup = () => {
    if (frame !== null) ownerWindow.cancelAnimationFrame(frame)
    mutationObserver.disconnect()
    setHoveredDotsHit()
    editorElement.removeEventListener('mousemove', handleCollapsedHeadingMouseMove, true)
    editorElement.removeEventListener('mouseleave', handleCollapsedHeadingMouseLeave, true)
    editorElement.removeEventListener('mousedown', handleCollapsedHeadingMouseDown, true)
    editorElement.removeEventListener('click', handleCollapsedHeadingClick, true)
    collapsedSectionStyleElements.get(editorElement)?.remove()
    collapsedSectionStyleElements.delete(editorElement)
    unsubscribeEditorChange()
    unsubscribeStore()
  }

  headingCollapseRenderers.set(editorElement, cleanup)
  apply()
}

function releaseCollapsedHeadingRenderer(editorElement: HTMLElement) {
  const cleanup = headingCollapseRenderers.get(editorElement)
  if (!cleanup) return

  cleanup()
  headingCollapseRenderers.delete(editorElement)
}

function withoutSectionEnd(sectionEnds: Map<string, string>, headingId: string) {
  if (!sectionEnds.has(headingId)) return sectionEnds

  const nextSectionEnds = new Map(sectionEnds)
  nextSectionEnds.delete(headingId)
  return nextSectionEnds
}

function toggledCollapsedHeadingIds(collapsedHeadingIds: ReadonlySet<string>, headingId: string) {
  const nextCollapsedHeadingIds = new Set(collapsedHeadingIds)
  if (nextCollapsedHeadingIds.has(headingId)) nextCollapsedHeadingIds.delete(headingId)
  else nextCollapsedHeadingIds.add(headingId)
  return nextCollapsedHeadingIds
}

function releaseCurrentCollapsedHeadingRenderer(editor: RichEditor) {
  const currentEditorElement = editorBlockElement(editor)
  if (currentEditorElement) releaseCollapsedHeadingRenderer(currentEditorElement)
}

function releaseCollapsedHeadingRendererForToggle(
  editor: RichEditor,
  editorElement: HTMLElement | undefined,
) {
  if (editorElement) releaseCollapsedHeadingRenderer(editorElement)
  else releaseCurrentCollapsedHeadingRenderer(editor)
}

function applyCollapsedHeadingToggleRendering(options: {
  editor: RichEditor
  editorElement?: HTMLElement
  store: CollapsedHeadingStore
}) {
  const { editor, editorElement, store } = options

  if (store.collapsedHeadingIds.size === 0) {
    releaseCollapsedHeadingRendererForToggle(editor, editorElement)
    return
  }

  if (!editorElement) {
    applyCollapsedSectionRendering(editor, store)
    return
  }

  ensureCollapsedHeadingRenderer(editor, editorElement, store)
  applyCollapsedSectionRenderingFromHeadingIds(
    editorElement,
    store,
    editor.document as readonly CollapsibleBlock[],
  )
}

function releaseAttachedCollapsedHeadingRenderer(controller: CollapsedHeadingRenderingController) {
  if (controller.attachedEditorElement) releaseCollapsedHeadingRenderer(controller.attachedEditorElement)
  controller.attachedEditorElement = null
}

function scheduleCollapsedHeadingController(
  controller: CollapsedHeadingRenderingController,
  attachController: () => void,
) {
  if (controller.frame !== null || !controller.ownerWindow) return
  controller.frame = controller.ownerWindow.requestAnimationFrame(attachController)
}

function cleanupCollapsedHeadingController(
  controller: CollapsedHeadingRenderingController,
  unsubscribeStore: () => void,
) {
  unsubscribeStore()
  if (controller.frame !== null && controller.ownerWindow) {
    controller.ownerWindow.cancelAnimationFrame(controller.frame)
  }
  releaseAttachedCollapsedHeadingRenderer(controller)
}

function attachCollapsedHeadingController(options: {
  attachController: () => void
  controller: CollapsedHeadingRenderingController
  editor: RichEditor
  store: CollapsedHeadingStore
}) {
  const { attachController, controller, editor, store } = options
  controller.frame = null

  if (store.collapsedHeadingIds.size === 0) {
    releaseAttachedCollapsedHeadingRenderer(controller)
    return
  }

  const editorElement = editorBlockElement(editor)
  if (!editorElement) {
    scheduleCollapsedHeadingController(controller, attachController)
    return
  }

  controller.attachedEditorElement = editorElement
  ensureCollapsedHeadingRenderer(editor, editorElement)
}

export function toggleCollapsedHeading(
  editor: RichEditor,
  headingId: string,
  editorElement?: HTMLElement,
) {
  const store = collapsedHeadingStore(editor)
  store.collapsedHeadingIds = toggledCollapsedHeadingIds(store.collapsedHeadingIds, headingId)
  store.sectionEnds = withoutSectionEnd(store.sectionEnds, headingId)
  applyCollapsedHeadingToggleRendering({ editor, editorElement, store })
  store.emit()
}

/** The collapsed heading or list item that keeps `targetId` out of sight, if one does: the outermost, which is in view. */
function collapsedBlockHiding(
  blocks: readonly CollapsibleBlock[],
  sections: CollapsedSections,
  targetId: string,
): string | null {
  let hiderId: string | null = null
  walkCollapsedSections(documentSectionEntries(blocks), sections, {
    hidden: (blockId, blockHiderId) => {
      if (blockId === targetId) hiderId ??= blockHiderId
    },
  })
  return hiderId
}

/**
 * Open whatever keeps a block out of sight, level by level: a collapsed
 * subsection inside a collapsed section takes two. Collapsing is view state,
 * held here and not in the Document, so this writes nothing to disk. For what
 * has to show a block it did not pick itself (find walking onto a match).
 */
export function expandSectionsHidingBlock(editor: RichEditor, blockId: string) {
  const store = collapsedHeadingStore(editor)
  // Each pass opens one level; the bound is only a guard against a Document that changes underneath.
  for (let pass = 0; pass < store.collapsedHeadingIds.size + 1; pass += 1) {
    const hider = collapsedBlockHiding(editor.document as readonly CollapsibleBlock[], store, blockId)
    if (!hider) return
    toggleCollapsedHeading(editor, hider)
  }
}

/** Whether the user collapsed this heading or list item. */
export function isCollapsedBlock(editor: RichEditor, blockId: string) {
  return collapsedHeadingStore(editor).collapsedHeadingIds.has(blockId)
}

/** The collapsed heading or list item, in view, that keeps `blockId` out of sight, if one does. */
export function collapsedSectionHiding(editor: RichEditor, blockId: string): string | null {
  const store = collapsedHeadingStore(editor)
  if (store.collapsedHeadingIds.size === 0) return null

  return collapsedBlockHiding(editor.document as readonly CollapsibleBlock[], store, blockId)
}

/**
 * Stops a collapsed heading's section after `lastBlockId` (and its children)
 * instead of at the next heading of its level, so what the Document places
 * after that block stays in view. The heading stays collapsed.
 */
export function endCollapsedSectionAfter(editor: RichEditor, headingId: string, lastBlockId: string) {
  const store = collapsedHeadingStore(editor)
  if (!store.collapsedHeadingIds.has(headingId) || store.sectionEnds.get(headingId) === lastBlockId) return

  store.sectionEnds = new Map(store.sectionEnds).set(headingId, lastBlockId)
  const editorElement = editorBlockElement(editor)
  if (editorElement) {
    applyCollapsedSectionRenderingFromHeadingIds(
      editorElement,
      store,
      editor.document as readonly CollapsibleBlock[],
    )
  }
  store.emit()
}

/**
 * The block before `blockId` at its own level, if the collapsed heading
 * `hiderId` hides it too: the block a section that hides `blockId` can end
 * after and leave `blockId` in view.
 */
function sectionEndBefore(
  blocks: readonly CollapsibleBlock[],
  hiderId: string,
  blockId: string,
): string | null {
  const entries = documentSectionEntries(blocks)
  const hiderIndex = entries.findIndex((entry) => entry.id === hiderId)
  const blockIndex = entries.findIndex((entry) => entry.id === blockId)
  const block = entries.at(blockIndex)
  if (hiderIndex < 0 || blockIndex < 0 || !block || entries[hiderIndex].headingLevel === null) return null

  for (let index = blockIndex - 1; index >= hiderIndex; index -= 1) {
    const entry = entries[index]
    if (entry.depth < block.depth) return null
    if (entry.depth === block.depth) return entry.id ?? null
  }

  return null
}

/**
 * A block moved or created just past a collapsed section falls inside it,
 * since a heading's section runs to the next heading of its level. End the
 * section before the block instead, so it keeps hiding what it hid and the
 * block stays in view. Where no section end can do that (the block lands among
 * a collapsed list item's children), the section opens.
 */
export function keepBlockOutOfCollapsedSections(editor: RichEditor, blockId: string) {
  const store = collapsedHeadingStore(editor)
  for (let pass = 0; pass < store.collapsedHeadingIds.size + 1; pass += 1) {
    const blocks = editor.document as readonly CollapsibleBlock[]
    const hiderId = collapsedBlockHiding(blocks, store, blockId)
    if (!hiderId) return

    const lastBlockId = sectionEndBefore(blocks, hiderId, blockId)
    if (lastBlockId) endCollapsedSectionAfter(editor, hiderId, lastBlockId)
    else toggleCollapsedHeading(editor, hiderId)
  }
}

export function useCollapsedHeadingRendering(editor: RichEditor) {
  useLayoutEffect(() => {
    const store = collapsedHeadingStore(editor)
    const controller: CollapsedHeadingRenderingController = {
      attachedEditorElement: null,
      frame: null,
      ownerWindow: typeof window === 'undefined' ? undefined : window,
    }
    const attachController = () => {
      attachCollapsedHeadingController({ attachController, controller, editor, store })
    }
    const scheduleAttachController = () => {
      scheduleCollapsedHeadingController(controller, attachController)
    }
    const unsubscribeStore = store.subscribe(scheduleAttachController)

    attachController()

    return () => {
      cleanupCollapsedHeadingController(controller, unsubscribeStore)
    }
  }, [editor])
}

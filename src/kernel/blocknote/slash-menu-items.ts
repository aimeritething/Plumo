import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core/extensions'
import {
  getDefaultReactSlashMenuItems,
  type DefaultReactSuggestionItem,
} from '@blocknote/react'
import { createElement } from 'react'
import {
  CalendarBlank,
  CalendarDots,
  CodeBlock,
  Clock,
  Copy,
  File,
  FlowArrow,
  ImageSquare,
  ListBullets,
  ListChecks,
  ListNumbers,
  Minus,
  Note,
  Pi,
  Paragraph,
  Quotes,
  ScribbleLoop,
  Smiley,
  SpeakerHigh,
  Table,
  TextHOne,
  TextHTwo,
  TextHThree,
  TextHFour,
  Video,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react'
import { trackEvent } from '@/lib/telemetry'
import { CALLOUT_BLOCK_TYPE, calloutHeading } from '@/kernel/markdown/callout-markdown'
import {
  OBSIDIAN_CALLOUT_DEFINITIONS,
  type ObsidianCalloutType,
} from './callout-catalog'
import { HTML_BLOCK_DEFAULT_HEIGHT, HTML_BLOCK_TYPE } from '@/kernel/markdown/html-block-markdown'
import { MATH_BLOCK_TYPE } from '@/kernel/markdown/math-markdown'
import { MERMAID_BLOCK_TYPE, mermaidFenceSource } from '@/kernel/markdown/mermaid-markdown'
import { TLDRAW_BLOCK_TYPE, TLDRAW_DEFAULT_HEIGHT } from '@/kernel/markdown/tldraw-markdown'
import { calloutIconForType } from './callout-icons'
import type { RichEditor } from './block-note-dom'
import { duplicateBlocksAndSelect } from './rich-editor-duplicate-blocks'

export type SlashMenuItem = DefaultReactSuggestionItem & {
  key: string
  submenuItems?: SlashMenuItem[]
}
type SlashInsertEditor = {
  insertInlineContent: (content: string, options: { updateSelection: true }) => void
}
type SlashBlockEditor = Parameters<typeof insertOrUpdateBlockForSlashMenu>[0]
type SlashBlock = Parameters<typeof insertOrUpdateBlockForSlashMenu>[1]
type BlockSlashMenuItemConfig = {
  aliases: string[]
  eventName?: string
  key: string
  props: Record<string, unknown>
  title: string
  type: string
}
type SlashMenuLabels = {
  calloutTitle: string
  calloutTypeTitles: Record<ObsidianCalloutType, string>
  dateTitle: string
  datetimeTitle: string
  duplicateTitle: string
  sandboxBlockTitle: string
  mathTitle: string
  timeTitle: string
}
type DateTimeSlashCommandKind = 'date' | 'datetime' | 'time'
type DateTimeSlashMenuLabels = Pick<
  SlashMenuLabels,
  'dateTitle' | 'datetimeTitle' | 'timeTitle'
>
type DateProvider = () => Date

export const MERMAID_SLASH_COMMAND_DIAGRAM = [
  'flowchart TD',
  '    edit["Switch to the raw editor to edit"]',
].join('\n')
export const MATH_SLASH_COMMAND_LATEX = '\\sqrt{a^2 + b^2}'
export const HTML_SLASH_COMMAND_SOURCE = ''

const UNSUPPORTED_SLASH_MENU_KEYS = new Set([
  'heading_5',
  'heading_6',
  'toggle_heading',
  'toggle_heading_2',
  'toggle_heading_3',
  'toggle_list',
])

const SLASH_MENU_ICONS: Partial<Record<string, PhosphorIcon>> = {
  audio: SpeakerHigh,
  bullet_list: ListBullets,
  callout: Note,
  check_list: ListChecks,
  code_block: CodeBlock,
  date: CalendarBlank,
  datetime: CalendarDots,
  divider: Minus,
  duplicate: Copy,
  emoji: Smiley,
  file: File,
  heading: TextHOne,
  heading_2: TextHTwo,
  heading_3: TextHThree,
  heading_4: TextHFour,
  html: CodeBlock,
  image: ImageSquare,
  math: Pi,
  mermaid: FlowArrow,
  numbered_list: ListNumbers,
  paragraph: Paragraph,
  quote: Quotes,
  table: Table,
  time: Clock,
  toggle_heading: TextHOne,
  toggle_heading_2: TextHTwo,
  toggle_heading_3: TextHThree,
  toggle_list: ListBullets,
  video: Video,
  whiteboard: ScribbleLoop,
}

const DEFAULT_CALLOUT_TYPE_TITLES = Object.fromEntries(
  OBSIDIAN_CALLOUT_DEFINITIONS.map(({ type }) => [type, calloutHeading(type, '')]),
) as Record<ObsidianCalloutType, string>

const DATE_TIME_SLASH_COMMANDS: ReadonlyArray<{
  aliases: string[]
  key: DateTimeSlashCommandKind
  labelKey: keyof DateTimeSlashMenuLabels
}> = [
  { key: 'date', labelKey: 'dateTitle', aliases: ['today'] },
  { key: 'time', labelKey: 'timeTitle', aliases: ['clock'] },
  {
    key: 'datetime',
    labelKey: 'datetimeTitle',
    aliases: ['datetime', 'timestamp', 'date time'],
  },
]

function padDateTimePart(value: number): string {
  return String(value).padStart(2, '0')
}

function formatLocalDateTime(date: Date, kind: DateTimeSlashCommandKind): string {
  const dateValue = [
    date.getFullYear(),
    padDateTimePart(date.getMonth() + 1),
    padDateTimePart(date.getDate()),
  ].join('-')
  const timeValue = [
    padDateTimePart(date.getHours()),
    padDateTimePart(date.getMinutes()),
  ].join(':')

  if (kind === 'date') return dateValue
  if (kind === 'time') return timeValue
  return `${dateValue} ${timeValue}`
}

export function createDateTimeSlashMenuItems(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
  labels: DateTimeSlashMenuLabels = {
    dateTitle: 'Date',
    datetimeTitle: 'Date and time',
    timeTitle: 'Time',
  },
  getCurrentDate: DateProvider = () => new Date(),
): SlashMenuItem[] {
  const inlineEditor = editor as unknown as SlashInsertEditor

  return DATE_TIME_SLASH_COMMANDS.map(({ aliases, key, labelKey }) => ({
    aliases,
    key,
    title: labels[labelKey],
    onItemClick: () => {
      inlineEditor.insertInlineContent(formatLocalDateTime(getCurrentDate(), key), {
        updateSelection: true,
      })
      trackEvent('editor_timestamp_slash_command_used', { kind: key })
    },
  } as SlashMenuItem))
}

/**
 * /duplicate copies the Block the slash menu was opened in, as the handle's
 * Duplicate does. The menu has cleared the typed query by the time it runs,
 * so the copy doesn't carry it.
 */
export function createDuplicateSlashMenuItem(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
  labels: Pick<SlashMenuLabels, 'duplicateTitle'> = { duplicateTitle: 'Duplicate' },
): SlashMenuItem {
  const richEditor = editor as unknown as RichEditor

  return {
    aliases: ['copy', 'clone'],
    key: 'duplicate',
    title: labels.duplicateTitle,
    onItemClick: () => {
      duplicateBlocksAndSelect(richEditor, [richEditor.getTextCursorPosition().block.id])
    },
  } as SlashMenuItem
}

/**
 * Puts a block where the slash menu was opened, the way BlockNote's own rows
 * do: an empty block becomes the new block, and a block that has text keeps
 * it and gets the new block below. Replacing the block outright would take
 * its text with it, and Autosave would write that loss to disk (AIM-502).
 */
function insertSlashMenuBlock(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
  block: { type: string; props: Record<string, unknown> },
): void {
  insertOrUpdateBlockForSlashMenu(editor as unknown as SlashBlockEditor, block as SlashBlock)
}

function createBoardId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `whiteboard-${Date.now().toString(36)}`
}

function createWhiteboardSlashMenuItem(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
): SlashMenuItem {
  return createBlockSlashMenuItem(editor, {
    key: 'whiteboard',
    title: 'Whiteboard',
    aliases: ['tldraw', 'drawing', 'canvas', 'sketch'],
    type: TLDRAW_BLOCK_TYPE,
    props: {
      boardId: createBoardId(),
      height: TLDRAW_DEFAULT_HEIGHT,
      snapshot: '{}',
      width: '',
    },
  })
}

function createMermaidSlashMenuItem(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
): SlashMenuItem {
  return createBlockSlashMenuItem(editor, {
    key: 'mermaid',
    title: 'Mermaid',
    aliases: ['diagram', 'flowchart', 'graph', 'chart'],
    type: MERMAID_BLOCK_TYPE,
    props: {
      diagram: MERMAID_SLASH_COMMAND_DIAGRAM,
      source: mermaidFenceSource({ diagram: MERMAID_SLASH_COMMAND_DIAGRAM }),
    },
  })
}

export function createMathSlashMenuItem(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
  labels: Pick<SlashMenuLabels, 'mathTitle'> = { mathTitle: 'Math' },
): SlashMenuItem {
  return createBlockSlashMenuItem(editor, {
    key: 'math',
    title: labels.mathTitle,
    aliases: ['equation', 'latex', 'formula', 'sqrt'],
    eventName: 'editor_math_slash_command_used',
    type: MATH_BLOCK_TYPE,
    props: {
      latex: MATH_SLASH_COMMAND_LATEX,
    },
  })
}

export function createSandboxBlockSlashMenuItem(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
  labels: Pick<SlashMenuLabels, 'sandboxBlockTitle'> = {
    sandboxBlockTitle: 'HTML block',
  },
): SlashMenuItem {
  return createBlockSlashMenuItem(editor, {
    key: 'html',
    title: labels.sandboxBlockTitle,
    aliases: ['embed', 'iframe', 'sandbox', 'html'],
    eventName: 'editor_html_block_slash_command_used',
    type: HTML_BLOCK_TYPE,
    props: {
      height: HTML_BLOCK_DEFAULT_HEIGHT,
      html: HTML_SLASH_COMMAND_SOURCE,
    },
  })
}

export function createCalloutSlashMenuItem(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
  labels: Pick<SlashMenuLabels, 'calloutTitle' | 'calloutTypeTitles'> = {
    calloutTitle: 'Callout',
    calloutTypeTitles: DEFAULT_CALLOUT_TYPE_TITLES,
  },
): SlashMenuItem {
  const submenuItems = OBSIDIAN_CALLOUT_DEFINITIONS.map(({ aliases, type }) => ({
    // The type's own name first: it is what `> [!tip]` says, whatever the title is translated to.
    aliases: [type, ...aliases],
    icon: createElement(calloutIconForType(type), {
      'aria-hidden': true,
      className: 'size-4.5',
      size: 18,
      weight: 'regular',
    }),
    key: `callout_${type}`,
    onItemClick: () => {
      insertSlashMenuBlock(editor, {
        type: CALLOUT_BLOCK_TYPE,
        props: { calloutType: type, title: '' },
      })
      trackEvent('editor_callout_slash_command_used', { type })
    },
    title: labels.calloutTypeTitles[type],
  } satisfies SlashMenuItem))

  return {
    aliases: ['admonition', 'alert', 'aside'],
    badge: '›',
    key: 'callout',
    onItemClick: () => {},
    submenuItems,
    title: labels.calloutTitle,
  } as SlashMenuItem
}

const CALLOUT_STYLE_QUERY_MIN_LENGTH = 2

/**
 * The callout styles a typed query names, as rows of their own: `/tip` and
 * `/warning` insert that callout without a trip through the submenu. A style
 * is found by the start of its name, of an Obsidian alias (`tldr`, `caution`)
 * or of its title. They stay out of the list otherwise: an empty query shows
 * the one Callout row, a single letter would bring in half the catalog, and
 * `/callout` is the parent row's. The title names the block, because a Quote
 * callout beside the Quote block would read as the same row twice.
 */
export function calloutStyleItemsForQuery(calloutItem: SlashMenuItem, query: string): SlashMenuItem[] {
  const needle = query.trim().toLowerCase()
  if (needle.length < CALLOUT_STYLE_QUERY_MIN_LENGTH) return []

  return (calloutItem.submenuItems ?? [])
    .filter((item) => [...(item.aliases ?? []), item.title].some((term) => term.toLowerCase().startsWith(needle)))
    .map((item) => ({ ...item, group: calloutItem.group, title: `${calloutItem.title}: ${item.title}` }))
}

/** The style rows go under the Callout row, or where it would be: with their group, so the group's label is not repeated. */
export function withCalloutStyleItems(matches: SlashMenuItem[], styleItems: SlashMenuItem[]): SlashMenuItem[] {
  if (styleItems.length === 0) return matches
  const group = styleItems[0].group
  const parentIndex = matches.findIndex((item) => item.key === 'callout')
  const lastInGroup = matches.map((item) => item.group).lastIndexOf(group)
  const at = parentIndex !== -1 ? parentIndex + 1 : lastInGroup + 1
  return [...matches.slice(0, at), ...styleItems, ...matches.slice(at)]
}

function createBlockSlashMenuItem(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
  config: BlockSlashMenuItemConfig,
): SlashMenuItem {
  return {
    key: config.key,
    title: config.title,
    aliases: config.aliases,
    group: 'Media',
    onItemClick: () => {
      insertSlashMenuBlock(editor, { type: config.type, props: config.props })
      if (config.eventName) trackEvent(config.eventName)
    },
  } as SlashMenuItem
}

/**
 * The slash menu shows one label per run of items sharing a group, so items
 * added to a group must sit inside that group's run; a run split in two
 * renders the label twice (and React warns on the duplicate key). Custom
 * items go after the last item of their group; a group not in the list is
 * appended.
 */
function lastIndexOfGroup(items: SlashMenuItem[], group: string): number {
  let lastIndex = -1
  items.forEach((item, index) => {
    if (item.group === group) lastIndex = index
  })
  return lastIndex
}

export function addItemsToGroup(
  items: SlashMenuItem[],
  group: string | undefined,
  newItems: SlashMenuItem[],
): SlashMenuItem[] {
  const nextItems = [...items]
  const lastIndex = group === undefined ? -1 : lastIndexOfGroup(nextItems, group)

  if (lastIndex === -1) {
    nextItems.push(...newItems)
    return nextItems
  }

  nextItems.splice(lastIndex + 1, 0, ...newItems)
  return nextItems
}

export function addItemsToMediaGroup(
  items: SlashMenuItem[],
  mediaItems: SlashMenuItem[],
): SlashMenuItem[] {
  return addItemsToGroup(items, items.find((item) => item.key === 'image')?.group ?? 'Media', mediaItems)
}

/**
 * A menu icon that swaps from the regular to the filled weight while its row
 * is highlighted: the row carries `group`, the two icons sit on top of each
 * other and trade opacity on the group's hover and aria-selected.
 */
export function createSlashMenuIcon(Icon: PhosphorIcon) {
  return createElement(
    'span',
    { className: 'relative inline-flex size-5 items-center justify-center' },
    createElement(Icon, {
      'aria-hidden': true,
      className: 'size-4.5 group-hover:opacity-0 group-aria-selected:opacity-0',
      size: 18,
      weight: 'regular',
    }),
    createElement(Icon, {
      'aria-hidden': true,
      className: 'absolute inset-0 size-4.5 opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100',
      size: 18,
      weight: 'fill',
    }),
  )
}

export function filterSlashMenuItems<T extends SlashMenuItem>(
  items: T[],
): T[] {
  return items
    .filter((item) => !UNSUPPORTED_SLASH_MENU_KEYS.has(item.key))
    .map((item) => {
      const IconComponent = SLASH_MENU_ICONS[item.key]

      return {
        ...item,
        icon: IconComponent ? createSlashMenuIcon(IconComponent) : item.icon,
        subtext: undefined,
      }
    }) as T[]
}

export function getSlashMenuItems(
  editor: Parameters<typeof getDefaultReactSlashMenuItems>[0],
  query: string,
  labels?: SlashMenuLabels,
) {
  const defaultItems = getDefaultReactSlashMenuItems(editor) as SlashMenuItem[]
  const otherGroup = defaultItems.find((item) => item.key === 'emoji')?.group
  const quoteIndex = defaultItems.findIndex(item => item.key === 'quote')
  const calloutItem = {
    ...createCalloutSlashMenuItem(editor, labels),
    group: defaultItems.at(quoteIndex)?.group,
  }
  defaultItems.splice(quoteIndex === -1 ? 0 : quoteIndex + 1, 0, calloutItem)
  const dateTimeItems = createDateTimeSlashMenuItems(editor, labels).map((item) => ({
    ...item,
    group: otherGroup,
  }))
  const items = addItemsToGroup(
    addItemsToMediaGroup(
      defaultItems,
      [
        createMermaidSlashMenuItem(editor),
        createMathSlashMenuItem(editor, labels),
        createSandboxBlockSlashMenuItem(editor, labels),
        createWhiteboardSlashMenuItem(editor),
      ],
    ),
    otherGroup,
    [...dateTimeItems, { ...createDuplicateSlashMenuItem(editor, labels), group: otherGroup }],
  )

  const matches = filterSuggestionItems(
    filterSlashMenuItems(
      items,
    ),
    query,
  )
  return withCalloutStyleItems(matches, calloutStyleItemsForQuery(calloutItem, query))
}

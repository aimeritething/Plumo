import { BlockNoteEditor } from '@blocknote/core'
import { Children, isValidElement, type ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/telemetry', () => ({
  trackEvent: vi.fn(),
}))
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => `asset://localhost/${encodeURIComponent(path)}`,
}))

import {
  addItemsToGroup,
  addItemsToMediaGroup,
  calloutStyleItemsForQuery,
  createCalloutSlashMenuItem,
  withCalloutStyleItems,
  type SlashMenuItem,
  createDateTimeSlashMenuItems,
  createSandboxBlockSlashMenuItem,
  createMathSlashMenuItem,
  filterSlashMenuItems,
  getSlashMenuItems,
  HTML_SLASH_COMMAND_SOURCE,
  MATH_SLASH_COMMAND_LATEX,
  MERMAID_SLASH_COMMAND_DIAGRAM,
} from './slash-menu-items'
import { HTML_BLOCK_DEFAULT_HEIGHT, HTML_BLOCK_TYPE } from '@/kernel/markdown/html-block-markdown'
import { trackEvent } from '@/lib/telemetry'
import { MATH_BLOCK_TYPE } from '@/kernel/markdown/math-markdown'
import { mermaidFenceSource } from '@/kernel/markdown/mermaid-markdown'
import { CALLOUT_BLOCK_TYPE } from '@/kernel/markdown/callout-markdown'
import type { ObsidianCalloutType } from './callout-catalog'
import { calloutIconForType } from './callout-icons'
import { schema } from './editor-schema'

function createSlashCommandEditorFixture() {
  const editor = {
    insertInlineContent: () => {},
    replaceBlocks: () => {},
  }

  return {
    editor: editor as never,
    insertInlineContent: vi.spyOn(editor, 'insertInlineContent'),
    replaceBlocks: vi.spyOn(editor, 'replaceBlocks'),
  }
}

/** A Document of one paragraph, the cursor at its end: where the slash menu has just closed. */
function createEditorAtEndOf(text: string) {
  const editor = BlockNoteEditor.create({
    initialContent: [{ type: 'paragraph', content: text }],
    schema,
  })
  editor.setTextCursorPosition(editor.document[0], 'end')
  return editor
}

function blockTypes(editor: ReturnType<typeof createEditorAtEndOf>): string[] {
  return editor.document.map((block) => block.type)
}

describe('slash menu items', () => {
  it('filters unsupported toggle slash-menu variants and removes command descriptions', () => {
    type SlashMenuTestItem = {
      key: string
      title: string
      onItemClick: () => void
      subtext?: string
      icon?: ReactElement
    }

    const items = filterSlashMenuItems([
      { key: 'toggle_heading', title: 'Toggle heading', onItemClick: () => {} },
      { key: 'toggle_list', title: 'Toggle list', onItemClick: () => {} },
      { key: 'heading', title: 'Heading', subtext: 'Default heading copy', onItemClick: () => {} },
      { key: 'heading_4', title: 'Heading 4', onItemClick: () => {} },
      { key: 'bullet_list', title: 'Bullet List', subtext: 'Default list copy', onItemClick: () => {} },
      { key: 'code_block', title: 'Code Block', subtext: 'Default code copy', onItemClick: () => {} },
      { key: 'heading_5', title: 'Heading 5', onItemClick: () => {} },
      { key: 'heading_6', title: 'Heading 6', onItemClick: () => {} },
    ] satisfies SlashMenuTestItem[])

    expect(items.map((item) => item.key)).toEqual([
      'heading',
      'heading_4',
      'bullet_list',
      'code_block',
    ])
    expect(items.map((item) => item.subtext)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ])
  })

  it('wraps slash-menu icons so hover can swap Phosphor weights', () => {
    type SlashMenuTestItem = {
      key: string
      title: string
      onItemClick: () => void
      icon?: ReactElement
    }

    const items = filterSlashMenuItems([
      { key: 'heading', title: 'Heading', onItemClick: () => {} },
    ] satisfies SlashMenuTestItem[])
    const icon = items[0]?.icon

    expect(isValidElement(icon)).toBe(true)
    if (!isValidElement<{ className?: string; children?: ReactElement[] }>(icon)) return

    const iconChildren = Children.toArray(icon.props.children) as Array<
      ReactElement<{ className?: string; weight?: string }>
    >
    expect(icon.props.className).toBe('relative inline-flex size-5 items-center justify-center')
    expect(iconChildren.map((child) => child.props.className)).toEqual([
      'size-4.5 group-hover:opacity-0 group-aria-selected:opacity-0',
      'absolute inset-0 size-4.5 opacity-0 group-hover:opacity-100 group-aria-selected:opacity-100',
    ])
    expect(iconChildren.map((child) => child.props.weight)).toEqual([
      'regular',
      'fill',
    ])
  })

  it('keeps custom media slash-menu commands searchable', () => {
    const expectedCommands = [
      { key: 'mermaid', title: 'Mermaid', aliases: ['diagram', 'flowchart', 'graph', 'chart', 'sequence', 'gantt'] },
      { key: 'math', title: 'Math', aliases: ['equation', 'latex', 'formula', 'sqrt', 'katex', 'tex'] },
      { key: 'html', title: 'HTML block', aliases: ['embed', 'iframe', 'sandbox', 'html', 'svg', 'widget'] },
      { key: 'whiteboard', title: 'Whiteboard', aliases: ['tldraw', 'drawing', 'canvas', 'sketch', 'draw', 'board'] },
    ]
    const items = filterSlashMenuItems(expectedCommands.map((item) => ({
      ...item,
      onItemClick: () => {},
    })))

    expect(items.map(({ aliases, key, title }) => ({ aliases, key, title }))).toEqual(
      expectedCommands,
    )
    expect(items.map((item) => isValidElement(item.icon))).toEqual([true, true, true, true])
  })

  it('uses a valid placeholder diagram for new Mermaid blocks', () => {
    expect(MERMAID_SLASH_COMMAND_DIAGRAM).toBe([
      'flowchart TD',
      '    edit["Switch to the raw editor to edit"]',
    ].join('\n'))
    expect(mermaidFenceSource({ diagram: MERMAID_SLASH_COMMAND_DIAGRAM })).toBe([
      '```mermaid',
      'flowchart TD',
      '    edit["Switch to the raw editor to edit"]',
      '```',
    ].join('\n'))
  })

  it('keeps a group in one run when another group sits between it and the last group', () => {
    // A run split in two renders the group label twice and duplicates the key.
    const item = (key: string, group: string) => ({ key, title: key, group, onItemClick: () => {} })
    const withMedia = addItemsToMediaGroup(
      [item('image', 'Media'), item('heading_4', 'Subheadings'), item('emoji', 'Others')],
      [item('mermaid', 'Media')],
    )
    expect(withMedia.map((entry) => entry.key)).toEqual(['image', 'mermaid', 'heading_4', 'emoji'])

    const withOthers = addItemsToGroup(withMedia, 'Others', [item('date', 'Others')])
    expect(withOthers.map((entry) => entry.key)).toEqual(['image', 'mermaid', 'heading_4', 'emoji', 'date'])

    expect(addItemsToGroup(withMedia, undefined, [item('date', 'Others')]).at(-1)?.key).toBe('date')
  })

  it('places custom media commands before the existing non-media slash-menu group', () => {
    type SlashMenuTestItem = {
      key: string
      title: string
      group: string
      onItemClick: () => void
    }

    const items = addItemsToMediaGroup([
      { key: 'image', title: 'Image', group: 'Media', onItemClick: () => {} },
      { key: 'file', title: 'File', group: 'Media', onItemClick: () => {} },
      { key: 'emoji', title: 'Emoji', group: 'Others', onItemClick: () => {} },
    ] satisfies SlashMenuTestItem[], [
      {
        key: 'mermaid',
        title: 'Mermaid',
        group: 'Media',
        onItemClick: () => {},
      },
      {
        key: 'math',
        title: 'Math',
        group: 'Media',
        onItemClick: () => {},
      },
      {
        key: 'html',
        title: 'HTML block',
        group: 'Media',
        onItemClick: () => {},
      },
      {
        key: 'whiteboard',
        title: 'Whiteboard',
        group: 'Media',
        onItemClick: () => {},
      },
    ])

    expect(items.map(item => item.key)).toEqual([
      'image',
      'file',
      'mermaid',
      'math',
      'html',
      'whiteboard',
      'emoji',
    ])
  })

  it('creates an empty HTML block slash command for immediate source editing', () => {
    const editor = createEditorAtEndOf('')

    const sandboxItem = createSandboxBlockSlashMenuItem(editor, {
      sandboxBlockTitle: 'HTML block',
    })

    expect(sandboxItem).toEqual(expect.objectContaining({
      key: 'html',
      title: 'HTML block',
      aliases: ['embed', 'iframe', 'sandbox', 'html', 'svg', 'widget'],
    }))

    sandboxItem?.onItemClick()

    expect(editor.document[0]).toEqual(expect.objectContaining({
      type: HTML_BLOCK_TYPE,
      props: expect.objectContaining({
        height: HTML_BLOCK_DEFAULT_HEIGHT,
        html: HTML_SLASH_COMMAND_SOURCE,
      }),
    }))
    expect(trackEvent).toHaveBeenCalledWith('editor_html_block_slash_command_used')
  })

  it('creates a math slash command with a default display equation', () => {
    const editor = createEditorAtEndOf('')

    const mathItem = createMathSlashMenuItem(editor)

    expect(mathItem).toEqual(expect.objectContaining({
      key: 'math',
      title: 'Math',
      aliases: ['equation', 'latex', 'formula', 'sqrt', 'katex', 'tex'],
    }))

    mathItem?.onItemClick()

    expect(editor.document[0]).toEqual(expect.objectContaining({
      type: MATH_BLOCK_TYPE,
      props: expect.objectContaining({ latex: MATH_SLASH_COMMAND_LATEX }),
    }))
    expect(trackEvent).toHaveBeenCalledWith('editor_math_slash_command_used')
  })

  describe('where the block goes', () => {
    type Editor = ReturnType<typeof createEditorAtEndOf>
    const rows: Array<[string, string, (editor: Editor) => SlashMenuItem]> = [
      ['html', HTML_BLOCK_TYPE, (editor) => createSandboxBlockSlashMenuItem(editor)],
      ['math', MATH_BLOCK_TYPE, (editor) => createMathSlashMenuItem(editor)],
      ['callout', CALLOUT_BLOCK_TYPE, (editor) => calloutStyleItemsForQuery(createCalloutSlashMenuItem(editor), 'tip')[0]],
    ]

    it.each(rows)('%s replaces an empty paragraph, the one the slash was typed in', (_key, type, item) => {
      const editor = createEditorAtEndOf('')
      item(editor).onItemClick()
      expect(blockTypes(editor)[0]).toBe(type)
    })

    it.each(rows)('%s keeps the text of a paragraph that has some and goes below it (AIM-502)', (_key, type, item) => {
      const editor = createEditorAtEndOf('This Folder lives in memory.')
      item(editor).onItemClick()
      expect(blockTypes(editor).slice(0, 2)).toEqual(['paragraph', type])
      expect(editor.document[0].content).toEqual([
        { styles: {}, text: 'This Folder lives in memory.', type: 'text' },
      ])
    })
  })

  it('creates a callout parent command with every default style in its submenu', () => {
    const editor = createEditorAtEndOf('')
    const calloutTypeTitles = Object.fromEntries([
      'note',
      'abstract',
      'info',
      'todo',
      'tip',
      'success',
      'question',
      'warning',
      'failure',
      'danger',
      'bug',
      'example',
      'quote',
    ].map(type => [type, type])) as Record<ObsidianCalloutType, string>
    const calloutItem = createCalloutSlashMenuItem(editor, {
      calloutTitle: 'Callout',
      calloutTypeTitles,
    })

    expect(calloutItem).toEqual(expect.objectContaining({
      key: 'callout',
      title: 'Callout',
      aliases: ['admonition', 'alert', 'aside', 'box', 'banner'],
    }))
    expect(calloutItem.submenuItems?.map(item => item.key)).toEqual(
      Object.keys(calloutTypeTitles).map(type => `callout_${type}`),
    )

    calloutItem.submenuItems?.find(item => item.key === 'callout_tip')?.onItemClick()

    expect(editor.document[0]).toEqual(expect.objectContaining({
      type: CALLOUT_BLOCK_TYPE,
      props: expect.objectContaining({ calloutType: 'tip', title: '' }),
    }))
    expect(trackEvent).toHaveBeenCalledWith('editor_callout_slash_command_used', {
      type: 'tip',
    })
  })

  describe('searching by an Alias', () => {
    const editor = createEditorAtEndOf('')
    const keysFor = (query: string) => getSlashMenuItems(editor, query).map(item => item.key)

    it.each([
      ['separator', 'divider'],
      ['rule', 'divider'],
      ['hr', 'divider'],
      ['title', 'heading'],
      ['header', 'heading_2'],
      ['text', 'paragraph'],
      ['unordered', 'bullet_list'],
      ['ordered', 'numbered_list'],
      ['task', 'check_list'],
      ['citation', 'quote'],
      ['snippet', 'code_block'],
      ['grid', 'table'],
      ['photo', 'image'],
      ['movie', 'video'],
      ['music', 'audio'],
      ['attachment', 'file'],
      ['smiley', 'emoji'],
      ['gantt', 'mermaid'],
      ['katex', 'math'],
      ['svg', 'html'],
      ['draw', 'whiteboard'],
      ['now', 'datetime'],
      ['banner', 'callout'],
    ])('/%s finds %s', (query, key) => {
      expect(keysFor(query)).toContain(key)
    })

    it('matches anywhere in an Alias, whatever the case', () => {
      expect(keysFor('SEPAR')).toContain('divider')
      expect(keysFor('arat')).toContain('divider')
    })

    it('keeps BlockNote\'s own Aliases beside the added ones', () => {
      expect(keysFor('horizontal rule')).toContain('divider')
      expect(keysFor('blockquote')).toContain('quote')
    })

    it('forgives no misspelling', () => {
      expect(keysFor('seperator')).not.toContain('divider')
    })

    it('still lists a callout style only for the start of its name or Alias', () => {
      expect(keysFor('in').filter(key => key.startsWith('callout_'))).toEqual(['callout_info'])
    })
  })

  describe('callout styles in the top-level search', () => {
    const editor = createEditorAtEndOf('')
    const keysFor = (query: string) => calloutStyleItemsForQuery(createCalloutSlashMenuItem(editor), query).map(item => item.key)

    it('finds a style by its name, by the start of it, and by an alias', () => {
      expect(keysFor('tip')).toEqual(['callout_tip'])
      expect(keysFor('warn')).toEqual(['callout_warning'])
      expect(keysFor('TLDR')).toEqual(['callout_abstract'])
    })

    it('stays out of the way: nothing for an empty query, one letter, or the word callout itself', () => {
      expect(keysFor('')).toEqual([])
      expect(keysFor('t')).toEqual([])
      expect(keysFor('callout')).toEqual([])
    })

    it('names the block, so the Quote callout does not read like the Quote block', () => {
      const [item] = calloutStyleItemsForQuery(createCalloutSlashMenuItem(editor), 'quote')
      expect(item.title).toBe('Callout: Quote')
    })

    it('sits under the Callout row, or at the end of its group when that row is not a match', () => {
      const row = (key: string, group: string): SlashMenuItem => ({ key, group, title: key, onItemClick: () => {} })
      const tip = row('callout_tip', 'Basic blocks')

      expect(withCalloutStyleItems([row('quote', 'Basic blocks'), row('callout', 'Basic blocks'), row('table', 'Advanced')], [tip]).map(item => item.key))
        .toEqual(['quote', 'callout', 'callout_tip', 'table'])
      expect(withCalloutStyleItems([row('toggle', 'Basic blocks'), row('table', 'Advanced')], [tip]).map(item => item.key))
        .toEqual(['toggle', 'callout_tip', 'table'])
      expect(withCalloutStyleItems([row('table', 'Advanced')], [tip]).map(item => item.key))
        .toEqual(['callout_tip', 'table'])
    })

    it('inserts the style it names', () => {
      const [item] = calloutStyleItemsForQuery(createCalloutSlashMenuItem(editor), 'tip')
      item.onItemClick()
      expect(editor.document[0]).toEqual(expect.objectContaining({
        type: CALLOUT_BLOCK_TYPE,
        props: expect.objectContaining({ calloutType: 'tip' }),
      }))
    })
  })

  it('uses a distinct Phosphor icon for every default callout type', () => {
    const types: ObsidianCalloutType[] = [
      'note', 'abstract', 'info', 'todo', 'tip', 'success', 'question',
      'warning', 'failure', 'danger', 'bug', 'example', 'quote',
    ]

    expect(new Set(types.map(calloutIconForType)).size).toBe(types.length)
  })

  it('renders one Phosphor icon node for each callout submenu item', () => {
    const { editor } = createSlashCommandEditorFixture()
    const submenuItems = createCalloutSlashMenuItem(editor).submenuItems ?? []

    submenuItems.forEach((item) => {
      const type = item.key.replace('callout_', '')
      expect(isValidElement(item.icon)).toBe(true)
      expect((item.icon as ReactElement).type).toBe(calloutIconForType(type))
    })
  })

  it('inserts resolved local date and time values from slash commands', () => {
    const { editor, insertInlineContent, replaceBlocks } = createSlashCommandEditorFixture()
    const currentDate = new Date(2026, 6, 19, 14, 5)
    const items = createDateTimeSlashMenuItems(editor, {
      dateTitle: 'Date',
      datetimeTitle: 'Date and time',
      timeTitle: 'Time',
    }, () => currentDate)

    expect(items).toEqual([
      expect.objectContaining({ key: 'date', title: 'Date', aliases: ['today'] }),
      expect.objectContaining({ key: 'time', title: 'Time', aliases: ['clock'] }),
      expect.objectContaining({
        key: 'datetime',
        title: 'Date and time',
        aliases: ['datetime', 'timestamp', 'date time', 'now'],
      }),
    ])

    items.forEach((item) => {
      item.onItemClick()
    })

    expect(insertInlineContent).toHaveBeenNthCalledWith(1, '2026-07-19', {
      updateSelection: true,
    })
    expect(insertInlineContent).toHaveBeenNthCalledWith(2, '14:05', {
      updateSelection: true,
    })
    expect(insertInlineContent).toHaveBeenNthCalledWith(3, '2026-07-19 14:05', {
      updateSelection: true,
    })
    expect(replaceBlocks).not.toHaveBeenCalled()
    expect(trackEvent).toHaveBeenCalledWith('editor_timestamp_slash_command_used', {
      kind: 'date',
    })
    expect(trackEvent).toHaveBeenCalledWith('editor_timestamp_slash_command_used', {
      kind: 'time',
    })
    expect(trackEvent).toHaveBeenCalledWith('editor_timestamp_slash_command_used', {
      kind: 'datetime',
    })
  })
})

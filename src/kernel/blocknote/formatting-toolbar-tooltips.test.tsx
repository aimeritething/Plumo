import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TooltipProvider } from '@/ui/tooltip'
import { CreateLinkButton } from './create-link-button'
import { NestBlockButton, UnnestBlockButton } from './nest-block-buttons'
import { TextStyleToggle } from './text-style-toggle'

// Every formatting toolbar tooltip is one row: the label, then one Kbd chip
// per key of its shortcut. The toggles are Plumo's; the nest and link buttons
// are Plumo's in place of BlockNote's, which draw two lines of text.

const { showSelectionExtension } = vi.hoisted(() => ({
  showSelectionExtension: Symbol('ShowSelectionExtension'),
}))

const selectedBlock = {
  id: 'block',
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text: 'Selected' }],
}

const editor = {
  isEditable: true,
  schema: {
    styleSchema: { bold: { type: 'bold', propSchema: 'boolean' } },
    inlineContentSchema: { link: 'link' },
  },
  prosemirrorState: { selection: { from: 1, to: 5 } },
  domElement: document.createElement('div'),
  focus: vi.fn(),
  getActiveStyles: () => ({}),
  getSelection: () => ({ blocks: [selectedBlock] }),
  getTextCursorPosition: () => ({ block: selectedBlock }),
  getSelectedLinkUrl: () => undefined,
  getSelectedText: () => 'Selected',
  canNestBlock: () => true,
  canUnnestBlock: () => true,
  toggleStyles: vi.fn(),
}

vi.mock('@blocknote/react', () => ({
  EditLinkMenuItems: () => null,
  useBlockNoteEditor: () => editor,
  useComponentsContext: () => ({
    Generic: {
      Popover: {
        Root: ({ children }: { children?: ReactNode }) => <>{children}</>,
        Trigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
        Content: () => null,
      },
    },
  }),
  useDictionary: () => ({
    formatting_toolbar: {
      link: { tooltip: 'Create link' },
      nest: { tooltip: 'Nest block' },
      unnest: { tooltip: 'Unnest block' },
    },
  }),
  useEditorState: ({ selector }: { selector: (context: { editor: unknown }) => unknown }) => selector({ editor }),
  useExtension: (extension: unknown) => (
    extension === showSelectionExtension ? { showSelection: vi.fn() } : { store: { setState: vi.fn() } }
  ),
}))

vi.mock('@blocknote/core', () => ({
  isTableCellSelection: () => false,
}))

vi.mock('@blocknote/core/extensions', () => ({
  FormattingToolbarExtension: Symbol('FormattingToolbarExtension'),
  ShowSelectionExtension: showSelectionExtension,
}))

function tooltipAfterHover(name: string) {
  fireEvent.pointerMove(screen.getByRole('button', { name }), { pointerType: 'mouse' })
  act(() => {
    vi.advanceTimersByTime(400)
  })
  const tooltip = screen.getByRole('tooltip')
  return {
    text: tooltip.textContent,
    chips: Array.from(tooltip.querySelectorAll('kbd'), (chip) => chip.textContent),
  }
}

describe('formatting toolbar tooltips', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['Bold', <TextStyleToggle key="bold" textStyle="bold" />, ['⌘', 'B']],
    ['Nest block', <NestBlockButton key="nest" />, ['⇥']],
    ['Unnest block', <UnnestBlockButton key="unnest" />, ['⇧', '⇥']],
    ['Create link', <CreateLinkButton key="link" />, ['⌘', 'K']],
  ])('%s is the label and one chip per key', (label, button, chips) => {
    render(<TooltipProvider>{button}</TooltipProvider>)

    expect(tooltipAfterHover(label)).toEqual({ text: `${label} ${chips.join('')}`, chips })
  })
})

import { isTableCellSelection } from '@blocknote/core'
import { FormattingToolbarExtension, ShowSelectionExtension } from '@blocknote/core/extensions'
import {
  useBlockNoteEditor,
  useDictionary,
  useEditorState,
  useExtension,
} from '@blocknote/react'
import { LinkSimple } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@/ui/popover'
import { ToolbarButton } from '@/ui/toolbar'
import { SimpleTooltip } from '@/ui/tooltip'
import { getSelectedBlocksSafely, type FormattingToolbarEditor } from './formatting-toolbar-selection'
import { LinkForm } from './link-form'

// The Formatting toolbar's link button, its tooltip one row, label and
// shortcut chips, like the buttons beside it. It opens Plumo's link form
// (link-form.tsx) on a ui/ popover below it, the URL alone, as Notion's. The
// selection stays drawn while the popover is open, the popover closes when
// the selection changes, and ⌘K in the editor opens it. The window's ⌘K
// handler (shell/app-keyboard-shortcuts.ts) presses this button by its
// data-test.

const CREATE_LINK_SHORTCUT = '⌘K'

function editorSupportsLinks(editor: FormattingToolbarEditor) {
  return 'link' in editor.schema.inlineContentSchema
    && editor.schema.inlineContentSchema.link === 'link'
}

type CreateLinkState = ReturnType<typeof getCreateLinkState>

function getCreateLinkState(editor: FormattingToolbarEditor) {
  if (!editor.isEditable) return undefined
  if (!editorSupportsLinks(editor)) return undefined
  if (isTableCellSelection(editor.prosemirrorState.selection)) return undefined
  if (!getSelectedBlocksSafely(editor).some((block) => block.content !== undefined)) return undefined

  return {
    url: editor.getSelectedLinkUrl(),
    text: editor.getSelectedText(),
    range: {
      from: editor.prosemirrorState.selection.from,
      to: editor.prosemirrorState.selection.to,
    },
  }
}

// Compared by value: the selection state is rebuilt on every read.
function isSameCreateLinkState(a: CreateLinkState, b: CreateLinkState) {
  return a !== undefined && b !== undefined
    && a.url === b.url
    && a.text === b.text
    && a.range.from === b.range.from
    && a.range.to === b.range.to
}

export function CreateLinkButton() {
  const editor = useBlockNoteEditor() as FormattingToolbarEditor
  const dict = useDictionary()
  const formattingToolbar = useExtension(FormattingToolbarExtension)
  const { showSelection } = useExtension(ShowSelectionExtension)

  const state = useEditorState({
    editor,
    selector: ({ editor }) => getCreateLinkState(editor),
  })

  // Open for one selection state: a change of selection closes the popover
  // by leaving the state it was opened for behind (no effect needed).
  const [openedFor, setOpenedFor] = useState<CreateLinkState>(undefined)
  const opened = state !== undefined && isSameCreateLinkState(openedFor, state)
  const setOpened = useCallback((open: boolean) => {
    setOpenedFor(open ? state : undefined)
  }, [state])

  useEffect(() => {
    showSelection(opened, 'createLinkButton')
    return () => showSelection(false, 'createLinkButton')
  }, [opened, showSelection])

  useEffect(() => {
    const element = editor.domElement
    if (!element) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        setOpened(true)
        event.preventDefault()
      }
    }
    element.addEventListener('keydown', onKeyDown)
    return () => element.removeEventListener('keydown', onKeyDown)
  }, [editor.domElement, setOpened])

  const toggle = useCallback(() => setOpened(!opened), [opened, setOpened])

  if (state === undefined) return null

  const label = dict.formatting_toolbar.link.tooltip

  // The tooltip sits inside the popover trigger, so the popover's open / closed state is the one the button keeps.
  // Esc in the field goes on to the toolbar, which closes too and hands the
  // caret back to the text with the selection (formatting-toolbar-controller).
  return (
    <Popover
      open={opened}
      onOpenChange={(open, details) => {
        setOpened(open)
        if (details.reason === 'escape-key') details.allowPropagation()
      }}
    >
      <PopoverTrigger
        render={(
          <SimpleTooltip label={label} shortcut={CREATE_LINK_SHORTCUT}>
            <ToolbarButton
              aria-label={label}
              data-test="createLink"
              onClick={toggle}
            >
              <LinkSimple aria-hidden="true" />
            </ToolbarButton>
          </SimpleTooltip>
        )}
      />
      <PopoverContent align="start" variant="compact">
        <LinkForm
          key={`${state.range.from}:${state.range.to}`}
          onDone={() => formattingToolbar.store.setState(false)}
          range={state.range}
          showTextField={false}
          text={state.text}
          url={state.url ?? ''}
        />
      </PopoverContent>
    </Popover>
  )
}

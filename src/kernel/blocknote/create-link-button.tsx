import { isTableCellSelection } from '@blocknote/core'
import { FormattingToolbarExtension, ShowSelectionExtension } from '@blocknote/core/extensions'
import {
  EditLinkMenuItems,
  useBlockNoteEditor,
  useComponentsContext,
  useDictionary,
  useEditorState,
  useExtension,
} from '@blocknote/react'
import { LinkSimple } from '@phosphor-icons/react'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { getSelectedBlocksSafely, type FormattingToolbarEditor } from './formatting-toolbar-selection'

// The formatting toolbar's link button, Plumo's own in place of BlockNote's
// so the tooltip is one row, label and shortcut chips, like the buttons beside
// it. The popover and the link form inside it are BlockNote's
// (EditLinkMenuItems through the shadcn components), as is the rest: the
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

export function CreateLinkButton() {
  const editor = useBlockNoteEditor() as FormattingToolbarEditor
  const Components = useComponentsContext()
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
  const opened = state !== undefined && openedFor === state
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

  if (state === undefined || !Components) return null

  const label = dict.formatting_toolbar.link.tooltip

  // The tooltip trigger is the popover trigger's child, so the popover's open / closed data-state is the one the button keeps.
  return (
    <Components.Generic.Popover.Root open={opened} onOpenChange={setOpened}>
      <Tooltip>
        <Components.Generic.Popover.Trigger>
          <TooltipTrigger asChild>
            <Button
              aria-label={label}
              className="min-w-7 px-2"
              data-test="createLink"
              onClick={toggle}
              size="default"
              variant="ghost"
            >
              <LinkSimple aria-hidden="true" />
            </Button>
          </TooltipTrigger>
        </Components.Generic.Popover.Trigger>
        <TooltipContent shortcut={CREATE_LINK_SHORTCUT}>{label}</TooltipContent>
      </Tooltip>
      <Components.Generic.Popover.Content className="bn-popover-content bn-form-popover" variant="form-popover">
        <EditLinkMenuItems
          range={state.range}
          setToolbarOpen={(open) => formattingToolbar.store.setState(open)}
          showTextField={false}
          text={state.text}
          url={state.url ?? ''}
        />
      </Components.Generic.Popover.Content>
    </Components.Generic.Popover.Root>
  )
}

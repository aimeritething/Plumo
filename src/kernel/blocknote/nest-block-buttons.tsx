import { useBlockNoteEditor, useDictionary, useEditorState } from '@blocknote/react'
import { TextIndent, TextOutdent } from '@phosphor-icons/react'
import { useCallback } from 'react'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { getSelectedBlocksSafely, type FormattingToolbarEditor } from './formatting-toolbar-selection'

// The formatting toolbar's nest and unnest buttons, Plumo's own in place of
// BlockNote's so the tooltip is one row, label and shortcut chip, like the text
// style toggles beside them. What they do is BlockNote's: nestBlock /
// unnestBlock, on the toggles' selection rule (some selected block has inline
// content), disabled when the editor says the block cannot move. The labels
// are BlockNote's dictionary's, as the link toolbar's.

function selectionSupportsNesting(editor: FormattingToolbarEditor) {
  return editor.isEditable
    && getSelectedBlocksSafely(editor).some((block) => block.content !== undefined)
}

function NestingButton({
  disabled,
  icon,
  label,
  onClick,
  shortcut,
  testId,
}: {
  disabled: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
  shortcut: string
  testId: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={label}
          className="min-w-7 px-2"
          data-test={testId}
          disabled={disabled}
          onClick={onClick}
          size="default"
          variant="ghost"
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent shortcut={shortcut}>{label}</TooltipContent>
    </Tooltip>
  )
}

export function NestBlockButton() {
  const editor = useBlockNoteEditor() as FormattingToolbarEditor
  const dict = useDictionary()
  const canNest = useEditorState({
    editor,
    selector: ({ editor }) => (selectionSupportsNesting(editor) ? editor.canNestBlock() : undefined),
  })

  const nestBlock = useCallback(() => {
    if (!canNest) return
    editor.focus()
    editor.nestBlock()
  }, [canNest, editor])

  if (canNest === undefined) return null

  return (
    <NestingButton
      disabled={!canNest}
      icon={<TextIndent aria-hidden="true" />}
      label={dict.formatting_toolbar.nest.tooltip}
      onClick={nestBlock}
      shortcut="⇥"
      testId="nestBlock"
    />
  )
}

export function UnnestBlockButton() {
  const editor = useBlockNoteEditor() as FormattingToolbarEditor
  const dict = useDictionary()
  const canUnnest = useEditorState({
    editor,
    selector: ({ editor }) => (selectionSupportsNesting(editor) ? editor.canUnnestBlock() : undefined),
  })

  const unnestBlock = useCallback(() => {
    if (!canUnnest) return
    editor.focus()
    editor.unnestBlock()
  }, [canUnnest, editor])

  if (canUnnest === undefined) return null

  return (
    <NestingButton
      disabled={!canUnnest}
      icon={<TextOutdent aria-hidden="true" />}
      label={dict.formatting_toolbar.unnest.tooltip}
      onClick={unnestBlock}
      shortcut="⇧⇥"
      testId="unnestBlock"
    />
  )
}

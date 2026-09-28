import { createReactBlockSpec, createReactInlineContentSpec } from '@blocknote/react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'
import { MATH_BLOCK_TYPE, MATH_INLINE_TYPE, renderMathToHtml } from '@/kernel/markdown/math-markdown'
import { Button } from '@/ui/button'
import { Textarea } from '@/ui/textarea'
import { dispatchRichEditorExternalChange } from './editor-external-change-events'
import {
  isStaleBlockReferenceError,
  reportRecoveredEditorTransformError,
} from './rich-editor-transform-error-recovery-extension'
import { SafeHtmlSpan } from './safe-markup'

export const MATH_BLOCK_CONFIG = {
  type: MATH_BLOCK_TYPE,
  propSchema: {
    latex: { default: '' },
  },
  content: 'none',
} as const

export const MATH_INLINE_CONFIG = {
  type: MATH_INLINE_TYPE,
  propSchema: {
    latex: { default: '' },
  },
  content: 'none',
} as const

function MathRender({ latex, displayMode }: { latex: string; displayMode: boolean }) {
  const source = displayMode ? `$$\n${latex}\n$$` : `$${latex}$`
  return (
    <SafeHtmlSpan
      aria-label={`Math: ${latex}`}
      className={cn(
        'cursor-text text-text-document',
        displayMode ? 'block min-w-max text-center' : 'inline-flex max-w-full align-baseline',
      )}
      data-latex={latex}
      data-math-mode={displayMode ? 'block' : 'inline'}
      markup={renderMathToHtml({ latex, displayMode })}
      role="img"
      title={source}
    />
  )
}

type MathBlockEditorProps = {
  block: {
    id: string
    props: {
      latex: string
    }
  }
  editor: {
    domElement?: EventTarget | null
    focus?: () => void
    updateBlock: (blockId: string, update: { props: { latex: string } }) => void
  }
}

function stopMathEditorEvent(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}

function isCommandModifierPressed(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return event.metaKey || event.ctrlKey
}

function isCommitMathEditShortcut(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
  return event.key === 'Enter' && isCommandModifierPressed(event)
}

function updateMathBlockLatexSafely(
  editor: MathBlockEditorProps['editor'],
  blockId: string,
  latex: string,
) {
  try {
    editor.updateBlock(blockId, { props: { latex } })
    return true
  } catch (error) {
    if (!isStaleBlockReferenceError(error)) throw error

    reportRecoveredEditorTransformError('stale_block_reference', error)
    return false
  }
}

// The shell: at rest a ghost Button as wide as the formula, centred, scrolling
// a wide formula sideways; while editing a full-width box around the source.
const MATH_SHELL_CLASS = 'max-w-full overflow-x-auto py-1.5'

export function MathBlockEditor({ block, editor }: MathBlockEditorProps) {
  const currentLatex = block.props.latex
  const editingSessionRef = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [draftLatex, setDraftLatex] = useState(currentLatex)
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    if (!editing) return
    textareaRef.current?.focus()
    textareaRef.current?.select()
  }, [editing])

  const startEditing = (event: { preventDefault: () => void; stopPropagation: () => void }) => {
    event.preventDefault()
    event.stopPropagation()
    setDraftLatex(currentLatex)
    editingSessionRef.current = true
    setEditing(true)
  }

  const finishEditing = () => {
    if (!editingSessionRef.current) return
    editingSessionRef.current = false
    setEditing(false)
    if (draftLatex !== currentLatex) {
      const updated = updateMathBlockLatexSafely(editor, block.id, draftLatex)
      if (updated) dispatchRichEditorExternalChange(editor, editor.domElement ?? undefined)
    }
    editor.focus?.()
  }

  const cancelEditing = () => {
    if (!editingSessionRef.current) return
    editingSessionRef.current = false
    setDraftLatex(currentLatex)
    setEditing(false)
    editor.focus?.()
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancelEditing()
      return
    }

    if (isCommitMathEditShortcut(event)) {
      event.preventDefault()
      event.stopPropagation()
      finishEditing()
    }
  }

  if (editing) {
    return (
      <div className={cn(MATH_SHELL_CLASS, 'w-full')}>
        <div contentEditable={false}>
          <Textarea
            ref={textareaRef}
            aria-label={`Math: ${currentLatex}`}
            className="min-h-24 font-mono text-sm selection:bg-state-selection selection:text-text-primary focus-visible:ring-0"
            value={draftLatex}
            onBlur={finishEditing}
            onChange={(event) => setDraftLatex(event.target.value)}
            onKeyDown={handleKeyDown}
            onMouseDown={stopMathEditorEvent}
          />
        </div>
      </div>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      className={cn(MATH_SHELL_CLASS, 'mx-auto h-auto min-h-9 w-fit px-0')}
      onDoubleClick={startEditing}
    >
      <MathRender latex={currentLatex} displayMode />
    </Button>
  )
}

export const MathInlineSpec = createReactInlineContentSpec(
  MATH_INLINE_CONFIG,
  {
    render: (props) => (
      <MathRender latex={props.inlineContent.props.latex} displayMode={false} />
    ),
  },
)

export const MathBlockSpec = createReactBlockSpec(
  MATH_BLOCK_CONFIG,
  {
    render: (props) => (
      <MathBlockEditor block={props.block} editor={props.editor} />
    ),
  },
)

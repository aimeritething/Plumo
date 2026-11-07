import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent, type SyntheticEvent } from 'react'
import { cn } from '@/lib/cn'
import { translate } from '@/lib/i18n'

// An Image block's caption, typed in place under the picture as a muted line.
// It is one line: Enter ends the edit, and so do Esc (keeping what was
// typed), a click away, a Tab switch and quitting. What was typed reaches the
// Document once, when the edit ends (image-block.tsx).

/** A caption is one line: line breaks become spaces, and the ends are trimmed. */
// eslint-disable-next-line react-refresh/only-export-components -- the rule is tested on its own
export function normalizeImageCaption(text: string): string {
  return text.replace(/\s*[\r\n]+\s*/gu, ' ').trim()
}

export type CaptionEndReason = 'key' | 'blur'

interface ImageCaptionProps {
  caption: string
  editable: boolean
  editing: boolean
  draft: string
  onDraftChange: (draft: string) => void
  onEnd: (reason: CaptionEndReason) => void
  onStart: () => void
}

function stopForProseMirror(event: SyntheticEvent) {
  event.stopPropagation()
}

/** A pasted line break would make a second line: it goes in as a space instead. */
function pasteAsOneLine(event: ClipboardEvent<HTMLInputElement>, onDraftChange: (draft: string) => void) {
  const text = event.clipboardData.getData('text/plain')
  if (!/[\r\n]/u.test(text)) return
  event.preventDefault()
  const input = event.currentTarget
  const start = input.selectionStart ?? input.value.length
  const end = input.selectionEnd ?? input.value.length
  const pasted = text.replace(/\s*[\r\n]+\s*/gu, ' ')
  const next = `${input.value.slice(0, start)}${pasted}${input.value.slice(end)}`
  onDraftChange(next)
  const caret = start + pasted.length
  requestAnimationFrame(() => input.setSelectionRange(caret, caret))
}

const CAPTION_TEXT_CLASS = 'block w-full bg-transparent px-0 py-1 text-sm text-subtle-foreground'

export function ImageCaption({ caption, draft, editable, editing, onDraftChange, onEnd, onStart }: ImageCaptionProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) return
    const input = inputRef.current
    if (!input) return
    input.focus()
    const end = input.value.length
    input.setSelectionRange(end, end)
  }, [editing])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    event.stopPropagation()
    if (event.nativeEvent.isComposing) return
    if (event.key !== 'Enter' && event.key !== 'Escape') return
    event.preventDefault()
    onEnd('key')
  }

  // Both the line and the input stay in the page, one hidden: WebKit drops a
  // node selection when a node inside it is removed (image-toolbar.tsx).
  return (
    <div contentEditable={false} suppressContentEditableWarning data-image-caption={editing ? 'editing' : 'text'}>
      <input
        ref={inputRef}
        aria-hidden={!editing}
        aria-label={translate('en', 'editor.image.caption')}
        className={cn(CAPTION_TEXT_CLASS, 'outline-none placeholder:text-muted-foreground', !editing && 'hidden')}
        data-testid="image-caption-input"
        placeholder={translate('en', 'editor.image.captionPlaceholder')}
        tabIndex={editing ? 0 : -1}
        type="text"
        value={draft}
        onBlur={() => onEnd('blur')}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={handleKeyDown}
        onMouseDown={stopForProseMirror}
        onPaste={(event) => pasteAsOneLine(event, onDraftChange)}
      />
      <p
        className={cn(CAPTION_TEXT_CLASS, 'm-0 break-words', editable && 'cursor-text', (editing || !caption) && 'hidden')}
        data-testid="image-caption"
        onClick={editable ? onStart : undefined}
      >
        {caption}
      </p>
    </div>
  )
}

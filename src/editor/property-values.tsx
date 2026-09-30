import { useState, type KeyboardEvent } from 'react'
import { Check, X } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

/**
 * The value side of a Property row, one control per kind of value. Each keeps
 * what is being typed as a draft and hands it on only when it is committed
 * (Enter, or the field losing focus); that commit is the one write, and the
 * one Undo step. Escape puts the draft back. Every control that takes the
 * caret carries `data-property-value`, which is how ↑ and ↓ find the next row.
 */

const FIELD_CLASS = 'w-full min-w-0 bg-transparent text-[14px] leading-[22px] text-text-document outline-none placeholder:text-text-muted'

/** A draft of `value`, dropped once committed or abandoned so the next value shows through. */
function useDraft(value: string) {
  const [draft, setDraft] = useState<string | null>(null)
  return {
    shown: draft ?? value,
    change: setDraft,
    take: () => {
      const taken = draft
      setDraft(null)
      return taken !== null && taken !== value ? taken : null
    },
    drop: () => setDraft(null),
  }
}

export function TextValue({ value, label, onCommit }: { value: string; label: string; onCommit: (text: string) => void }) {
  const draft = useDraft(value)
  const commit = () => {
    const next = draft.take()
    if (next !== null) onCommit(next)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      draft.drop()
      event.currentTarget.blur()
    }
  }
  return (
    <input
      data-property-value=""
      aria-label={label}
      className={FIELD_CLASS}
      placeholder="Empty"
      spellCheck={false}
      value={draft.shown}
      onChange={(event) => draft.change(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  )
}

export function MultilineValue({ value, label, onCommit }: { value: string; label: string; onCommit: (text: string) => void }) {
  const draft = useDraft(value)
  const commit = () => {
    const next = draft.take()
    if (next !== null) onCommit(next)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && event.metaKey) {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      draft.drop()
      event.currentTarget.blur()
    }
  }
  return (
    <textarea
      data-property-value=""
      data-property-multiline=""
      aria-label={label}
      className={cn(FIELD_CLASS, 'field-sizing-content resize-none')}
      placeholder="Empty"
      rows={1}
      spellCheck={false}
      value={draft.shown}
      onChange={(event) => draft.change(event.target.value)}
      onBlur={commit}
      onKeyDown={handleKeyDown}
    />
  )
}

export function BooleanValue({ value, label, onCommit }: { value: boolean; label: string; onCommit: (value: boolean) => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={value}
      aria-label={label}
      data-property-value=""
      className="flex h-[22px] items-center outline-none"
      onClick={() => onCommit(!value)}
    >
      <span
        className={cn(
          'flex size-3.5 items-center justify-center rounded-[3px] ring-1 ring-inset',
          value ? 'bg-accent-base ring-accent-base text-text-inverse' : 'bg-surface-card ring-text-muted',
        )}
      >
        {value && <Check size={10} weight="bold" />}
      </span>
    </button>
  )
}

export function ListValue({ items, label, onCommit }: { items: string[]; label: string; onCommit: (items: string[]) => void }) {
  const [draft, setDraft] = useState('')
  const add = () => {
    const item = draft.trim()
    setDraft('')
    if (item !== '') onCommit([...items, item])
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      add()
    } else if (event.key === 'Backspace' && draft === '' && items.length > 0) {
      event.preventDefault()
      onCommit(items.slice(0, -1))
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setDraft('')
      event.currentTarget.blur()
    }
  }
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
      {items.map((item, index) => (
        <span
          key={`${index}:${item}`}
          className="group/chip flex h-[22px] items-center gap-0.5 rounded-[5px] bg-surface-shade px-2 hover:pr-1 text-[13px] leading-[22px] text-text-document"
        >
          {item}
          <button
            type="button"
            aria-label={`Remove ${item}`}
            tabIndex={-1}
            className="hidden size-4 items-center justify-center rounded-sm text-text-muted group-hover/chip:flex hover:text-text-secondary"
            onClick={() => onCommit(items.filter((_, other) => other !== index))}
          >
            <X size={10} weight="bold" />
          </button>
        </span>
      ))}
      <input
        data-property-value=""
        aria-label={label}
        className={cn(FIELD_CLASS, 'w-24 flex-1 text-[13px]')}
        placeholder={items.length === 0 ? 'Empty' : ''}
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={add}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

export function ReadonlyValue({ summary, onEditInRaw }: { summary: string; onEditInRaw?: () => void }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2.5">
      <span className="truncate text-[14px] leading-[22px] text-text-tertiary">{summary}</span>
      {onEditInRaw && (
        <button
          type="button"
          data-property-value=""
          className="flex-none text-xs leading-[22px] text-text-link outline-none hover:underline focus-visible:underline"
          onClick={onEditInRaw}
        >
          Edit in Raw
        </button>
      )}
    </div>
  )
}

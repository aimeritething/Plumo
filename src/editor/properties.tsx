import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MutableRefObject, type RefObject } from 'react'
import { Plus, X } from '@phosphor-icons/react'
import {
  addProperty,
  hasProperty,
  readProperties,
  removeProperty,
  renameProperty,
  setPropertyBoolean,
  setPropertyList,
  setPropertyMultiline,
  setPropertyText,
  type Property,
} from '@/kernel/markdown/properties'
import { cn } from '@/lib/cn'
import { subscribeRichEditorFocusLastProperty } from '@/kernel/blocknote/rich-editor-properties-keys-extension'
import { useRegisteredRef } from './use-registered-ref'
import { useRichFrontmatter, type FrontmatterEditor } from './use-rich-frontmatter'
import { BooleanValue, ListValue, MultilineValue, ReadonlyValue, TextValue } from './property-values'

/** What the editor shell asks of Properties. */
export interface PropertiesHandle {
  /** Opens a new row with its key field focused (Edit ▸ Add property). */
  add: () => void
}

interface PropertiesProps {
  editor: FrontmatterEditor
  path: string
  tabContent: string
  handleRef?: MutableRefObject<PropertiesHandle | null>
  /** ↓ from the last row: the caret goes to the start of the body. */
  onLeaveDown: () => void
  /** A value Properties cannot edit sends the user to Raw mode. */
  onEditInRaw?: () => void
}

type Commit = (next: string | null) => void

const ROW_CLASS = 'group -mx-2 flex items-start gap-3 rounded-md px-2 py-[5px] focus-within:bg-state-hover hover:bg-state-hover'
const KEY_CLASS = 'w-28 flex-none truncate bg-transparent text-[13px] leading-[22px] text-text-tertiary outline-none aria-invalid:text-chroma-red-text'
const VALUE_SELECTOR = '[data-property-value]'
/** The body's top padding, and a left edge level with the body text, which sits 8px in from .bn-editor's padding (.bn-block-content). */
const PANEL_CLASS = 'flex flex-col pt-(--editor-padding-top) pr-(--editor-padding-horizontal) pl-[calc(var(--editor-padding-horizontal)+var(--spacing)*2)]'

/** Focuses a value, a multi-line one with the caret on the side the caret came from: its last line from below, its first from above. */
function focusValue(control: HTMLElement, from: 'above' | 'below'): void {
  control.focus()
  if (control instanceof HTMLTextAreaElement) {
    const at = from === 'below' ? control.value.length : 0
    control.setSelectionRange(at, at)
  }
}

function valueControls(root: HTMLElement | null): HTMLElement[] {
  return root ? Array.from(root.querySelectorAll<HTMLElement>(VALUE_SELECTOR)) : []
}

/** Whether ↑ or ↓ in a multi-line field should leave it: only from its first or last line. */
function leavesField(target: HTMLElement, key: 'ArrowUp' | 'ArrowDown'): boolean {
  if (!(target instanceof HTMLTextAreaElement)) return true
  const { selectionStart, selectionEnd, value } = target
  if (selectionStart !== selectionEnd) return false
  return key === 'ArrowUp'
    ? !value.slice(0, selectionStart).includes('\n')
    : !value.slice(selectionEnd).includes('\n')
}

function KeyField({ property, frontmatter, commit }: { property: Property; frontmatter: string; commit: Commit }) {
  const [draft, setDraft] = useState<string | null>(null)
  const shown = draft ?? property.key
  const taken = draft !== null && draft.trim() !== property.key && hasProperty(frontmatter, draft)
  const finish = () => {
    if (draft === null) return
    const next = draft.trim()
    if (next === '' || next === property.key) {
      setDraft(null)
      return
    }
    if (taken) return
    setDraft(null)
    commit(renameProperty(frontmatter, property.key, next))
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      finish()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setDraft(null)
      event.currentTarget.blur()
    }
  }
  return (
    <input
      aria-label="Property name"
      aria-invalid={taken || undefined}
      title={taken ? `There is already a Property named ${draft?.trim()}` : property.key}
      className={KEY_CLASS}
      spellCheck={false}
      value={shown}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={finish}
      onKeyDown={handleKeyDown}
    />
  )
}

function PropertyValueControl({ property, frontmatter, commit, onEditInRaw }: {
  property: Property
  frontmatter: string
  commit: Commit
  onEditInRaw?: () => void
}) {
  const { key, value } = property
  switch (value.kind) {
    case 'text':
      return <TextValue value={value.text} label={key} onCommit={(text) => commit(setPropertyText(frontmatter, key, text))} />
    case 'multiline':
      return <MultilineValue value={value.text} label={key} onCommit={(text) => commit(setPropertyMultiline(frontmatter, key, text))} />
    case 'boolean':
      return <BooleanValue value={value.value} label={key} onCommit={(next) => commit(setPropertyBoolean(frontmatter, key, next))} />
    case 'list':
      return <ListValue items={value.items} label={key} onCommit={(items) => commit(setPropertyList(frontmatter, key, items))} />
    case 'readonly':
      return <ReadonlyValue summary={value.summary} onEditInRaw={onEditInRaw} />
  }
}

function PropertyRow(props: { property: Property; frontmatter: string; commit: Commit; onEditInRaw?: () => void }) {
  const { property, frontmatter, commit } = props
  return (
    <div className={ROW_CLASS} data-property-key={property.key} data-property-line={property.line}>
      <KeyField property={property} frontmatter={frontmatter} commit={commit} />
      <div className="flex min-w-0 flex-1">
        <PropertyValueControl {...props} />
      </div>
      <button
        type="button"
        aria-label={`Remove ${property.key}`}
        tabIndex={-1}
        className="flex size-[22px] flex-none items-center justify-center rounded-sm text-text-tertiary opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-control-tertiary-hover"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => commit(removeProperty(frontmatter, property.key))}
      >
        <X size={12} />
      </button>
    </div>
  )
}

const HOLD_FOCUS_DELAYS_MS = [50, 150, 300, 600] as const

/**
 * Keeps the caret in a field that has just appeared. Add property run from
 * the Command Menu opens the row while the menu still traps the focus, and the
 * menu hands the focus back to the editor as it closes; so the field takes it
 * again over the next few frames, unless another text field has it by then.
 */
function useHoldFocus(ref: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const timers = HOLD_FOCUS_DELAYS_MS.map((delay) => window.setTimeout(() => {
      const field = ref.current
      const active = document.activeElement
      if (!field || active === field) return
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
        if (!field.closest('[data-properties]')?.contains(active)) return
      }
      field.focus()
    }, delay))
    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [ref])
}

/** The new-Property row: a key field that writes `key:` when confirmed, or goes away empty. */
function NewPropertyRow({ frontmatter, onDone }: { frontmatter: string; onDone: (key: string | null) => void }) {
  const [draft, setDraft] = useState('')
  const doneRef = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  useHoldFocus(inputRef)
  const key = draft.trim()
  const taken = key !== '' && hasProperty(frontmatter, key)
  // Enter closes the row, and the blur that follows must not add the key a second time.
  const done = (result: string | null) => {
    if (doneRef.current) return
    doneRef.current = true
    onDone(result)
  }
  const finish = () => {
    if (taken) return
    done(key === '' ? null : key)
  }
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || (event.key === 'Tab' && !event.shiftKey && key !== '')) {
      event.preventDefault()
      finish()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      done(null)
    }
  }
  return (
    <div className={ROW_CLASS}>
      <input
        ref={inputRef}
        autoFocus
        aria-label="New Property name"
        aria-invalid={taken || undefined}
        title={taken ? `There is already a Property named ${key}` : undefined}
        className={KEY_CLASS}
        placeholder="Name"
        spellCheck={false}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => done(key === '' || taken ? null : key)}
        onKeyDown={handleKeyDown}
      />
    </div>
  )
}

/**
 * Properties: the Document's Frontmatter above the body in Rich mode, one row
 * per Property in disk order. Nothing shows for a Document without
 * Frontmatter until Add property opens a row. A block YAML refuses is shown as
 * one line and never edited. Each committed change goes into the editor as one
 * Undo step, and Autosave writes it, rewriting only that Property's lines.
 */
export function Properties({ editor, path, tabContent, handleRef, onLeaveDown, onEditInRaw }: PropertiesProps) {
  const { frontmatter, commit } = useRichFrontmatter(editor, path, tabContent)
  const parsed = useMemo(() => readProperties(frontmatter), [frontmatter])
  const [adding, setAdding] = useState(false)
  const [focusKey, setFocusKey] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  const handle = useMemo<PropertiesHandle>(() => ({ add: () => setAdding(true) }), [])
  useRegisteredRef(handleRef, handle)

  // ↑ from the body's first line: the last Property's value takes the caret.
  useEffect(() => subscribeRichEditorFocusLastProperty(editor, () => {
    const last = valueControls(rootRef.current).at(-1)
    if (!last) return false
    focusValue(last, 'below')
    return true
  }), [editor])

  // A key just added: its value takes the caret once the row is there.
  useEffect(() => {
    if (focusKey === null) return
    const row = rootRef.current?.querySelector<HTMLElement>(`[data-property-key="${CSS.escape(focusKey)}"]`)
    row?.querySelector<HTMLElement>(VALUE_SELECTOR)?.focus()
  }, [focusKey, frontmatter])

  const finishAdding = useCallback((key: string | null) => {
    setAdding(false)
    if (key === null) return
    const next = addProperty(frontmatter, key)
    if (next === null) return
    setFocusKey(key)
    commit(next)
  }, [commit, frontmatter])

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    const target = event.target as HTMLElement
    if (!target.matches(VALUE_SELECTOR) || !leavesField(target, event.key)) return
    const controls = valueControls(rootRef.current)
    const index = controls.indexOf(target)
    const next = controls[index + (event.key === 'ArrowUp' ? -1 : 1)]
    if (next) {
      event.preventDefault()
      focusValue(next, event.key === 'ArrowUp' ? 'below' : 'above')
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      onLeaveDown()
    }
  }

  if (parsed.state === 'none' && !adding) return null

  return (
    <div
      ref={rootRef}
      data-properties=""
      aria-label="Properties"
      role="group"
      className={PANEL_CLASS}
      onKeyDown={handleKeyDown}
      onBlur={(event) => {
        if (!rootRef.current?.contains(event.relatedTarget as Node | null)) setFocusKey(null)
      }}
    >
      {parsed.state === 'unreadable' ? (
        <div className="-mx-2 flex items-center gap-2.5 px-2 py-[5px] text-[13px] leading-[22px] text-text-tertiary">
          <span>The Frontmatter can’t be read.</span>
          {onEditInRaw && (
            <button type="button" className="text-xs text-text-link hover:underline" onClick={onEditInRaw}>Fix it in Raw</button>
          )}
        </div>
      ) : (
        parsed.state === 'readable' && parsed.properties.map((property) => (
          <PropertyRow key={property.key} property={property} frontmatter={frontmatter} commit={commit} onEditInRaw={onEditInRaw} />
        ))
      )}
      {adding ? (
        <NewPropertyRow frontmatter={frontmatter} onDone={finishAdding} />
      ) : parsed.state === 'readable' && (
        <button
          type="button"
          className={cn(ROW_CLASS, 'w-fit items-center gap-1.5 text-[13px] leading-[22px] text-text-muted hover:text-text-tertiary')}
          onClick={() => setAdding(true)}
        >
          <Plus size={12} />
          Add property
        </button>
      )}
    </div>
  )
}

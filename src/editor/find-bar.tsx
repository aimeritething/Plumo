import { CaretDown as ChevronDown, CaretRight as ChevronRight, CaretUp as ChevronUp, X } from '@phosphor-icons/react'
import type { KeyboardEvent, ReactNode, Ref } from 'react'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Toggle } from '@/ui/toggle'
import { SimpleTooltip } from '@/ui/tooltip'
import { cn } from '@/lib/cn'
import { translate, type AppLocale } from '@/lib/i18n'
import { isImeKeyEvent } from '@/lib/ime-key-event'

/** The replace row, for a bar whose editor can replace; without it the bar only finds. */
export interface FindBarReplace {
  open: boolean
  onOpenChange: (open: boolean) => void
  value: string
  onValueChange: (value: string) => void
  /**
   * Replace the current match. `enter` is ↵ in the replace input, which leaves
   * the focus there so the next ↵ replaces the next match; `button` is the
   * Replace button.
   */
  onReplace: (from: 'button' | 'enter') => void
  onReplaceAll: () => void
}

export interface FindBarProps {
  /** Where the bar's test ids start (`raw-editor` gives `raw-editor-find-input`), so each mode's bar is told apart. */
  testIdPrefix: string
  className?: string
  locale: AppLocale
  inputRef: Ref<HTMLInputElement>
  query: string
  onQueryChange: (query: string) => void
  caseSensitive: boolean
  onCaseSensitiveChange: (pressed: boolean) => void
  regex: boolean
  onRegexChange: (pressed: boolean) => void
  matchCount: number
  /** The current match, already within `matchCount`. */
  currentIndex: number
  /** Why the query matches nothing, when it is a regex that cannot be used. */
  error: string | null
  onNext: () => void
  onPrevious: () => void
  onClose: () => void
  replace?: FindBarReplace
}

const FIND_INPUT_CLASS = 'h-7 min-w-[12rem] flex-1 rounded px-2 text-xs'

function statusText(locale: AppLocale, error: string | null, currentIndex: number, matchCount: number): string {
  if (error === 'Invalid regex') return translate(locale, 'editor.find.invalidRegex')
  if (error) return translate(locale, 'editor.find.regexMustMatchText')
  if (matchCount === 0) return translate(locale, 'editor.find.noMatches')
  return translate(locale, 'editor.find.matchCount', { current: currentIndex + 1, total: matchCount })
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <SimpleTooltip label={label} side="bottom">
      <Button type="button" variant="icon" size="icon-xs" aria-label={label} disabled={disabled} onClick={onClick}>
        {children}
      </Button>
    </SimpleTooltip>
  )
}

function OptionToggle({ label, pressed, onPressedChange, children }: { label: string; pressed: boolean; onPressedChange: (pressed: boolean) => void; children: ReactNode }) {
  return (
    <SimpleTooltip label={label} side="bottom">
      <Toggle pressed={pressed} aria-label={label} onPressedChange={onPressedChange}>
        {children}
      </Toggle>
    </SimpleTooltip>
  )
}

function ReplaceRow({ hasMatches, locale, replace, testIdPrefix }: { hasMatches: boolean; locale: AppLocale; replace: FindBarReplace; testIdPrefix: string }) {
  const { onReplace, onReplaceAll, onValueChange, value } = replace
  // ↵ replaces as the Replace button does; ⇧↵ does nothing, and ↵ confirming a candidate is the input method's.
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.shiftKey || isImeKeyEvent(event.nativeEvent)) return
    event.preventDefault()
    onReplace('enter')
  }
  return (
    // Indented by the replace toggle and the gap after it, so the two inputs line up.
    <div className="ml-[1.875rem] flex min-w-0 items-center gap-1.5">
      <Input
        type="text"
        aria-label={translate(locale, 'editor.find.replaceLabel')}
        placeholder={translate(locale, 'editor.find.replacePlaceholder')}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={onKeyDown}
        className={FIND_INPUT_CLASS}
        data-testid={`${testIdPrefix}-replace-input`}
      />
      <Button type="button" variant="outline" size="xs" disabled={!hasMatches} onClick={() => onReplace('button')}>
        {translate(locale, 'editor.find.replace')}
      </Button>
      <Button type="button" variant="outline" size="xs" disabled={!hasMatches} onClick={onReplaceAll}>
        {translate(locale, 'editor.find.replaceAll')}
      </Button>
    </div>
  )
}

/**
 * The find bar Rich and Raw mode share: what to look for, the count, the
 * walk through the matches, the options and close, and a replace row when
 * the editor gives one. It only shows; each mode finds in its own document
 * and hands the bar the result.
 */
export function FindBar(props: FindBarProps) {
  const { className, error, inputRef, locale, matchCount, onClose, onNext, onPrevious, replace, testIdPrefix } = props
  const hasMatches = matchCount > 0 && !error
  const previousLabel = translate(locale, 'editor.find.previousMatch')
  const nextLabel = translate(locale, 'editor.find.nextMatch')

  // ↵ in the find input is the next match, ⇧↵ the previous; ↵ confirming a candidate is the input method's.
  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || isImeKeyEvent(event.nativeEvent)) return
    event.preventDefault()
    if (event.shiftKey) onPrevious()
    else onNext()
  }
  // Escape from any control in the bar closes it once; cancelling a candidate is the input method's.
  const onBarKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || isImeKeyEvent(event.nativeEvent)) return
    event.preventDefault()
    onClose()
  }

  return (
    <div
      className={cn('flex shrink-0 flex-col gap-1.5 border-b border-border bg-background px-3 py-2', className)}
      data-testid={`${testIdPrefix}-find-bar`}
      onKeyDown={onBarKeyDown}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        {replace && (
          <IconButton
            label={translate(locale, replace.open ? 'editor.find.hideReplace' : 'editor.find.showReplace')}
            onClick={() => replace.onOpenChange(!replace.open)}
          >
            <ChevronRight className={cn('transition-transform', replace.open && 'rotate-90')} />
          </IconButton>
        )}
        <Input
          ref={inputRef}
          type="search"
          aria-label={translate(locale, 'editor.find.findLabel')}
          placeholder={translate(locale, 'editor.find.findPlaceholder')}
          value={props.query}
          onChange={(event) => props.onQueryChange(event.target.value)}
          onKeyDown={onInputKeyDown}
          className={FIND_INPUT_CLASS}
          data-testid={`${testIdPrefix}-find-input`}
        />
        <span className="min-w-[4.75rem] text-right text-xs text-muted-foreground" aria-live="polite" data-testid={`${testIdPrefix}-find-count`}>
          {statusText(locale, error, props.currentIndex, matchCount)}
        </span>
        <IconButton label={previousLabel} disabled={!hasMatches} onClick={onPrevious}>
          <ChevronUp />
        </IconButton>
        <IconButton label={nextLabel} disabled={!hasMatches} onClick={onNext}>
          <ChevronDown />
        </IconButton>
        <OptionToggle label={translate(locale, 'editor.find.regex')} pressed={props.regex} onPressedChange={props.onRegexChange}>
          .*
        </OptionToggle>
        <OptionToggle label={translate(locale, 'editor.find.matchCase')} pressed={props.caseSensitive} onPressedChange={props.onCaseSensitiveChange}>
          Aa
        </OptionToggle>
        <IconButton label={translate(locale, 'editor.find.close')} onClick={onClose}>
          <X />
        </IconButton>
      </div>
      {replace?.open && <ReplaceRow hasMatches={hasMatches} locale={locale} replace={replace} testIdPrefix={testIdPrefix} />}
    </div>
  )
}

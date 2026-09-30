import { useRef, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'
import type { ResolvedThemeMode, ThemeMode } from '@/shell/theme-mode'

/** The View ▸ Appearance order. */
const THEME_CHOICES: readonly { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: 'System' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'light', label: 'Light' },
]

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown'])
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp'])

interface ThemePickerProps {
  theme: ThemeMode
  onChange: (theme: ThemeMode) => void
}

/**
 * The Theme setting: a card per choice, each a small Plumo window drawn in
 * that theme (System's half light, half dark), the chosen one ringed. It is a
 * radio group: one tab stop, the arrows move the choice as they do between
 * native radio buttons, and a change applies at once.
 */
export function ThemePicker({ theme, onChange }: ThemePickerProps) {
  const cards = useRef<(HTMLButtonElement | null)[]>([])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = NEXT_KEYS.has(event.key) ? 1 : PREVIOUS_KEYS.has(event.key) ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const current = THEME_CHOICES.findIndex((choice) => choice.mode === theme)
    const next = (current + step + THEME_CHOICES.length) % THEME_CHOICES.length
    onChange(THEME_CHOICES[next].mode)
    cards.current[next]?.focus()
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-0.5">
        <span id="settings-theme-label" className="text-sm font-medium text-text-primary">Theme</span>
        <span className="text-xs text-text-tertiary">System follows macOS, switching with it.</span>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="settings-theme-label"
        className="flex gap-4 max-[760px]:gap-3"
        onKeyDown={onKeyDown}
        data-testid="settings-theme"
      >
        {THEME_CHOICES.map(({ mode, label }, index) => (
          <button
            key={mode}
            ref={(card) => { cards.current[index] = card }}
            type="button"
            role="radio"
            aria-checked={mode === theme}
            tabIndex={mode === theme ? 0 : -1}
            className="group flex min-w-0 flex-1 cursor-default flex-col gap-2 text-left outline-none"
            onClick={() => onChange(mode)}
            data-testid={`settings-theme:${mode}`}
          >
            <span
              className={cn(
                'relative block aspect-[17/11] w-full overflow-hidden rounded-lg ring-1 ring-border-default',
                'group-aria-checked:ring-2 group-aria-checked:ring-text-heading group-aria-checked:ring-offset-2 group-aria-checked:ring-offset-surface-popover',
                'group-focus-visible:ring-2 group-focus-visible:ring-state-focus-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-surface-popover',
              )}
            >
              {mode === 'system' ? (
                <>
                  <MiniWindow theme="light" className="absolute inset-0" />
                  <span className="absolute inset-y-0 right-0 w-1/2 overflow-hidden">
                    <MiniWindow theme="dark" className="absolute inset-y-0 right-0 w-[200%]" />
                  </span>
                </>
              ) : (
                <MiniWindow theme={mode} className="absolute inset-0" />
              )}
            </span>
            <span className="truncate pl-0.5 text-xs text-text-secondary group-aria-checked:font-medium group-aria-checked:text-text-heading">
              {label}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * A Plumo window in miniature, painted with the tokens of `theme`: the theme
 * blocks answer to `data-theme` on any element, not only on <html>.
 */
function MiniWindow({ theme, className }: { theme: ResolvedThemeMode; className?: string }) {
  return (
    <span data-theme={theme} aria-hidden="true" className={cn('flex bg-surface-card', className)}>
      <span className="flex w-1/4 flex-none flex-col gap-1.5 bg-surface-app px-[6%] pt-[10%]">
        <span className="h-1 w-3/5 rounded-full bg-border-strong" />
        <span className="h-1 w-2/5 rounded-full bg-border-strong" />
        <span className="h-1 w-1/2 rounded-full bg-border-strong" />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 px-[9%] pt-[10%]">
        <span className="mb-0.5 h-1.5 w-1/2 rounded-full bg-text-document-heading" />
        <span className="h-1 w-5/6 rounded-full bg-border-strong" />
        <span className="h-1 w-2/3 rounded-full bg-border-strong" />
        <span className="h-1 w-3/4 rounded-full bg-border-strong" />
      </span>
    </span>
  )
}

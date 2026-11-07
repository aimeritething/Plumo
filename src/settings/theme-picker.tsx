import { cn } from '@/lib/cn'
import type { ResolvedThemeMode, ThemeMode } from '@/shell/theme-mode'
import { ToggleGroup, ToggleGroupItem, ToggleGroupItemPreview } from '@/ui/toggle-group'

/** The View ▸ Appearance order. */
const THEME_CHOICES: readonly { mode: ThemeMode; label: string }[] = [
  { mode: 'system', label: 'System' },
  { mode: 'dark', label: 'Dark' },
  { mode: 'light', label: 'Light' },
]

interface ThemePickerProps {
  theme: ThemeMode
  onChange: (theme: ThemeMode) => void
}

/**
 * The Theme setting: a card per choice, each a small Plumo window drawn in
 * that theme (System's half light, half dark), the chosen one ringed. A
 * single toggle group: one tab stop, the arrows move the focus, Space or a
 * click chooses, and a change applies at once. A click on the chosen card,
 * which the group reads as clearing the choice, is ignored: there is always
 * a theme.
 */
export function ThemePicker({ theme, onChange }: ThemePickerProps) {
  const choose = (next: string) => {
    const choice = THEME_CHOICES.find(({ mode }) => mode === next)
    if (choice) onChange(choice.mode)
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-0.5">
        <span id="settings-theme-label" className="text-sm font-medium text-foreground">Theme</span>
        <span className="text-xs text-muted-foreground">System follows macOS, switching with it.</span>
      </div>
      <ToggleGroup
        type="single"
        variant="card"
        value={theme}
        onValueChange={choose}
        aria-labelledby="settings-theme-label"
        data-testid="settings-theme"
      >
        {THEME_CHOICES.map(({ mode, label }) => (
          <ToggleGroupItem key={mode} value={mode} data-testid={`settings-theme:${mode}`}>
            <ToggleGroupItemPreview className="aspect-[17/11]">
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
            </ToggleGroupItemPreview>
            <span className="truncate pl-0.5">{label}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}

/**
 * A Plumo window in miniature, painted with the tokens of `theme`: the theme
 * blocks answer to `data-theme` on any element, not only on <html>.
 */
function MiniWindow({ theme, className }: { theme: ResolvedThemeMode; className?: string }) {
  return (
    <span data-theme={theme} aria-hidden="true" className={cn('flex bg-background', className)}>
      <span className="flex w-1/4 flex-none flex-col gap-1.5 border-r-hairline border-sidebar-border bg-sidebar px-[6%] pt-[10%]">
        <span className="h-1 w-3/5 rounded-full bg-input" />
        <span className="h-1 w-2/5 rounded-full bg-input" />
        <span className="h-1 w-1/2 rounded-full bg-input" />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 px-[9%] pt-[10%]">
        <span className="mb-0.5 h-1.5 w-1/2 rounded-full bg-document-heading" />
        <span className="h-1 w-5/6 rounded-full bg-input" />
        <span className="h-1 w-2/3 rounded-full bg-input" />
        <span className="h-1 w-3/4 rounded-full bg-input" />
      </span>
    </span>
  )
}

import type { ThemeMode } from '@/shell/theme-mode'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/ui/item'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'

/** The View ▸ Appearance order. */
const THEME_CHOICES: readonly { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
]

interface ThemePickerProps {
  theme: ThemeMode
  onChange: (theme: ThemeMode) => void
}

/**
 * The Theme setting's row: its name and what System means on the left, a
 * select of the three choices on the right. A change applies at once.
 */
export function ThemePicker({ theme, onChange }: ThemePickerProps) {
  return (
    <Item>
      <ItemContent>
        <ItemTitle id="settings-theme-label">Theme</ItemTitle>
        <ItemDescription>System follows macOS, switching with it.</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Select
          items={THEME_CHOICES}
          value={theme}
          onValueChange={(next) => { if (next !== null) onChange(next) }}
        >
          <SelectTrigger
            variant="filled"
            className="w-32"
            aria-labelledby="settings-theme-label"
            data-testid="settings-theme"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {THEME_CHOICES.map(({ value, label }) => (
              <SelectItem key={value} value={value} data-testid={`settings-theme:${value}`}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ItemActions>
    </Item>
  )
}

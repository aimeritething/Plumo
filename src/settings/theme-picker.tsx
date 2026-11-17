import type { ThemeMode } from '@/shell/theme-mode'
import { Item, ItemActions, ItemContent, ItemTitle } from '@/ui/item'
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
 * The Theme setting's row: its name on the left, a select of System, Dark
 * and Light on the right. A change applies at once.
 */
export function ThemePicker({ theme, onChange }: ThemePickerProps) {
  return (
    <Item>
      <ItemContent>
        <ItemTitle id="settings-theme-label">Theme</ItemTitle>
      </ItemContent>
      <ItemActions>
        <Select
          items={THEME_CHOICES}
          value={theme}
          onValueChange={(next) => { if (next !== null) onChange(next) }}
        >
          <SelectTrigger
            variant="pill"
            className="w-35"
            aria-labelledby="settings-theme-label"
            data-testid="settings-theme"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="end">
            {THEME_CHOICES.map(({ value, label }) => (
              <SelectItem key={value} value={value} data-testid={`settings-theme:${value}`}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </ItemActions>
    </Item>
  )
}

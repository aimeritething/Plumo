import { useRef, type CSSProperties } from 'react'
import { normalizePrimaryColor, PRIMARY_COLOR_PRESETS } from '@/shell/primary-color'
import { ToggleGroup, ToggleGroupItem, ToggleGroupItemPreview } from '@/ui/toggle-group'
import { SimpleTooltip } from '@/ui/tooltip'

const CUSTOM = 'custom'

/** The Custom swatch until a colour of its own is chosen: the colour wheel. */
const COLOUR_WHEEL = 'conic-gradient(from 90deg, #e5484d, #ffc53d, #30a46c, #0082fb, #8e4ec6, #d6409f, #e5484d)'

/** A swatch's paint, for its dot and its ring. */
const swatchStyle = (paint: string) => ({ '--swatch': paint }) as CSSProperties

interface PrimaryColorPickerProps {
  /** `#rrggbb`. */
  color: string
  onChange: (color: string) => void
}

/**
 * The Primary color setting (CONTEXT.md): a swatch per preset, in macOS's
 * accent-colour order, and a last one that opens the system colour panel for
 * any other colour. A single toggle group like the Theme setting: one tab
 * stop, the arrows move the focus, Space or a click chooses, and a change
 * applies at once. Custom chooses nothing by itself: Space or a click opens
 * the panel, every time, and the colour picked there is the choice. A click
 * on the chosen preset, which the group reads as clearing the choice, is
 * ignored: there is always a Primary color.
 */
export function PrimaryColorPicker({ color, onChange }: PrimaryColorPickerProps) {
  const panel = useRef<HTMLInputElement | null>(null)
  const current = normalizePrimaryColor(color) ?? PRIMARY_COLOR_PRESETS[0].hex
  const preset = PRIMARY_COLOR_PRESETS.find(({ hex }) => hex === current)
  const checked = preset?.id ?? CUSTOM

  const choose = (next: string) => {
    const chosen = PRIMARY_COLOR_PRESETS.find(({ id }) => id === next)
    if (chosen) onChange(chosen.hex)
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-0.5">
        <span id="settings-primary-color-label" className="text-sm font-medium text-foreground">Primary color</span>
        <span className="text-xs text-muted-foreground">Buttons, links, focus and the text selection.</span>
      </div>
      <ToggleGroup
        type="single"
        variant="swatch"
        value={checked}
        onValueChange={choose}
        aria-labelledby="settings-primary-color-label"
        data-testid="settings-primary-color"
      >
        {PRIMARY_COLOR_PRESETS.map(({ id, label, hex }) => (
          <SimpleTooltip key={id} label={label}>
            <ToggleGroupItem value={id} aria-label={label} data-testid={`settings-primary-color:${id}`}>
              <ToggleGroupItemPreview style={swatchStyle(hex)} />
            </ToggleGroupItem>
          </SimpleTooltip>
        ))}
        <SimpleTooltip label="Custom">
          <ToggleGroupItem
            value={CUSTOM}
            aria-label="Custom"
            onClick={() => panel.current?.click()}
            data-testid="settings-primary-color:custom"
          >
            <ToggleGroupItemPreview style={swatchStyle(checked === CUSTOM ? current : COLOUR_WHEEL)} />
          </ToggleGroupItem>
        </SimpleTooltip>
        <input
          ref={panel}
          type="color"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          value={current}
          onChange={(event) => {
            const next = normalizePrimaryColor(event.target.value)
            if (next) onChange(next)
          }}
          data-testid="settings-primary-color-panel"
        />
        {checked === CUSTOM && (
          <span className="font-mono text-xs text-muted-foreground uppercase">{current}</span>
        )}
      </ToggleGroup>
    </div>
  )
}

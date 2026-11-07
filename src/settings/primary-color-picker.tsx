import { useRef, type CSSProperties, type KeyboardEvent } from 'react'
import { cn } from '@/lib/cn'
import { normalizePrimaryColor, PRIMARY_COLOR_PRESETS } from '@/shell/primary-color'

const NEXT_KEYS = new Set(['ArrowRight', 'ArrowDown'])
const PREVIOUS_KEYS = new Set(['ArrowLeft', 'ArrowUp'])

const CUSTOM = 'custom'

/** A swatch's colour, for its fill and its ring. */
const swatchStyle = (hex: string) => ({ '--swatch': hex }) as CSSProperties

const SWATCH_CLASSES = cn(
  'relative size-6 flex-none cursor-default rounded-full outline-none',
  'inset-ring inset-ring-black/10',
  'aria-checked:ring-2 aria-checked:ring-(--swatch) aria-checked:ring-offset-2 aria-checked:ring-offset-popover',
  'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-popover',
)

interface PrimaryColorPickerProps {
  /** `#rrggbb`. */
  color: string
  onChange: (color: string) => void
}

/**
 * The Primary color setting (CONTEXT.md): a swatch per preset, in macOS's
 * accent-colour order, and a last one that opens the system colour panel for
 * any other colour. A radio group like the Theme setting: one tab stop, the
 * arrows move the choice, a change applies at once. Moving onto Custom with
 * the arrows keeps the colour; Space or a click opens the panel.
 */
export function PrimaryColorPicker({ color, onChange }: PrimaryColorPickerProps) {
  const swatches = useRef<(HTMLButtonElement | null)[]>([])
  const panel = useRef<HTMLInputElement | null>(null)
  const current = normalizePrimaryColor(color) ?? PRIMARY_COLOR_PRESETS[0].hex
  const preset = PRIMARY_COLOR_PRESETS.find(({ hex }) => hex === current)
  const choices = [...PRIMARY_COLOR_PRESETS.map(({ id }) => id), CUSTOM]
  const checked = preset?.id ?? CUSTOM

  const choose = (index: number) => {
    const id = choices[index]
    if (id !== CUSTOM) onChange(PRIMARY_COLOR_PRESETS[index].hex)
    swatches.current[index]?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = NEXT_KEYS.has(event.key) ? 1 : PREVIOUS_KEYS.has(event.key) ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const from = choices.indexOf(checked)
    choose((from + step + choices.length) % choices.length)
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex flex-col gap-0.5">
        <span id="settings-primary-color-label" className="text-sm font-medium text-foreground">Primary color</span>
        <span className="text-xs text-muted-foreground">Buttons, links, focus and the text selection.</span>
      </div>
      <div
        role="radiogroup"
        aria-labelledby="settings-primary-color-label"
        className="flex flex-wrap items-center gap-3"
        onKeyDown={onKeyDown}
        data-testid="settings-primary-color"
      >
        {PRIMARY_COLOR_PRESETS.map(({ id, label, hex }, index) => (
          <button
            key={id}
            ref={(swatch) => { swatches.current[index] = swatch }}
            type="button"
            role="radio"
            aria-checked={checked === id}
            aria-label={label}
            title={label}
            tabIndex={checked === id ? 0 : -1}
            className={cn(SWATCH_CLASSES, 'bg-(--swatch)')}
            style={swatchStyle(hex)}
            onClick={() => onChange(hex)}
            data-testid={`settings-primary-color:${id}`}
          />
        ))}
        <button
          ref={(swatch) => { swatches.current[PRIMARY_COLOR_PRESETS.length] = swatch }}
          type="button"
          role="radio"
          aria-checked={checked === CUSTOM}
          aria-label="Custom"
          title="Custom"
          tabIndex={checked === CUSTOM ? 0 : -1}
          className={cn(
            SWATCH_CLASSES,
            checked === CUSTOM
              ? 'bg-(--swatch)'
              : 'bg-[conic-gradient(from_90deg,#e5484d,#ffc53d,#30a46c,#0082fb,#8e4ec6,#d6409f,#e5484d)]',
          )}
          style={swatchStyle(current)}
          onClick={() => panel.current?.click()}
          data-testid="settings-primary-color:custom"
        />
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
      </div>
    </div>
  )
}

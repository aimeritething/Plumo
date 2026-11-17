import { useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { normalizePrimaryColor, parseTypedHex, PRIMARY_COLOR_PRESETS } from '@/shell/primary-color'
import { Button } from '@/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/ui/input-group'
import { Item, ItemActions, ItemContent, ItemTitle } from '@/ui/item'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'

const CUSTOM = 'custom'

/** The select's items, in macOS's accent-colour order, and Custom last, which has no dot. */
const CHOICES: readonly { value: string; label: string; paint: string | null }[] = [
  ...PRIMARY_COLOR_PRESETS.map(({ id, label, hex }) => ({ value: id, label, paint: hex })),
  { value: CUSTOM, label: 'Custom', paint: null },
]

/** A colour as the hex field shows it: `#RRGGBB`. */
const shownHex = (hex: string) => hex.toUpperCase()

function Dot({ paint, className }: { paint: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-3 flex-none rounded-full inset-ring inset-ring-black/10', className)}
      style={{ background: paint }}
    />
  )
}

interface PrimaryColorPickerProps {
  /** `#rrggbb`. */
  color: string
  onChange: (color: string) => void
}

/**
 * The Primary color setting's row (CONTEXT.md): its name on the left; on the
 * right a select of the presets, each a dot and its name, and Custom, a name
 * alone, starting where the dots do. Custom
 * changes nothing by itself: it puts a hex field after the select, holding
 * the current colour, and what is typed or picked there is the choice. A
 * colour that is no preset shows as Custom. A change applies at once.
 */
export function PrimaryColorPicker({ color, onChange }: PrimaryColorPickerProps) {
  const current = normalizePrimaryColor(color) ?? PRIMARY_COLOR_PRESETS[0].hex
  const preset = PRIMARY_COLOR_PRESETS.find(({ hex }) => hex === current)
  // Custom stays chosen while the dialog is open, even for a colour typed to
  // match a preset; the dialog opens on the preset again.
  const [customChosen, setCustomChosen] = useState(!preset)
  const chosen = customChosen || !preset ? CUSTOM : preset.id

  const choose = (next: string) => {
    if (next === CUSTOM) {
      setCustomChosen(true)
      return
    }
    const chosenPreset = PRIMARY_COLOR_PRESETS.find(({ id }) => id === next)
    if (!chosenPreset) return
    setCustomChosen(false)
    if (chosenPreset.hex !== current) onChange(chosenPreset.hex)
  }

  return (
    <Item>
      <ItemContent>
        <ItemTitle id="settings-primary-color-label">Primary color</ItemTitle>
      </ItemContent>
      <ItemActions>
        <Select
          items={CHOICES}
          value={chosen}
          onValueChange={(next) => { if (next !== null) choose(next) }}
        >
          <SelectTrigger
            variant="pill"
            className="w-35"
            aria-labelledby="settings-primary-color-label"
            data-testid="settings-primary-color"
          >
            <SelectValue>
              {(value: string) => {
                const choice = CHOICES.find((item) => item.value === value)
                return choice && <>{choice.paint && <Dot paint={choice.paint} />}{choice.label}</>
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent alignItemWithTrigger={false} align="end">
            {CHOICES.map(({ value, label, paint }) => (
              <SelectItem key={value} value={value} data-testid={`settings-primary-color:${value}`}>
                {paint && <Dot paint={paint} />}
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {chosen === CUSTOM && <HexField color={current} onChange={onChange} />}
      </ItemActions>
    </Item>
  )
}

/**
 * Custom's hex field: the colour's dot, then its hex. Six hex digits, the `#`
 * optional, apply as they are typed; anything less changes nothing and says
 * nothing. Leaving the field, or Enter, shows what applies as `#RRGGBB`, the
 * current colour again if what was typed is no colour. A press on the dot
 * opens the system colour panel, whose colour applies at once and is shown in
 * the field.
 */
function HexField({ color, onChange }: { color: string; onChange: (color: string) => void }) {
  const panel = useRef<HTMLInputElement | null>(null)
  const [draft, setDraft] = useState(() => shownHex(color))
  const [shownFor, setShownFor] = useState(color)
  // A colour from elsewhere (the panel) replaces the draft, unless the draft
  // already means it: then it is what is being typed, and stays as typed.
  if (color !== shownFor) {
    setShownFor(color)
    if (parseTypedHex(draft) !== color) setDraft(shownHex(color))
  }

  const settle = () => setDraft(shownHex(parseTypedHex(draft) ?? color))

  return (
    <InputGroup variant="pill" className="w-28">
      <InputGroupAddon>
        <Button
          variant="icon"
          size="icon-xs"
          className="rounded-full"
          aria-label="Pick a color"
          onClick={() => panel.current?.click()}
          data-testid="settings-primary-color-dot"
        >
          <Dot paint={color} className="size-3.5" />
        </Button>
      </InputGroupAddon>
      <InputGroupInput
        aria-label="Custom color"
        value={draft}
        maxLength={7}
        className="pl-1"
        onChange={(event) => {
          setDraft(event.target.value)
          const next = parseTypedHex(event.target.value)
          if (next && next !== color) onChange(next)
        }}
        onBlur={settle}
        onKeyDown={(event) => { if (event.key === 'Enter') settle() }}
        data-testid="settings-primary-color-hex"
      />
      <input
        ref={panel}
        type="color"
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        value={color}
        onChange={(event) => {
          const next = normalizePrimaryColor(event.target.value)
          if (next) onChange(next)
        }}
        data-testid="settings-primary-color-panel"
      />
    </InputGroup>
  )
}

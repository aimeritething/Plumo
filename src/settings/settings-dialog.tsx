import { useRef } from 'react'
import { X as XIcon } from '@phosphor-icons/react'
import type { ThemeMode } from '@/shell/theme-mode'
import { Button } from '@/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/ui/dialog'
import { ItemGroup, ItemSeparator } from '@/ui/item'
import { ScrollArea } from '@/ui/scroll-area'
import { SimpleTooltip } from '@/ui/tooltip'
import { PrimaryColorPicker } from './primary-color-picker'
import { ThemePicker } from './theme-picker'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
  primaryColor: string
  onPrimaryColorChange: (color: string) => void
}

/**
 * The Settings dialog (CONTEXT.md, Settings): one column under the title, a
 * section after another, each a muted name over a card whose rows are its
 * settings: the setting's name and a line about it on the left, its control
 * on the right. A change applies at once; there is no Save. Esc, the × and a
 * click outside close it. At most 680px wide and 32px clear of every window
 * edge: it is as tall as what it holds, and a window too short for that
 * scrolls it; a row too narrow for both sides puts the control under the name.
 */
export function SettingsDialog({ open, onClose, theme, onThemeChange, primaryColor, onPrimaryColorChange }: SettingsDialogProps) {
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        variant="panel"
        className="max-h-[calc(100vh-64px)] w-[min(680px,calc(100vw-64px))] max-w-none flex-col"
        ref={contentRef}
        // Focus lands on the dialog itself, not ringed on the close button; Tab goes on from there.
        initialFocus={contentRef}
        data-testid="settings-dialog"
        // The keyboard's modal rule lets ⌘W and ⌘, through to this dialog alone.
        data-settings-dialog="true"
      >
        <SimpleTooltip label="Close" side="bottom">
          <DialogClose render={<Button variant="icon" size="icon-xs" className="absolute top-3 right-3 z-raised" aria-label="Close" />}>
            <XIcon />
          </DialogClose>
        </SimpleTooltip>
        <ScrollArea className="min-h-0 flex-1" viewportClassName="px-10 pt-10 pb-10 max-[760px]:px-6">
          <DialogTitle className="text-2xl leading-8 font-semibold tracking-[-0.02em] text-foreground">Settings</DialogTitle>
          <section aria-labelledby="settings-section-appearance" className="mt-7 flex flex-col gap-2.5">
            <h2 id="settings-section-appearance" className="px-1 text-sm text-muted-foreground">Appearance</h2>
            <ItemGroup variant="card">
              <ThemePicker theme={theme} onChange={onThemeChange} />
              <ItemSeparator />
              <PrimaryColorPicker color={primaryColor} onChange={onPrimaryColorChange} />
            </ItemGroup>
          </section>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}

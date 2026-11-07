import { useState, type ComponentType } from 'react'
import { Palette, X as XIcon, type IconProps } from '@phosphor-icons/react'
import { SIDEBAR_ROW_CLASSES, SidebarRowIcon, SidebarRowName } from '@/shell/sidebar-row'
import type { ThemeMode } from '@/shell/theme-mode'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/ui/dialog'
import { ScrollArea } from '@/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { PrimaryColorPicker } from './primary-color-picker'
import { ThemePicker } from './theme-picker'

type SettingsSectionId = 'appearance'

const SETTINGS_SECTIONS: readonly { id: SettingsSectionId; label: string; icon: ComponentType<IconProps> }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
]

/** The sidebar row's selected look, for the section shown. */
const SECTION_CURRENT_CLASSES = 'aria-[current=page]:bg-sidebar-selected aria-[current=page]:text-sidebar-foreground'

interface SettingsDialogProps {
  open: boolean
  onClose: () => void
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
  primaryColor: string
  onPrimaryColorChange: (color: string) => void
}

/**
 * The Settings dialog (CONTEXT.md, Settings): the sections down the left, the
 * chosen one's settings on the right under its name. A change applies at
 * once; there is no Save. Esc, the × and a click outside close it. At most
 * 840×580 and 32px clear of every window edge: a narrow window narrows the
 * nav and shrinks the theme cards, a short one scrolls the right pane.
 */
export function SettingsDialog({ open, onClose, theme, onThemeChange, primaryColor, onPrimaryColorChange }: SettingsDialogProps) {
  const [sectionId, setSectionId] = useState<SettingsSectionId>('appearance')
  const section = SETTINGS_SECTIONS.find(({ id }) => id === sectionId) ?? SETTINGS_SECTIONS[0]

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent
        variant="bare"
        className="flex h-[min(580px,calc(100vh-64px))] w-[min(840px,calc(100vw-64px))] max-w-none gap-0 overflow-hidden rounded-xl border-hairline border-border bg-popover text-foreground shadow-lg"
        aria-describedby={undefined}
        // Focus lands on the dialog itself, not ringed on the first nav row; Tab goes on from there.
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
        }}
        data-testid="settings-dialog"
        // The keyboard's modal rule lets ⌘W and ⌘, through to this dialog alone.
        data-settings-dialog="true"
      >
        <nav aria-label="Settings sections" className="flex w-54 flex-none flex-col gap-0.5 bg-sidebar px-3 py-5 max-[760px]:w-40">
          <DialogTitle className="px-2.5 pt-1 pb-3 text-sm leading-4 font-semibold text-foreground">Settings</DialogTitle>
          {SETTINGS_SECTIONS.map(({ id, label, icon }) => (
            <button
              key={id}
              type="button"
              aria-current={id === section.id ? 'page' : undefined}
              className={cn(SIDEBAR_ROW_CLASSES, SECTION_CURRENT_CLASSES, 'w-full px-2.5 text-sm')}
              onClick={() => setSectionId(id)}
              data-testid={`settings-section:${id}`}
            >
              <SidebarRowIcon icon={icon} className="group-aria-[current=page]:text-foreground" />
              <SidebarRowName className="text-left">{label}</SidebarRowName>
            </button>
          ))}
        </nav>
        <section aria-labelledby="settings-section-title" className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-17 flex-none items-center justify-between pr-4 pl-10 max-[760px]:pl-6">
            <h2 id="settings-section-title" className="text-lg font-semibold tracking-[-0.01em] text-foreground">{section.label}</h2>
            <Tooltip>
              <TooltipTrigger asChild>
                <DialogClose asChild>
                  <Button variant="icon" size="icon-xs" aria-label="Close">
                    <XIcon />
                  </Button>
                </DialogClose>
              </TooltipTrigger>
              <TooltipContent side="bottom">Close</TooltipContent>
            </Tooltip>
          </header>
          <ScrollArea className="min-h-0 flex-1" viewportClassName="px-10 pt-1 pb-10 max-[760px]:px-6">
            {section.id === 'appearance' && (
              <div className="flex flex-col gap-9">
                <ThemePicker theme={theme} onChange={onThemeChange} />
                <PrimaryColorPicker color={primaryColor} onChange={onPrimaryColorChange} />
              </div>
            )}
          </ScrollArea>
        </section>
      </DialogContent>
    </Dialog>
  )
}

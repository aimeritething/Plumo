import { useState, type ComponentType } from 'react'
import { Palette, X as XIcon, type IconProps } from '@phosphor-icons/react'
import type { ThemeMode } from '@/shell/theme-mode'
import { Button } from '@/ui/button'
import { Dialog, DialogClose, DialogContent, DialogTitle } from '@/ui/dialog'
import { ScrollArea } from '@/ui/scroll-area'
import { Sidebar, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarProvider } from '@/ui/sidebar'
import { SimpleTooltip } from '@/ui/tooltip'
import { PrimaryColorPicker } from './primary-color-picker'
import { ThemePicker } from './theme-picker'

type SettingsSectionId = 'appearance'

const SETTINGS_SECTIONS: readonly { id: SettingsSectionId; label: string; icon: ComponentType<IconProps> }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
]

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
 *
 * The nav is a sidebar of its own, as shadcn's sidebar in a dialog is: its
 * own `SidebarProvider` (the dialog is portalled, and its nav is not the
 * window's sidebar) around a `Sidebar` that does not collapse, so the
 * section rows are the sidebar's rows.
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
        <SidebarProvider className="min-h-0 w-auto flex-none">
          <Sidebar collapsible="none" className="w-54 border-r-hairline border-sidebar-border px-3 py-5 max-[760px]:w-40">
            <nav aria-label="Settings sections" className="flex flex-col">
              <DialogTitle className="px-2 pt-1 pb-3 text-sm leading-4 font-semibold text-foreground">Settings</DialogTitle>
              <SidebarMenu>
                {SETTINGS_SECTIONS.map(({ id, label, icon: Icon }) => (
                  <SidebarMenuItem key={id}>
                    <SidebarMenuButton
                      isActive={id === section.id}
                      aria-current={id === section.id ? 'page' : undefined}
                      onClick={() => setSectionId(id)}
                      data-testid={`settings-section:${id}`}
                    >
                      <Icon aria-hidden="true" />
                      <span>{label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </Sidebar>
        </SidebarProvider>
        <section aria-labelledby="settings-section-title" className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-17 flex-none items-center justify-between pr-4 pl-10 max-[760px]:pl-6">
            <h2 id="settings-section-title" className="text-lg font-semibold tracking-[-0.01em] text-foreground">{section.label}</h2>
            <SimpleTooltip label="Close" side="bottom">
              <DialogClose asChild>
                <Button variant="icon" size="icon-xs" aria-label="Close">
                  <XIcon />
                </Button>
              </DialogClose>
            </SimpleTooltip>
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

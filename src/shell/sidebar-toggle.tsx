import { SidebarTrigger, useSidebar } from '@/ui/sidebar'
import { SimpleTooltip } from '@/ui/tooltip'

const SHORTCUT = '⌘['

/**
 * The sidebar's one affordance: shadcn's SidebarTrigger, a 24px icon button
 * laid over the window's top-left corner, one element in both states, so it
 * holds still while the sidebar slides under it. `trafficLightPosition` in
 * tauri.conf.json sets the lights 20px in, level with the sidebar's labels
 * and as far from the left edge as from the top, and centres them on the
 * 52px top row (y 28 puts their centre at 26). Their centres fall at x 27, 50
 * and 73, 23px apart; the icon (x 84) centres at 96, the next step of that
 * pitch, so it reads as a fourth light. The sidebar's top row and
 * the collapsed tab bar leave it that room and drag the window; the button
 * does not. Its tooltip carries the shortcut as a chip, `Show sidebar ⌘[`,
 * because the collapsed window has nothing else to say how to get the
 * sidebar back.
 */
export function SidebarToggle() {
  const label = useSidebar().open ? 'Hide sidebar' : 'Show sidebar'
  return (
    <SimpleTooltip label={label} side="bottom" shortcut={SHORTCUT}>
      <SidebarTrigger
        className="absolute top-3.5 left-21 z-raised"
        aria-label={label}
        data-testid="sidebar-toggle"
      />
    </SimpleTooltip>
  )
}

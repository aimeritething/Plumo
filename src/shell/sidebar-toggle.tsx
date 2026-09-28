import { SidebarSimple } from '@phosphor-icons/react'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

const SHORTCUT = '⌘['

interface SidebarToggleProps {
  collapsed: boolean
  onToggle: () => void
}

/**
 * The sidebar's one affordance: a 24px icon button laid over the window's
 * top-left corner, one element in both states, so it holds still while the
 * sidebar slides under it. `trafficLightPosition` in tauri.conf.json sets the
 * lights 13px in and centres them on the 52px top row (y 28 puts their
 * centre at 26), and the three lights end by x 73; the icon follows at x 82,
 * centred on the same row. The sidebar's top row and the collapsed tab bar
 * leave it that room and drag the window; the button does not. Its tooltip
 * carries the shortcut as a chip, `Show sidebar ⌘[`, because the collapsed
 * window has nothing else to say how to get the sidebar back.
 */
export function SidebarToggle({ collapsed, onToggle }: SidebarToggleProps) {
  const label = collapsed ? 'Show sidebar' : 'Hide sidebar'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="icon"
          size="icon-xs"
          className="absolute top-3.5 left-20.5 z-raised"
          aria-label={label}
          data-testid="sidebar-toggle"
          onClick={onToggle}
        >
          <SidebarSimple aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" shortcut={SHORTCUT}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

import { SidebarSimple } from '@phosphor-icons/react'
import { Button } from '@/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'

const SHORTCUT = '⌘['

interface SidebarToggleProps {
  collapsed: boolean
  onToggle: () => void
}

/**
 * The sidebar's one affordance, in one place in both states: right of the
 * traffic lights, on the sidebar's top row while it is shown and on the tab
 * bar while it is collapsed. A 24px icon button; both rows it sits on
 * drag the window, the button does not. Its tooltip carries the shortcut as a
 * chip, `Show sidebar ⌘[`, because the collapsed window has nothing else to
 * say how to get the sidebar back.
 */
export function SidebarToggle({ collapsed, onToggle }: SidebarToggleProps) {
  const label = collapsed ? 'Show sidebar' : 'Hide sidebar'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="icon" size="icon-xs" aria-label={label} data-testid="sidebar-toggle" onClick={onToggle}>
          <SidebarSimple aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" shortcut={SHORTCUT}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The room macOS draws the traffic lights in, whatever the DOM holds:
 * `trafficLightPosition` in tauri.conf.json sets them 13px in and centres
 * them on the 52px top row (y 28 puts their centre at 26), and the three
 * lights end by x 73. The room is 70px and the sidebar icon follows 12px
 * later, at x 82, in both states.
 */
export function TrafficLightsRoom() {
  return <span className="w-17.5 flex-none" data-testid="traffic-lights" aria-hidden="true" />
}

/**
 * What the tab bar starts with while the sidebar is collapsed and the editor
 * goes to the window's left edge: the traffic lights' room and the sidebar
 * icon, then the first Tab 14px after it.
 */
export function CollapsedChrome({ onShowSidebar }: { onShowSidebar: () => void }) {
  return (
    <div className="mr-2.5 flex h-full flex-none items-center gap-3" data-testid="collapsed-chrome">
      <TrafficLightsRoom />
      <SidebarToggle collapsed onToggle={onShowSidebar} />
    </div>
  )
}

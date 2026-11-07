import type { ReactNode } from 'react'
import { SidebarProvider } from './sidebar'
import { TooltipProvider } from './tooltip'

/**
 * What a sidebar section renders under in the app: main.tsx's tooltip
 * provider and the shell's `SidebarProvider`, which every `SidebarMenuButton`
 * reads.
 */
export function SidebarTestProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider>
      <SidebarProvider>{children}</SidebarProvider>
    </TooltipProvider>
  )
}

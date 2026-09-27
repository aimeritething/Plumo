import type { ComponentProps } from 'react'
import { cn } from '@/lib/cn'

/**
 * The card a block's floating icon buttons sit in: the popover surface and the
 * raised shadow, one card per block, so the buttons read over whatever the
 * block shows beneath them.
 */
export function FloatingIconGroup({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center gap-0.5 rounded-lg bg-surface-popover p-0.5 shadow-raised', className)} {...props} />
}

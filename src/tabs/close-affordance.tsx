import type { MouseEvent } from 'react'
import { X } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'

interface CloseAffordanceProps {
  /** The name of the thing that closes, for the accessible label. */
  name: string
  onClose: () => void
  className?: string
}

/**
 * The × that closes a Tab from the tab bar: out of the layout until its Tab
 * is hovered (the Tab is a `group`), then laid out after the name, so the Tab
 * grows to make room rather than covering the name. The click stops at the
 * button so the Tab underneath is not activated.
 */
export function CloseAffordance({ name, onClose, className }: CloseAffordanceProps) {
  const close = (event: MouseEvent) => {
    event.stopPropagation()
    onClose()
  }

  return (
    <Button
      variant="icon"
      size="icon-2xs"
      className={cn('hidden group-hover:flex', className)}
      aria-label={`Close ${name}`}
      data-testid="tab-close"
      tabIndex={-1}
      onClick={close}
    >
      <X aria-hidden="true" />
    </Button>
  )
}

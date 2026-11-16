import type { MouseEvent } from 'react'
import { X } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'
import { Button } from '@/ui/button'
import { SimpleTooltip } from '@/ui/tooltip'

interface CloseAffordanceProps {
  /** The name of the thing that closes, for the accessible label. */
  name: string
  onClose: () => void
  className?: string
}

/**
 * The × that closes a Tab from the tab bar: out of the layout until its Tab
 * is hovered (the Tab is a `group`), so at rest the name has the whole Tab,
 * then laid out at the Tab's right end. The Tab is a fixed width, so the ×
 * takes its room from the name, which is cut shorter, and no Tab moves. It
 * looks 18px across; what takes the click reaches 6px past it on every side,
 * the whole right end of the Tab. The click stops at the button so the Tab underneath is not
 * activated, and so does the press, so it never picks the Tab up to move it.
 */
export function CloseAffordance({ name, onClose, className }: CloseAffordanceProps) {
  const close = (event: MouseEvent) => {
    event.stopPropagation()
    onClose()
  }

  return (
    <SimpleTooltip label="Close Tab" side="bottom">
      <Button
        variant="icon"
        size="icon-2xs"
        className={cn('relative ml-auto hidden group-hover:flex after:absolute after:-inset-1.5', className)}
        aria-label={`Close ${name}`}
        data-testid="tab-close"
        tabIndex={-1}
        onClick={close}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <X aria-hidden="true" />
      </Button>
    </SimpleTooltip>
  )
}

import { cn } from '@/lib/cn'
import { surfaceVariants } from '@/ui/surface'

/**
 * Laid over an editor, Rich or Raw, while an Image file is dragged over it.
 * It takes no pointer events, so the editor under it still answers the hit
 * tests that decide where the drop lands. The label sits on the popover
 * surface, as anything floating over the editor does.
 */
export function ImageDropAffordance() {
  return (
    <div className="pointer-events-none absolute inset-0 z-overlay flex items-center justify-center bg-primary-muted">
      <div className={cn(surfaceVariants(), 'px-5 py-2.5 text-sm font-medium text-primary')}>Drop image here</div>
    </div>
  )
}

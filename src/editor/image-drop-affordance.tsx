/**
 * Laid over an editor, Rich or Raw, while an Image file is dragged over it.
 * It takes no pointer events, so the editor under it still answers the hit
 * tests that decide where the drop lands.
 */
export function ImageDropAffordance() {
  return (
    <div className="pointer-events-none absolute inset-0 z-overlay flex items-center justify-center bg-state-drag-target">
      <div className="rounded-lg bg-surface-popover px-5 py-2.5 text-sm font-medium text-accent-base shadow-menu">Drop image here</div>
    </div>
  )
}

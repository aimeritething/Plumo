import { Button } from '@/ui/button'
import { clockTime, couldNotSaveTo, type WriteFailureAction } from './use-write-failures'

export interface WriteFailureBarProps {
  path: string
  /** What the boundary said when it refused the write. */
  message: string
  /** When a Retry, or a write after one, was last refused (epoch ms); absent for a first refusal. */
  failedAgainAt?: number
  /** A Retry or Discard changes in flight: it says so, and neither button takes another click until it settles. */
  pending?: WriteFailureAction | null
  onRetry: () => void
  onDiscard: () => void
}

/**
 * The error bar: shown on a Tab whose last write was
 * refused, between the tab bar and the content. The buffer keeps the edit;
 * Retry writes it again and Discard changes puts the disk bytes back. Drawn as
 * a Linear callout in the red chromatic role (the accent at 2% behind, a 20%
 * hairline around, 6px radius), with Retry as the primary control. Never on
 * an Image Tab, which is never written. A Retry refused again changes the
 * heading to "Still couldn't save to …" with the time of the last refusal,
 * kept clear of the path's truncation, so the click visibly got an answer.
 */
export function WriteFailureBar({ path, message, failedAgainAt, pending = null, onRetry, onDiscard }: WriteFailureBarProps) {
  return (
    <div
      className="mx-4 mb-2 flex flex-none items-center gap-3 rounded-md bg-chroma-red/2 py-2 pr-2 pl-3 text-sm tracking-[-0.01em] ring-(length:--hairline) ring-chroma-red/20"
      role="alert"
      data-testid="write-failure-bar"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 font-medium text-chroma-red-text">
          <span className="truncate">{couldNotSaveTo(failedAgainAt)} {path}</span>
          {failedAgainAt !== undefined && <span className="flex-none whitespace-pre"> · {clockTime(failedAgainAt)}</span>}
        </span>
        <span className="truncate font-mono text-2xs tracking-normal text-text-secondary">{message}</span>
      </div>
      <div className="ml-auto flex flex-none gap-1.5">
        <Button size="sm" disabled={pending !== null} aria-busy={pending === 'retry'} onClick={onRetry}>
          {pending === 'retry' ? 'Retrying…' : 'Retry'}
        </Button>
        <Button size="sm" variant="secondary" disabled={pending !== null} aria-busy={pending === 'discard'} onClick={onDiscard}>
          {pending === 'discard' ? 'Discarding…' : 'Discard changes'}
        </Button>
      </div>
    </div>
  )
}

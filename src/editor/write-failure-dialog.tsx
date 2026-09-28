import { clockTime, couldNotSaveTo, type WritePrompt, type WritePromptChoice } from './use-write-failures'
import { Button } from '@/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/ui/dialog'

export interface WriteFailureDialogProps {
  prompt: WritePrompt | null
  /** The answer in flight: it says so, and no button takes another click until it settles. */
  pending?: WritePromptChoice | null
  onAnswer: (choice: WritePromptChoice) => void
  /** Escape or a click outside: keep the Tab, or the app, open with its bar. */
  onDismiss: () => void
}

/**
 * The only prompt in the app: closing a Tab whose write was
 * refused asks Retry or Discard changes instead of closing silently; ⌘Q with a
 * refused flush asks the same plus Discard and quit. Retry is the primary
 * control, the rest are the secondary control. The `default` dialog; the
 * title and the mono detail wrap anywhere, since both carry a path. A Retry
 * refused again reads "Still couldn't save to …", as the bar does.
 */
export function WriteFailureDialog({ prompt, pending = null, onAnswer, onDismiss }: WriteFailureDialogProps) {
  const busy = pending !== null
  return (
    <Dialog open={prompt !== null} onOpenChange={(open) => { if (!open) onDismiss() }}>
      {prompt && (
        <DialogContent showCloseButton={false} data-testid="write-failure-dialog">
          <DialogHeader>
            <DialogTitle className="text-base font-medium tracking-[-0.01em] wrap-anywhere">
              {couldNotSaveTo(prompt.failedAgainAt)} {prompt.path}
              {prompt.failedAgainAt !== undefined && ` · ${clockTime(prompt.failedAgainAt)}`}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs tracking-normal wrap-anywhere">{prompt.message}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button size="sm" disabled={busy} aria-busy={pending === 'retry'} onClick={() => onAnswer('retry')}>
              {pending === 'retry' ? 'Retrying…' : 'Retry'}
            </Button>
            <Button size="sm" variant="secondary" disabled={busy} aria-busy={pending === 'discard'} onClick={() => onAnswer('discard')}>
              {pending === 'discard' ? 'Discarding…' : 'Discard changes'}
            </Button>
            {prompt.kind === 'quit' && (
              <Button
                size="sm"
                variant="secondary"
                disabled={busy}
                aria-busy={pending === 'discardAndQuit'}
                onClick={() => onAnswer('discardAndQuit')}
              >
                {pending === 'discardAndQuit' ? 'Quitting…' : 'Discard and quit'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  )
}

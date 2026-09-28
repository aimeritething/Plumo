import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react'
import type { Tab } from '@/types'

/**
 * Write failure: the only prompt in the app. A refused write
 * keeps the Tab open with an error bar offering Retry and Discard changes;
 * closing that Tab offers the same two instead of closing silently; ⌘Q writes
 * every pending edit first and, when one is refused, stays open with the same
 * choices plus Discard and quit. `useWriteFailureRecord` is the failure of
 * each Document; `useWriteFailures` adds the actions and the one prompt on
 * top of it. The save hook keeps the buffer, the Tabs hold the bytes.
 */

export interface WriteFailure {
  path: string
  /** What the boundary said when it refused the write. */
  message: string
}

export interface WritePrompt {
  /** `close`: the user closed a Tab whose write was refused; `quit`: ⌘Q could not flush this Document. */
  kind: 'close' | 'quit'
  path: string
  message: string
}

export type WritePromptChoice = 'retry' | 'discard' | 'discardAndQuit'

/** What the error bar is doing for a Document while the boundary answers. */
export type WriteFailureAction = 'retry' | 'discard'

export interface WriteFailureRecord {
  /** The Document's failure while its last write stands refused, else null. */
  failureFor: (path: string | null) => WriteFailure | null
  recordFailure: (path: string, error: unknown) => void
  /** A write landed (from any path): the bar goes away. */
  clearFailure: (path: string) => void
  /** The record as of now, for a decision made before React re-renders. */
  failuresRef: MutableRefObject<Readonly<Record<string, string>>>
}

export interface WriteFailureDeps {
  record: WriteFailureRecord
  tabs: Tab[]
  activeTabPath: string | null
  /** Push the active Document's fresh keystrokes into its buffer and write it; rejects when refused. */
  settleActiveNote: () => Promise<void>
  /** Write the Document's buffer again, `content` being the Tab's copy of it; rejects when refused. */
  writeBuffer: (path: string, content: string) => Promise<void>
  /** Drop the Document's buffered edits and put the disk bytes back in its Tab; rejects when the file is gone. */
  revertToDisk: (path: string) => Promise<void>
  closeTab: (path: string) => void
  exitApp: () => Promise<void>
}

export interface WriteFailures extends WriteFailureRecord {
  /** The deps' settle, with a refusal recorded against the active Document before it propagates. */
  settleAndRecord: () => Promise<void>
  /** The bar's Retry: true once the write lands. */
  retry: (path: string) => Promise<boolean>
  /** The bar's Discard changes: true once the disk bytes are back (or the Tab is closed, the file being gone). */
  discard: (path: string) => Promise<boolean>
  /** The Retry or Discard changes in flight for a Document, else null; the bar's buttons wait on it. */
  pendingFor: (path: string | null) => WriteFailureAction | null
  /** Close a Tab, or ask first when its last write stands refused. */
  closeTabOrAsk: (path: string) => void
  /** ⌘Q: write every pending edit, then exit; ask about the first refusal instead. */
  quit: () => Promise<void>
  prompt: WritePrompt | null
  answerPrompt: (choice: WritePromptChoice) => Promise<void>
  /** The prompt's answer in flight, else null; the prompt's buttons wait on it. */
  promptPending: WritePromptChoice | null
  /** Escape: keep the Tab, or the app, open with its bar. */
  dismissPrompt: () => void
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** State whose ref is updated in the same tick as the setter, for decisions made before React re-renders. */
function useStateWithRef<T>(initial: T): [T, MutableRefObject<T>, (next: T) => void] {
  const [value, setValue] = useState(initial)
  const ref = useRef(value)
  const set = useCallback((next: T) => {
    ref.current = next
    setValue(next)
  }, [])
  return [value, ref, set]
}

export function useWriteFailureRecord(): WriteFailureRecord {
  const [failures, failuresRef, setFailures] = useStateWithRef<Readonly<Record<string, string>>>({})

  const recordFailure = useCallback((path: string, error: unknown) => {
    console.error(`Could not save ${path}:`, error)
    setFailures({ ...failuresRef.current, [path]: messageOf(error) })
  }, [failuresRef, setFailures])

  const clearFailure = useCallback((path: string) => {
    if (!(path in failuresRef.current)) return
    const { [path]: _cleared, ...rest } = failuresRef.current
    void _cleared
    setFailures(rest)
  }, [failuresRef, setFailures])

  const failureFor = useCallback(
    (path: string | null): WriteFailure | null => {
      if (path === null) return null
      const message = failures[path]
      return message === undefined ? null : { path, message }
    },
    [failures],
  )

  return { failureFor, recordFailure, clearFailure, failuresRef }
}

export function useWriteFailures(deps: WriteFailureDeps): WriteFailures {
  const { record } = deps
  const { recordFailure, clearFailure, failuresRef } = record
  const depsRef = useRef(deps)
  useEffect(() => {
    depsRef.current = deps
  }, [deps])

  const [prompt, promptRef, showPrompt] = useStateWithRef<WritePrompt | null>(null)

  const settleAndRecord = useCallback(async () => {
    const { activeTabPath, settleActiveNote } = depsRef.current
    try {
      await settleActiveNote()
    } catch (error) {
      if (activeTabPath) recordFailure(activeTabPath, error)
      throw error
    }
  }, [recordFailure])

  /**
   * One Retry or Discard changes per Document at a time: asked again while
   * one is in flight, the answer is the one already coming, so a burst of
   * clicks writes once. The bar shows which is in flight meanwhile.
   */
  const [pending, pendingRef, setPending] = useStateWithRef<Readonly<Record<string, WriteFailureAction>>>({})
  const inFlight = useRef(new Map<string, Promise<boolean>>())
  const once = useCallback(
    (path: string, action: WriteFailureAction, run: () => Promise<boolean>): Promise<boolean> => {
      const running = inFlight.current.get(path)
      if (running) return running
      setPending({ ...pendingRef.current, [path]: action })
      const settled = run().finally(() => {
        inFlight.current.delete(path)
        const { [path]: _done, ...rest } = pendingRef.current
        void _done
        setPending(rest)
      })
      inFlight.current.set(path, settled)
      return settled
    },
    [pendingRef, setPending],
  )

  const pendingFor = useCallback(
    (path: string | null): WriteFailureAction | null => (path === null ? null : pending[path] ?? null),
    [pending],
  )

  /** Write the Document's buffer again; a Document that is no longer open has nothing left to write. */
  const writeAgain = useCallback(
    async (path: string): Promise<boolean> => {
      const tab = depsRef.current.tabs.find((candidate) => candidate.entry.path === path)
      if (!tab) {
        clearFailure(path)
        return true
      }
      try {
        await depsRef.current.writeBuffer(path, tab.content)
      } catch (error) {
        recordFailure(path, error)
        return false
      }
      clearFailure(path)
      return true
    },
    [clearFailure, recordFailure],
  )
  const retry = useCallback((path: string) => once(path, 'retry', () => writeAgain(path)), [once, writeAgain])

  /**
   * Put the disk bytes back. A file that cannot be read any more has no bytes
   * to go back to: the Document is gone, so its Tab closes (the rule for a
   * Document deleted from outside).
   */
  const revert = useCallback(
    async (path: string): Promise<boolean> => {
      try {
        await depsRef.current.revertToDisk(path)
      } catch (error) {
        console.warn(`Closing ${path}: it could not be read back from disk:`, error)
        depsRef.current.closeTab(path)
      }
      clearFailure(path)
      return true
    },
    [clearFailure],
  )
  const discard = useCallback((path: string) => once(path, 'discard', () => revert(path)), [once, revert])

  const closeTabOrAsk = useCallback(
    (path: string) => {
      const message = failuresRef.current[path]
      if (message === undefined) {
        depsRef.current.closeTab(path)
        return
      }
      showPrompt({ kind: 'close', path, message })
    },
    [failuresRef, showPrompt],
  )

  const exit = useCallback(async () => {
    showPrompt(null)
    try {
      await depsRef.current.exitApp()
    } catch (error) {
      console.error('Could not quit:', error)
    }
  }, [showPrompt])

  /** Write every refused Document again, in Tab order; ask about the first that is refused again, else exit. */
  const continueQuit = useCallback(async () => {
    for (const tab of depsRef.current.tabs) {
      const path = tab.entry.path
      if (!(path in failuresRef.current)) continue
      if (await retry(path)) continue
      showPrompt({ kind: 'quit', path, message: failuresRef.current[path] })
      return
    }
    await exit()
  }, [exit, failuresRef, retry, showPrompt])

  const quit = useCallback(async () => {
    try {
      await settleAndRecord()
    } catch {
      // Recorded against the active Document; the loop below asks about it.
    }
    await continueQuit()
  }, [continueQuit, settleAndRecord])

  /** The prompt answers one choice at a time, so a burst of clicks is one answer. */
  const [promptPending, promptPendingRef, setPromptPending] = useStateWithRef<WritePromptChoice | null>(null)

  const answer = useCallback(
    async (current: WritePrompt, choice: WritePromptChoice) => {
      if (choice === 'discardAndQuit') {
        await exit()
        return
      }
      const resolved = choice === 'retry' ? await retry(current.path) : await discard(current.path)
      if (!resolved) {
        showPrompt({ ...current, message: failuresRef.current[current.path] ?? current.message })
        return
      }
      if (current.kind === 'close') {
        showPrompt(null)
        depsRef.current.closeTab(current.path)
        return
      }
      await continueQuit()
    },
    [continueQuit, discard, exit, failuresRef, retry, showPrompt],
  )

  const answerPrompt = useCallback(
    async (choice: WritePromptChoice) => {
      const current = promptRef.current
      if (!current || promptPendingRef.current !== null) return
      setPromptPending(choice)
      try {
        await answer(current, choice)
      } finally {
        setPromptPending(null)
      }
    },
    [answer, promptPendingRef, promptRef, setPromptPending],
  )

  const dismissPrompt = useCallback(() => showPrompt(null), [showPrompt])

  return {
    ...record,
    settleAndRecord,
    retry,
    discard,
    pendingFor,
    closeTabOrAsk,
    quit,
    prompt,
    answerPrompt,
    promptPending,
    dismissPrompt,
  }
}

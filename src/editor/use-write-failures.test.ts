import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Tab } from '@/types'
import { noteEntryForPath } from '@/folder/note-entry'
import { useWriteFailureRecord, useWriteFailures, type WriteFailureDeps } from './use-write-failures'

const A = '/n/a.md'
const B = '/n/b.md'

const tab = (path: string, content: string): Tab => ({ entry: noteEntryForPath(path, content), content })

const REFUSED = new Error('Failed to write file: Permission denied (os error 13)')

/**
 * The deps record every call in `order`; an override supplies only the
 * behaviour (resolve or throw) and the recording stays.
 */
type Behaviours = Partial<Omit<WriteFailureDeps, 'record'>>

function renderFailures(overrides: Behaviours = {}) {
  const order: string[] = []
  const recorded = <A extends unknown[]>(label: (...args: A) => string, behaviour?: (...args: A) => Promise<void>) =>
    vi.fn(async (...args: A) => {
      order.push(label(...args))
      await behaviour?.(...args)
    })
  const deps: Omit<WriteFailureDeps, 'record'> = {
    tabs: overrides.tabs ?? [tab(A, '# A\n\nEdited'), tab(B, '# B\n\nEdited')],
    activeTabPath: overrides.activeTabPath ?? A,
    settleActiveNote: recorded(() => 'settle', overrides.settleActiveNote),
    writeBuffer: recorded((path: string) => `write ${path}`, overrides.writeBuffer),
    revertToDisk: recorded((path: string) => `revert ${path}`, overrides.revertToDisk),
    closeTab: vi.fn((path: string) => {
      order.push(`close ${path}`)
      overrides.closeTab?.(path)
    }),
    exitApp: recorded(() => 'exit', overrides.exitApp),
  }
  const rendered = renderHook(() => useWriteFailures({ record: useWriteFailureRecord(), ...deps }))
  return { ...rendered, deps, order }
}

describe('useWriteFailures', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  describe('the error bar', () => {
    it('records a refused write against its Document and clears it on demand', () => {
      const { result } = renderFailures()

      act(() => {
        result.current.recordFailure(A, REFUSED)
      })
      expect(result.current.failureFor(A)).toEqual({ path: A, message: 'Failed to write file: Permission denied (os error 13)' })
      expect(result.current.failureFor(B)).toBeNull()
      expect(result.current.failureFor(null)).toBeNull()

      act(() => {
        result.current.clearFailure(A)
      })
      expect(result.current.failureFor(A)).toBeNull()
    })

    it('keeps a non-Error rejection readable, as the boundary rejects with strings', () => {
      const { result } = renderFailures()

      act(() => {
        result.current.recordFailure(A, 'Path must stay inside the active vault')
      })

      expect(result.current.failureFor(A)?.message).toBe('Path must stay inside the active vault')
    })

    it('a settle that fails is recorded against the active Document and still rejects', async () => {
      const { result, deps } = renderFailures({ settleActiveNote: async () => { throw REFUSED } })

      await act(async () => {
        await expect(result.current.settleAndRecord()).rejects.toBe(REFUSED)
      })

      expect(deps.settleActiveNote).toHaveBeenCalledOnce()
      expect(result.current.failureFor(A)?.message).toContain('Permission denied')
    })

    it('Retry writes the Tab\'s buffer again and clears the bar when the write lands', async () => {
      const { result, deps } = renderFailures()
      act(() => {
        result.current.recordFailure(A, REFUSED)
      })

      let retried = false
      await act(async () => {
        retried = await result.current.retry(A)
      })

      expect(retried).toBe(true)
      expect(deps.writeBuffer).toHaveBeenCalledWith(A, '# A\n\nEdited')
      expect(result.current.failureFor(A)).toBeNull()
    })

    it('Retry keeps the bar, with the fresh message, when the write is refused again', async () => {
      const { result } = renderFailures({
        writeBuffer: async () => { throw new Error('Disk full') },
      })
      act(() => {
        result.current.recordFailure(A, REFUSED)
      })

      let retried = true
      await act(async () => {
        retried = await result.current.retry(A)
      })

      expect(retried).toBe(false)
      expect(result.current.failureFor(A)?.message).toBe('Disk full')
    })

    describe('a Retry refused again', () => {
      beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] })
      })
      afterEach(() => {
        vi.useRealTimers()
      })

      it('is told apart from the first refusal by the time it was refused, which each further refusal moves on', async () => {
        const { result } = renderFailures({ writeBuffer: async () => { throw new Error('Disk full') } })
        vi.setSystemTime(new Date(2026, 8, 28, 14, 30))
        act(() => {
          result.current.recordFailure(A, REFUSED)
        })
        expect(result.current.failureFor(A)?.failedAgainAt).toBeUndefined()

        vi.setSystemTime(new Date(2026, 8, 28, 14, 32))
        await act(async () => {
          await result.current.retry(A)
        })
        expect(result.current.failureFor(A)).toEqual({ path: A, message: 'Disk full', failedAgainAt: new Date(2026, 8, 28, 14, 32).getTime() })

        vi.setSystemTime(new Date(2026, 8, 28, 14, 35))
        await act(async () => {
          await result.current.retry(A)
        })
        expect(result.current.failureFor(A)?.failedAgainAt).toBe(new Date(2026, 8, 28, 14, 35).getTime())

        // An Autosave refused after that is one more failed attempt: the time moves on too.
        vi.setSystemTime(new Date(2026, 8, 28, 14, 36))
        act(() => {
          result.current.recordFailure(A, REFUSED)
        })
        expect(result.current.failureFor(A)?.failedAgainAt).toBe(new Date(2026, 8, 28, 14, 36).getTime())
      })

      it('an Autosave refused again before any Retry is still the first refusal', () => {
        const { result } = renderFailures()
        act(() => {
          result.current.recordFailure(A, REFUSED)
          result.current.recordFailure(A, REFUSED)
        })

        expect(result.current.failureFor(A)?.failedAgainAt).toBeUndefined()
      })

      it('is forgotten once a write lands or the changes are discarded, so a later refusal is a first one again', async () => {
        let refuse = true
        const { result } = renderFailures({ writeBuffer: async () => { if (refuse) throw REFUSED } })
        act(() => {
          result.current.recordFailure(A, REFUSED)
        })
        await act(async () => {
          await result.current.retry(A)
        })
        expect(result.current.failureFor(A)?.failedAgainAt).toBeDefined()

        refuse = false
        await act(async () => {
          await result.current.retry(A)
        })
        expect(result.current.failureFor(A)).toBeNull()
        act(() => {
          result.current.recordFailure(A, REFUSED)
        })
        expect(result.current.failureFor(A)).toEqual({ path: A, message: REFUSED.message })

        refuse = true
        await act(async () => {
          await result.current.retry(A)
        })
        await act(async () => {
          await result.current.discard(A)
        })
        act(() => {
          result.current.recordFailure(A, REFUSED)
        })
        expect(result.current.failureFor(A)?.failedAgainAt).toBeUndefined()
      })

      it('carries into the close prompt, and a Retry refused there moves it on', async () => {
        const { result } = renderFailures({ writeBuffer: async () => { throw REFUSED } })
        act(() => {
          result.current.recordFailure(A, REFUSED)
        })
        vi.setSystemTime(new Date(2026, 8, 28, 14, 32))
        await act(async () => {
          await result.current.retry(A)
        })

        act(() => {
          result.current.closeTabOrAsk(A)
        })
        expect(result.current.prompt).toEqual({ kind: 'close', path: A, message: REFUSED.message, failedAgainAt: new Date(2026, 8, 28, 14, 32).getTime() })

        vi.setSystemTime(new Date(2026, 8, 28, 14, 40))
        await act(async () => {
          await result.current.answerPrompt('retry')
        })
        expect(result.current.prompt?.failedAgainAt).toBe(new Date(2026, 8, 28, 14, 40).getTime())
      })
    })

    it('Discard changes puts the disk bytes back and clears the bar', async () => {
      const { result, deps } = renderFailures()
      act(() => {
        result.current.recordFailure(A, REFUSED)
      })

      await act(async () => {
        await result.current.discard(A)
      })

      expect(deps.revertToDisk).toHaveBeenCalledWith(A)
      expect(deps.writeBuffer).not.toHaveBeenCalled()
      expect(result.current.failureFor(A)).toBeNull()
    })

    it('Discard changes on a Document that is gone from disk closes its Tab, there being no bytes to go back to', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      const { result, order } = renderFailures({
        revertToDisk: async () => { throw new Error('File does not exist') },
      })
      act(() => {
        result.current.recordFailure(A, REFUSED)
      })

      await act(async () => {
        await result.current.discard(A)
      })

      expect(order).toEqual([`revert ${A}`, `close ${A}`])
      expect(result.current.failureFor(A)).toBeNull()
    })
  })

  describe('one Retry or Discard at a time', () => {
    /** A write that waits for `land()`. */
    function heldWrite() {
      let land!: () => void
      const writeBuffer = () => new Promise<void>((resolve) => { land = resolve })
      return { writeBuffer, land: () => land() }
    }

    it('rapid Retry writes once, and says it is retrying until the write lands', async () => {
      const held = heldWrite()
      const { result, deps } = renderFailures({ writeBuffer: held.writeBuffer })
      act(() => {
        result.current.recordFailure(A, REFUSED)
      })

      let first!: Promise<boolean>
      let second!: Promise<boolean>
      act(() => {
        first = result.current.retry(A)
        second = result.current.retry(A)
      })
      expect(result.current.pendingFor(A)).toBe('retry')
      expect(result.current.pendingFor(B)).toBeNull()

      await act(async () => {
        held.land()
        await Promise.all([first, second])
      })

      expect(deps.writeBuffer).toHaveBeenCalledOnce()
      await expect(second).resolves.toBe(true)
      expect(result.current.pendingFor(A)).toBeNull()
      expect(result.current.failureFor(A)).toBeNull()
    })

    it('a Discard asked for while a Retry is in flight adds nothing', async () => {
      const held = heldWrite()
      const { result, deps } = renderFailures({ writeBuffer: held.writeBuffer })
      act(() => {
        result.current.recordFailure(A, REFUSED)
      })

      let retrying!: Promise<boolean>
      act(() => {
        retrying = result.current.retry(A)
        void result.current.discard(A)
      })
      await act(async () => {
        held.land()
        await retrying
      })

      expect(deps.writeBuffer).toHaveBeenCalledOnce()
      expect(deps.revertToDisk).not.toHaveBeenCalled()
    })

    it('rapid Retry in the close prompt writes once and closes the Tab once', async () => {
      const held = heldWrite()
      const { result, deps } = renderFailures({ writeBuffer: held.writeBuffer })
      act(() => {
        result.current.recordFailure(A, REFUSED)
        result.current.closeTabOrAsk(A)
      })

      let first!: Promise<void>
      let second!: Promise<void>
      act(() => {
        first = result.current.answerPrompt('retry')
        second = result.current.answerPrompt('retry')
      })
      expect(result.current.promptPending).toBe('retry')

      await act(async () => {
        held.land()
        await Promise.all([first, second])
      })

      expect(deps.writeBuffer).toHaveBeenCalledOnce()
      expect(deps.closeTab).toHaveBeenCalledOnce()
      expect(result.current.promptPending).toBeNull()
    })
  })

  describe('closing a Tab', () => {
    it('closes a Tab whose writes all landed without asking', () => {
      const { result, deps } = renderFailures()

      act(() => {
        result.current.closeTabOrAsk(A)
      })

      expect(deps.closeTab).toHaveBeenCalledWith(A)
      expect(result.current.prompt).toBeNull()
    })

    it('asks instead of closing a Tab whose last write was refused', () => {
      const { result, deps } = renderFailures()
      act(() => {
        result.current.recordFailure(A, REFUSED)
      })

      act(() => {
        result.current.closeTabOrAsk(A)
      })

      expect(deps.closeTab).not.toHaveBeenCalled()
      expect(result.current.prompt).toEqual({ kind: 'close', path: A, message: REFUSED.message })
    })

    it('Discard changes in the close prompt reverts the Document and closes the Tab', async () => {
      const { result, order } = renderFailures()
      act(() => {
        result.current.recordFailure(A, REFUSED)
        result.current.closeTabOrAsk(A)
      })

      await act(async () => {
        await result.current.answerPrompt('discard')
      })

      expect(order).toEqual([`revert ${A}`, `close ${A}`])
      expect(result.current.prompt).toBeNull()
      expect(result.current.failureFor(A)).toBeNull()
    })

    it('Retry in the close prompt closes the Tab once the write lands, and keeps asking while it is refused', async () => {
      let attempts = 0
      const { result, deps } = renderFailures({
        writeBuffer: async () => {
          if (attempts++ === 0) throw new Error('Still read-only')
        },
      })
      act(() => {
        result.current.recordFailure(A, REFUSED)
        result.current.closeTabOrAsk(A)
      })

      await act(async () => {
        await result.current.answerPrompt('retry')
      })
      expect(deps.closeTab).not.toHaveBeenCalled()
      expect(result.current.prompt).toEqual({ kind: 'close', path: A, message: 'Still read-only', failedAgainAt: expect.any(Number) })

      await act(async () => {
        await result.current.answerPrompt('retry')
      })
      expect(deps.closeTab).toHaveBeenCalledWith(A)
      expect(result.current.prompt).toBeNull()
    })

    it('dismissing the close prompt keeps the Tab open with its bar', () => {
      const { result, deps } = renderFailures()
      act(() => {
        result.current.recordFailure(A, REFUSED)
        result.current.closeTabOrAsk(A)
      })

      act(() => {
        result.current.dismissPrompt()
      })

      expect(result.current.prompt).toBeNull()
      expect(deps.closeTab).not.toHaveBeenCalled()
      expect(result.current.failureFor(A)).not.toBeNull()
    })
  })

  describe('quitting', () => {
    it('writes the pending edits and exits when every write lands', async () => {
      const { result, order } = renderFailures()

      await act(async () => {
        await result.current.quit()
      })

      expect(order).toEqual(['settle', 'exit'])
      expect(result.current.prompt).toBeNull()
    })

    it('writes the clean Document, then asks for the one whose write is refused instead of exiting', async () => {
      const { result, deps, order } = renderFailures({
        writeBuffer: async (path) => {
          if (path === B) throw REFUSED
        },
      })
      act(() => {
        result.current.recordFailure(B, new Error('Earlier refusal'))
      })

      await act(async () => {
        await result.current.quit()
      })

      expect(order).toEqual(['settle', `write ${B}`])
      expect(deps.exitApp).not.toHaveBeenCalled()
      expect(result.current.prompt).toEqual({ kind: 'quit', path: B, message: REFUSED.message })
    })

    it('a refused write of the active Document during the flush asks as well', async () => {
      const { result, deps } = renderFailures({
        settleActiveNote: async () => { throw REFUSED },
        writeBuffer: async () => { throw REFUSED },
      })

      await act(async () => {
        await result.current.quit()
      })

      expect(deps.exitApp).not.toHaveBeenCalled()
      expect(result.current.prompt).toEqual({ kind: 'quit', path: A, message: REFUSED.message })
    })

    it('Discard and quit exits without writing anything more', async () => {
      const { result, order } = renderFailures({ writeBuffer: async () => { throw REFUSED } })
      act(() => {
        result.current.recordFailure(A, REFUSED)
        result.current.recordFailure(B, REFUSED)
      })
      await act(async () => {
        await result.current.quit()
      })
      order.length = 0

      await act(async () => {
        await result.current.answerPrompt('discardAndQuit')
      })

      expect(order).toEqual(['exit'])
      expect(result.current.prompt).toBeNull()
    })

    it('Discard changes in the quit prompt reverts that Document and moves on to the next refused one, then exits', async () => {
      const { result, order } = renderFailures({ writeBuffer: async () => { throw REFUSED } })
      act(() => {
        result.current.recordFailure(A, REFUSED)
        result.current.recordFailure(B, REFUSED)
      })
      await act(async () => {
        await result.current.quit()
      })
      expect(result.current.prompt?.path).toBe(A)
      order.length = 0

      await act(async () => {
        await result.current.answerPrompt('discard')
      })
      expect(order).toEqual([`revert ${A}`, `write ${B}`])
      expect(result.current.prompt).toEqual({ kind: 'quit', path: B, message: REFUSED.message })

      await act(async () => {
        await result.current.answerPrompt('discard')
      })
      expect(order).toEqual([`revert ${A}`, `write ${B}`, `revert ${B}`, 'exit'])
      expect(result.current.prompt).toBeNull()
    })

    it('Retry in the quit prompt exits once the write lands', async () => {
      let attempts = 0
      const { result, order } = renderFailures({
        writeBuffer: async () => {
          if (attempts++ === 0) throw REFUSED
        },
      })
      act(() => {
        result.current.recordFailure(A, REFUSED)
      })
      await act(async () => {
        await result.current.quit()
      })
      expect(result.current.prompt?.kind).toBe('quit')

      await act(async () => {
        await result.current.answerPrompt('retry')
      })

      expect(order).toEqual(['settle', `write ${A}`, `write ${A}`, 'exit'])
      expect(result.current.failureFor(A)).toBeNull()
    })

    it('a quit that cannot exit is logged rather than thrown', async () => {
      const { result, deps } = renderFailures({ exitApp: async () => { throw new Error('No window') } })

      await act(async () => {
        await expect(result.current.quit()).resolves.toBeUndefined()
      })

      expect(deps.exitApp).toHaveBeenCalledOnce()
      expect(result.current.prompt).toBeNull()
    })

    it('dismissing the quit prompt keeps the app open', async () => {
      const { result, deps } = renderFailures({ writeBuffer: async () => { throw REFUSED } })
      act(() => {
        result.current.recordFailure(A, REFUSED)
      })
      await act(async () => {
        await result.current.quit()
      })

      act(() => {
        result.current.dismissPrompt()
      })

      expect(result.current.prompt).toBeNull()
      expect(deps.exitApp).not.toHaveBeenCalled()
    })
  })
})

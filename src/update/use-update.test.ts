import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CHECK_INTERVAL_MS, FIRST_CHECK_DELAY_MS, useUpdate } from './use-update'
import type { UpdateInfo } from './update-commands'

const runtime = vi.hoisted(() => ({ toast: vi.fn() }))
vi.mock('@/editor/toasts', () => ({ showUpdateCheckToast: runtime.toast }))

const UPDATE: UpdateInfo = { version: '0.2.0', notes: '### Fixed\n- One.' }

async function flush() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('useUpdate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    runtime.toast.mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('checks ten seconds after launch and once a day after that, showing the Update without a word', async () => {
    const check = vi.fn<() => Promise<UpdateInfo | null>>().mockResolvedValueOnce(null).mockResolvedValue(UPDATE)
    const { result } = renderHook(() => useUpdate({ enabled: true, check }))

    act(() => { vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS - 1) })
    expect(check).not.toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1) })
    await flush()
    expect(check).toHaveBeenCalledTimes(1)
    expect(result.current.update).toBeNull()

    act(() => { vi.advanceTimersByTime(CHECK_INTERVAL_MS) })
    await flush()
    expect(check).toHaveBeenCalledTimes(2)
    expect(result.current.update).toEqual(UPDATE)
    expect(result.current.open).toBe(false)
    expect(runtime.toast).not.toHaveBeenCalled()
  })

  it('says nothing when a background check fails, and tries again the next day', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const check = vi.fn<() => Promise<UpdateInfo | null>>().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(UPDATE)
    const { result } = renderHook(() => useUpdate({ enabled: true, check }))

    act(() => { vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS) })
    await flush()
    expect(result.current.update).toBeNull()
    expect(runtime.toast).not.toHaveBeenCalled()

    act(() => { vi.advanceTimersByTime(CHECK_INTERVAL_MS) })
    await flush()
    expect(result.current.update).toEqual(UPDATE)
    info.mockRestore()
  })

  it('never checks in the background outside the packaged app', () => {
    const check = vi.fn<() => Promise<UpdateInfo | null>>().mockResolvedValue(UPDATE)
    renderHook(() => useUpdate({ enabled: false, check }))

    act(() => { vi.advanceTimersByTime(FIRST_CHECK_DELAY_MS + CHECK_INTERVAL_MS) })
    expect(check).not.toHaveBeenCalled()
  })

  it('Check for Updates… always answers: up to date, failed, or the Update with its popover open', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const check = vi.fn<() => Promise<UpdateInfo | null>>()
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(UPDATE)
    const { result } = renderHook(() => useUpdate({ enabled: false, check }))

    act(() => result.current.checkNow())
    expect(runtime.toast).toHaveBeenLastCalledWith('checking')
    await flush()
    expect(runtime.toast).toHaveBeenLastCalledWith('up-to-date')

    act(() => result.current.checkNow())
    await flush()
    expect(runtime.toast).toHaveBeenLastCalledWith('failed')

    act(() => result.current.checkNow())
    await flush()
    expect(runtime.toast).toHaveBeenLastCalledWith('ready', '0.2.0')
    expect(result.current.update).toEqual(UPDATE)
    expect(result.current.open).toBe(true)
    warn.mockRestore()
  })

  it('runs one check at a time however often it is asked', async () => {
    let resolve: (found: UpdateInfo | null) => void = () => {}
    const check = vi.fn(() => new Promise<UpdateInfo | null>((done) => { resolve = done }))
    const { result } = renderHook(() => useUpdate({ enabled: false, check }))

    act(() => {
      result.current.checkNow()
      result.current.checkNow()
    })
    expect(check).toHaveBeenCalledTimes(1)

    resolve(null)
    await flush()
    act(() => result.current.checkNow())
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('a plain quit exits; Restart and Update makes the install the quit sequence\'s last step', async () => {
    const install = vi.fn(() => Promise.resolve())
    const exitApp = vi.fn(() => Promise.resolve())
    const { result } = renderHook(() => useUpdate({ enabled: false, install }))

    await act(() => result.current.exitOrInstall(exitApp))
    expect(exitApp).toHaveBeenCalledTimes(1)
    expect(install).not.toHaveBeenCalled()

    const quit = vi.fn(() => result.current.exitOrInstall(exitApp))
    await act(() => result.current.restart(quit))
    expect(quit).toHaveBeenCalledTimes(1)
    expect(install).toHaveBeenCalledTimes(1)
    expect(exitApp).toHaveBeenCalledTimes(1)
  })

  it('a quit that a Write failure stopped leaves the Update for next time: the quit allowed later is a plain one', async () => {
    const install = vi.fn(() => Promise.resolve())
    const exitApp = vi.fn(() => Promise.resolve())
    const { result } = renderHook(() => useUpdate({ enabled: false, install }))

    // The quit sequence stops at its prompt without reaching the last step.
    await act(() => result.current.restart(() => Promise.resolve()))
    expect(install).not.toHaveBeenCalled()
    expect(result.current.restarting).toBe(false)

    await act(() => result.current.exitOrInstall(exitApp))
    expect(exitApp).toHaveBeenCalledTimes(1)
    expect(install).not.toHaveBeenCalled()
  })

  it('says so when the install fails, and leaves Plumo running', async () => {
    const install = vi.fn(() => Promise.reject(new Error('disk full')))
    const exitApp = vi.fn(() => Promise.resolve())
    const { result } = renderHook(() => useUpdate({ enabled: false, install }))

    // The quit sequence swallows a failed last step, as it does a failed exit.
    const quit = () => result.current.exitOrInstall(exitApp).catch(() => {})
    await act(() => result.current.restart(quit))

    expect(runtime.toast).toHaveBeenLastCalledWith('install-failed')
    expect(exitApp).not.toHaveBeenCalled()
    expect(result.current.restarting).toBe(false)
  })
})

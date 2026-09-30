import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ThemeMode } from '@/shell/theme-mode'
import { useSettings } from './use-settings'

const runtime = vi.hoisted(() => ({
  invoke: vi.fn<(cmd: string, args?: Record<string, unknown>) => Promise<unknown>>(),
}))

vi.mock('@/platform/tauri', () => ({
  isTauri: () => false,
  mockInvoke: (cmd: string, args?: Record<string, unknown>) => runtime.invoke(cmd, args),
}))

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}))

function answerWith(stored: unknown) {
  runtime.invoke.mockImplementation(async (cmd) => (cmd === 'read_settings' ? stored : undefined))
}

const settingsWrites = () =>
  runtime.invoke.mock.calls.filter(([cmd]) => cmd === 'update_settings').map(([, args]) => args?.settings)

describe('useSettings', () => {
  const restoreTheme = vi.fn()

  beforeEach(() => {
    runtime.invoke.mockReset()
    restoreTheme.mockReset()
  })

  it('restores the saved theme on launch', async () => {
    answerWith({ version: 1, theme: 'dark' })

    const { result } = renderHook(() => useSettings({ theme: 'light', restoreTheme }))

    await waitFor(() => expect(result.current.restored).toBe(true))
    expect(restoreTheme).toHaveBeenCalledWith('dark')
  })

  it('restores the default theme when there are no Settings yet, and writes them', async () => {
    answerWith(null)

    const { result } = renderHook(() => useSettings({ theme: 'light', restoreTheme }))

    await waitFor(() => expect(result.current.restored).toBe(true))
    expect(restoreTheme).toHaveBeenCalledWith('light')
    await waitFor(() => expect(settingsWrites()).toEqual([{ version: 1, theme: 'light' }]))
  })

  it('writes nothing before the read has settled', async () => {
    let releaseRead: (value: unknown) => void = () => {}
    runtime.invoke.mockImplementation((cmd) =>
      cmd === 'read_settings' ? new Promise((resolve) => { releaseRead = resolve }) : Promise.resolve(undefined),
    )
    const { result, rerender } = renderHook(
      (props: { theme: ThemeMode }) => useSettings({ ...props, restoreTheme }),
      { initialProps: { theme: 'light' as ThemeMode } },
    )
    rerender({ theme: 'dark' })

    expect(settingsWrites()).toEqual([])

    await act(async () => {
      releaseRead({ version: 1, theme: 'system' })
    })
    await waitFor(() => expect(result.current.restored).toBe(true))
    expect(restoreTheme).toHaveBeenCalledWith('system')
  })

  it('writes the theme at once whenever it changes', async () => {
    answerWith({ version: 1, theme: 'light' })
    const { result, rerender } = renderHook(
      (props: { theme: ThemeMode }) => useSettings({ ...props, restoreTheme }),
      { initialProps: { theme: 'light' as ThemeMode } },
    )
    await waitFor(() => expect(result.current.restored).toBe(true))

    rerender({ theme: 'system' })

    await waitFor(() => expect(settingsWrites().at(-1)).toEqual({ version: 1, theme: 'system' }))
  })

  it('starts from the defaults when the read fails', async () => {
    runtime.invoke.mockImplementation(async (cmd) => {
      if (cmd === 'read_settings') throw new Error('No mock handler for command: read_settings')
      return undefined
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { result } = renderHook(() => useSettings({ theme: 'light', restoreTheme }))

    await waitFor(() => expect(result.current.restored).toBe(true))
    expect(restoreTheme).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

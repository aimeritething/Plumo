import { useEffect, useEffectEvent, useState } from 'react'
import type { ThemeMode } from '@/shell/theme-mode'
import { readSettingsFile, updateSettingsFile } from './settings-file'
import { parseSettings, SETTINGS_VERSION } from './settings-schema'

interface UseSettingsOptions {
  /** The View → Appearance choice. */
  theme: ThemeMode
  /** Puts the saved theme back. */
  restoreTheme: (theme: ThemeMode) => void
}

/**
 * Restores the Settings once at launch and hands every later change to the
 * Settings file. Nothing is written before the restore has settled, so a
 * launch never overwrites the file with the defaults; the first write after
 * it puts a file with a bad field or an unknown version back in the current
 * schema.
 */
export function useSettings({ theme, restoreTheme }: UseSettingsOptions) {
  const [restored, setRestored] = useState(false)
  const restore = useEffectEvent(async () => {
    const settings = parseSettings(await readSettingsFile())
    restoreTheme(settings.theme)
  })

  useEffect(() => {
    let cancelled = false
    restore()
      .catch((error: unknown) => {
        console.warn('[settings] Starting from the defaults: the Settings could not be read:', error)
      })
      .finally(() => {
        if (!cancelled) setRestored(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!restored) return
    updateSettingsFile({ version: SETTINGS_VERSION, theme }).catch((error: unknown) => {
      console.warn('[settings] Failed to write the Settings:', error)
    })
  }, [restored, theme])

  return { restored }
}

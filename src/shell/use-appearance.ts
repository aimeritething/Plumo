import { useCallback, useMemo, useState } from 'react'
import { DEFAULT_THEME_MODE, type ThemeMode } from './theme-mode'

/**
 * The View → Appearance choice, also made in the Settings dialog: light on
 * first launch, dark and system selectable, the choice living in the Settings
 * file's `theme`. The shell paints it with `useThemeMode` once the Settings
 * have been read, so a launch never flashes the default over a saved dark
 * theme; before that the pre-paint script in index.html has applied the
 * localStorage mirror, which the theme applier keeps in step.
 */
export function useAppearance() {
  const [themeMode, setThemeMode] = useState<ThemeMode>(DEFAULT_THEME_MODE)

  const restoreTheme = useCallback((theme: ThemeMode) => setThemeMode(theme), [])
  const handlers = useMemo(() => ({
    onAppearanceSystem: () => setThemeMode('system'),
    onAppearanceDark: () => setThemeMode('dark'),
    onAppearanceLight: () => setThemeMode('light'),
  }), [])

  return { themeMode, setThemeMode, restoreTheme, handlers }
}

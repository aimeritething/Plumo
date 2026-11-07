import { DEFAULT_PRIMARY_COLOR, normalizePrimaryColor } from '@/shell/primary-color'
import { DEFAULT_THEME_MODE, normalizeThemeMode, type ThemeMode } from '@/shell/theme-mode'

/**
 * The Settings file (CONTEXT.md, Settings): one `settings.json` beside the
 * Session's, in the app's config directory. This module is the schema; the
 * Rust side owns the file and treats it as opaque JSON (ADR-0004).
 *
 * `theme` is the View → Appearance choice, the one the Settings dialog shows.
 * `primaryColor` is the Primary color (CONTEXT.md), a `#rrggbb` colour.
 */

export const SETTINGS_VERSION = 1

export interface Settings {
  version: typeof SETTINGS_VERSION
  theme: ThemeMode
  primaryColor: string
}

export const DEFAULT_SETTINGS: Settings = {
  version: SETTINGS_VERSION,
  theme: DEFAULT_THEME_MODE,
  primaryColor: DEFAULT_PRIMARY_COLOR,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * The Settings the file holds, checked field by field: a value that fails
 * falls back to its default and the rest still apply. A missing file,
 * something that is not an object, or an unknown `version` gives all defaults.
 */
export function parseSettings(raw: unknown): Settings {
  if (!isRecord(raw) || raw.version !== SETTINGS_VERSION) return DEFAULT_SETTINGS
  return {
    version: SETTINGS_VERSION,
    theme: normalizeThemeMode(raw.theme) ?? DEFAULT_SETTINGS.theme,
    primaryColor: normalizePrimaryColor(raw.primaryColor) ?? DEFAULT_SETTINGS.primaryColor,
  }
}

import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '@/platform/tauri'
import type { Settings } from './settings-schema'

/**
 * The Settings file's command boundary. The Rust side owns `settings.json`
 * and writes it atomically on every update; the renderer reads it back once
 * at launch. Outside Tauri the Folder fixture answers both commands.
 */

/** The raw file contents, or null when there are no Settings yet. */
export function readSettingsFile(): Promise<unknown> {
  return isTauri() ? invoke<unknown>('read_settings') : mockInvoke<unknown>('read_settings')
}

export function updateSettingsFile(settings: Settings): Promise<void> {
  const args = { settings }
  return isTauri() ? invoke<void>('update_settings', args) : mockInvoke<void>('update_settings', args)
}

import { invoke } from '@tauri-apps/api/core'
import { isTauri, mockInvoke } from '@/platform/tauri'

/** An Update that is downloaded and ready to install (CONTEXT.md). */
export interface UpdateInfo {
  version: string
  /** The version's section of `CHANGELOG.md`, as the release manifest carries it. */
  notes: string
}

declare global {
  interface TestBridge {
    /** Stand in for a background check that found and downloaded an Update (the smoke specs). */
    offerUpdate?: (update: UpdateInfo) => void
  }
}

/** Whether this Plumo can update itself: the packaged app, never `pnpm dev` in a browser. */
export function canUpdate(): boolean {
  return isTauri()
}

/**
 * Look for a newer Plumo. The Rust side downloads and verifies what it finds
 * before it answers, so a non-null answer is ready to install; null means
 * this is the newest version. Rejects when the check or the download failed,
 * and in a development build, which never updates.
 */
export function checkForUpdate(): Promise<UpdateInfo | null> {
  if (!isTauri()) return Promise.reject(new Error('Updates need the packaged app'))
  return invoke<UpdateInfo | null>('check_for_update')
}

/**
 * Install the waiting Update and restart into it. The last step of the quit
 * sequence when an Update is being installed. Outside Tauri the Folder
 * fixture records the call, as it does the quit's.
 */
export function installUpdate(): Promise<void> {
  return isTauri() ? invoke<void>('install_update') : mockInvoke<void>('install_update')
}

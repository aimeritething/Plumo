import { useEffect, useState } from 'react'
import { isTauri } from './tauri'

/** The fixture's home, the directory its mock Folder sits under. */
const MOCK_HOME_DIR = '/Users/plumo'

let homeDirRequest: Promise<string | null> | null = null

/** The user's home directory, read once; null when it cannot be told. */
export function readHomeDir(): Promise<string | null> {
  homeDirRequest ??= isTauri()
    ? import('@tauri-apps/api/path').then(({ homeDir }) => homeDir()).catch(() => null)
    : Promise.resolve(MOCK_HOME_DIR)
  return homeDirRequest
}

/** The home directory once it is known, for writing paths as `~/…`. */
export function useHomeDir(): string | null {
  const [home, setHome] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    void readHomeDir().then((dir) => {
      if (!cancelled) setHome(dir)
    })
    return () => {
      cancelled = true
    }
  }, [])
  return home
}

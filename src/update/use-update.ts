import { useCallback, useEffect, useRef, useState } from 'react'
import { showUpdateCheckToast } from '@/editor/toasts'
import { canUpdate, checkForUpdate, installUpdate, type UpdateInfo } from './update-commands'

/** How long after launch the first check runs, so it does not compete with restoring the Session. */
export const FIRST_CHECK_DELAY_MS = 10_000
/** How often a running Plumo checks again: an editor can stay open for days. */
export const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface UpdateDeps {
  /** Whether to check in the background at all; off outside the packaged app. */
  enabled?: boolean
  check?: () => Promise<UpdateInfo | null>
  install?: () => Promise<void>
}

export interface UpdateState {
  /** The Update that is downloaded and ready, else null. The Update button shows while it is set. */
  update: UpdateInfo | null
  /** Whether the Update button's popover is open. */
  open: boolean
  setOpen: (open: boolean) => void
  /** Check for Updates…: check now and say what was found, opening the popover on an Update. */
  checkNow: () => void
  /**
   * The quit sequence's last step (ADR-0005): installs the Update and
   * restarts when `restart` started this quit, else exits as `exitApp` does.
   */
  exitOrInstall: (exitApp: () => Promise<void>) => Promise<void>
  /**
   * Restart and Update: run the quit sequence with the install as its last
   * step. A Write failure stops it as it stops ⌘Q, and the quit that
   * prompt later allows is a plain quit; the Update waits for next time.
   */
  restart: (quit: () => Promise<void>) => Promise<void>
  /** Whether Restart and Update is running. */
  restarting: boolean
}

/**
 * The Update (CONTEXT.md). Plumo looks for a newer version shortly after
 * launch and once a day after that, downloads it in the background, and only
 * then shows the Update button; nothing is said when a background check finds
 * nothing or fails. Check for Updates… is the same check asked for by hand,
 * so it always answers.
 */
export function useUpdate({ enabled = canUpdate(), check = checkForUpdate, install = installUpdate }: UpdateDeps = {}): UpdateState {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)
  const [open, setOpen] = useState(false)
  const [restarting, setRestarting] = useState(false)
  const checkRef = useRef(check)
  const installRef = useRef(install)
  useEffect(() => {
    checkRef.current = check
    installRef.current = install
  }, [check, install])

  useEffect(() => {
    if (!enabled) return
    const checkQuietly = () => {
      checkRef.current().then(
        (found) => { if (found) setUpdate(found) },
        (error: unknown) => console.info('[update] Background check failed:', error),
      )
    }
    const first = window.setTimeout(checkQuietly, FIRST_CHECK_DELAY_MS)
    const repeat = window.setInterval(checkQuietly, CHECK_INTERVAL_MS)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(repeat)
    }
  }, [enabled])

  useEffect(() => {
    window.__plumoTest = { ...window.__plumoTest, offerUpdate: setUpdate }
    return () => {
      if (window.__plumoTest?.offerUpdate === setUpdate) delete window.__plumoTest.offerUpdate
    }
  }, [])

  const checkingRef = useRef(false)
  const checkNow = useCallback(() => {
    if (checkingRef.current) return
    checkingRef.current = true
    showUpdateCheckToast('checking')
    checkRef.current().then(
      (found) => {
        if (!found) {
          showUpdateCheckToast('up-to-date')
          return
        }
        showUpdateCheckToast('ready', found.version)
        setUpdate(found)
        setOpen(true)
      },
      (error: unknown) => {
        console.warn('[update] Check failed:', error)
        showUpdateCheckToast('failed')
      },
    ).finally(() => {
      checkingRef.current = false
    })
  }, [])

  const installOnExitRef = useRef(false)
  const exitOrInstall = useCallback(async (exitApp: () => Promise<void>) => {
    if (!installOnExitRef.current) return exitApp()
    try {
      await installRef.current()
    } catch (error) {
      showUpdateCheckToast('install-failed')
      throw error
    }
  }, [])

  const restart = useCallback(async (quit: () => Promise<void>) => {
    if (installOnExitRef.current) return
    installOnExitRef.current = true
    setRestarting(true)
    setOpen(false)
    try {
      await quit()
    } finally {
      installOnExitRef.current = false
      setRestarting(false)
    }
  }, [])

  return { update, open, setOpen, checkNow, exitOrInstall, restart, restarting }
}

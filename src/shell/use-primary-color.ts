import { useEffect } from 'react'
import { APP_STORAGE_KEYS } from '@/platform/storage'
import { primaryColorStyleSheet } from './primary-color'

/** The `<style>` that carries a Primary color other than the default; index.html's pre-paint script makes the same one. */
export const PRIMARY_COLOR_STYLE_ID = 'plumo-primary-color'

type PrimaryColorStorage = Pick<Storage, 'setItem' | 'removeItem'>

/**
 * Lays the Primary color over the page: the default needs nothing (the
 * stylesheet's `--primary-*` is its scale), any other gets a `<style>` of its
 * own scale in `<head>`. The style sheet is mirrored to localStorage so the
 * next launch paints it before the bundle loads.
 */
export function applyPrimaryColorToDocument(documentObject: Document, color: string, storage?: PrimaryColorStorage): void {
  const css = primaryColorStyleSheet(color)
  let style = documentObject.getElementById(PRIMARY_COLOR_STYLE_ID)
  if (css) {
    if (!style) {
      style = documentObject.createElement('style')
      style.id = PRIMARY_COLOR_STYLE_ID
      documentObject.head.appendChild(style)
    }
    style.textContent = css
  } else {
    style?.remove()
  }
  try {
    if (css) storage?.setItem(APP_STORAGE_KEYS.primaryColorStyle, css)
    else storage?.removeItem(APP_STORAGE_KEYS.primaryColorStyle)
  } catch {
    // Storage can be unavailable in restricted browser contexts.
  }
}

/** Paints the Primary color once the Settings have been read, and again on every change. */
export function usePrimaryColor(color: string, loaded: boolean): void {
  useEffect(() => {
    if (!loaded || typeof document === 'undefined') return
    applyPrimaryColorToDocument(document, color, typeof window === 'undefined' ? undefined : window.localStorage)
  }, [color, loaded])
}

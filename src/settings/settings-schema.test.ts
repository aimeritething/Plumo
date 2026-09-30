import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, parseSettings } from './settings-schema'

describe('parseSettings', () => {
  it('reads the documented schema', () => {
    expect(parseSettings({ version: 1, theme: 'dark' })).toEqual({ version: 1, theme: 'dark' })
    expect(parseSettings({ version: 1, theme: 'system' })).toEqual({ version: 1, theme: 'system' })
  })

  it('starts at the light theme', () => {
    expect(DEFAULT_SETTINGS).toEqual({ version: 1, theme: 'light' })
  })

  it('falls back to the default for a bad field and keeps the rest', () => {
    expect(parseSettings({ version: 1, theme: 'sepia' })).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ version: 1 })).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ version: 1, theme: 'dark', fontSize: 'huge' })).toEqual({ version: 1, theme: 'dark' })
  })

  it('gives all defaults for an unknown version or anything that is not Settings', () => {
    expect(parseSettings({ version: 2, theme: 'dark' })).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ theme: 'dark' })).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('dark')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings([])).toEqual(DEFAULT_SETTINGS)
  })
})

import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, parseSettings } from './settings-schema'

const BLUE = '#1780f3'

describe('parseSettings', () => {
  it('reads the documented schema', () => {
    expect(parseSettings({ version: 1, theme: 'dark', primaryColor: '#8E4EC6' })).toEqual({ version: 1, theme: 'dark', primaryColor: '#8e4ec6' })
    expect(parseSettings({ version: 1, theme: 'system', primaryColor: BLUE })).toEqual({ version: 1, theme: 'system', primaryColor: BLUE })
  })

  it('starts at the light theme and the blue Primary color', () => {
    expect(DEFAULT_SETTINGS).toEqual({ version: 1, theme: 'light', primaryColor: BLUE })
  })

  it('falls back to the default for a bad field and keeps the rest', () => {
    expect(parseSettings({ version: 1, theme: 'sepia' })).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ version: 1 })).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ version: 1, theme: 'dark', fontSize: 'huge' })).toEqual({ version: 1, theme: 'dark', primaryColor: BLUE })
    expect(parseSettings({ version: 1, theme: 'dark', primaryColor: 'blue' })).toEqual({ version: 1, theme: 'dark', primaryColor: BLUE })
    expect(parseSettings({ version: 1, theme: 'dark', primaryColor: '#fff' })).toEqual({ version: 1, theme: 'dark', primaryColor: BLUE })
  })

  it('gives all defaults for an unknown version or anything that is not Settings', () => {
    expect(parseSettings({ version: 2, theme: 'dark' })).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings({ theme: 'dark' })).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings('dark')).toEqual(DEFAULT_SETTINGS)
    expect(parseSettings([])).toEqual(DEFAULT_SETTINGS)
  })
})

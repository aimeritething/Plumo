import { describe, expect, it } from 'vitest'
import { cn } from './cn'

describe('cn', () => {
  it('keeps the hairline width next to a border colour', () => {
    expect(cn('border-hairline border-border')).toBe('border-hairline border-border')
    expect(cn('border-b-hairline border-border')).toBe('border-b-hairline border-border')
  })

  it('lets a later width replace the hairline', () => {
    expect(cn('border-hairline border-2')).toBe('border-2')
    expect(cn('border border-hairline')).toBe('border-hairline')
  })
})

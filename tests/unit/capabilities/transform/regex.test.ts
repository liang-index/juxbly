import { describe, expect, it } from 'vitest'
import { regexItems } from '@juxbly/capabilities'
import { CapabilityError } from '@juxbly/capabilities'

/**
 * `regex` — the only transform op that can be dangerous, so the safety gate is tested as
 * behaviour (a rejected pattern, with the reason attached), not as an implementation
 * detail.
 */
const items = [
  { sku: 'SKU-12345' },
  { sku: 'SKU-67890' },
  { sku: 'no-match-here' },
]

describe('regexItems', () => {
  it('extracts the whole match by default', () => {
    expect(regexItems(items, 'sku', 'SKU-\\d+')).toEqual(['SKU-12345', 'SKU-67890', ''])
  })

  it('extracts a capture group', () => {
    expect(regexItems(items, 'sku', 'SKU-(\\d+)', 1)).toEqual(['12345', '67890', ''])
  })

  it('distinguishes "no match" from "field missing"', () => {
    const partial = [{ sku: 'SKU-1' }, { other: 'x' }]

    // '' means the field is there and did not match; null means there was no field at all.
    expect(regexItems(partial, 'sku', 'SKU-\\d+')).toEqual(['SKU-1', null])
  })

  it('treats an out-of-range capture group as no match, not as an error', () => {
    expect(regexItems(items, 'sku', 'SKU-\\d+', 5)).toEqual(['', '', ''])
  })

  it('rejects an unsafe pattern with a reason, before touching any record', () => {
    // Catastrophic backtracking in a content script is a frozen host page: it must never
    // get to run once "just to see".
    try {
      regexItems(items, 'sku', '(a+)+$')
      expect.unreachable('expected a rejection')
    } catch (error) {
      expect(error).toBeInstanceOf(CapabilityError)
      expect((error as CapabilityError).code).toBe('REGEX_UNSAFE')
      expect((error as Error).message).toContain('unsafe regular expression')
    }
  })
})

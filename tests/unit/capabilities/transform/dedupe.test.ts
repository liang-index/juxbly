import { describe, expect, it } from 'vitest'
import { dedupeItems } from '@juxbly/capabilities'

/**
 * `dedupe` — one decision worth pinning: records **without** the field are all kept.
 * Collapsing them into one would silently delete data, and "no value" is not evidence
 * that two records are the same.
 */
describe('dedupeItems', () => {
  it('keeps the first occurrence and drops later duplicates', () => {
    const items = [
      { id: 'a', n: 1 },
      { id: 'b', n: 2 },
      { id: 'a', n: 3 },
    ]

    expect(dedupeItems(items, 'id').map((item) => item['n'])).toEqual([1, 2])
  })

  it('keeps every record that has no value for the field', () => {
    const items = [{ id: 'a' }, { other: 1 }, { other: 2 }]

    expect(dedupeItems(items, 'id')).toHaveLength(3)
  })

  it('preserves input order (first-seen order)', () => {
    const items = [
      { id: 'c' },
      { id: 'a' },
      { id: 'c' },
      { id: 'b' },
    ]

    expect(dedupeItems(items, 'id').map((item) => item['id'])).toEqual(['c', 'a', 'b'])
  })

  it('dedupes numbers and booleans by value, not by coercion', () => {
    const items = [{ id: 1 }, { id: '1' }, { id: true }]

    // "1" and 1 are different values; collapsing them would be the coercion trap again.
    expect(dedupeItems(items, 'id')).toHaveLength(3)
  })
})

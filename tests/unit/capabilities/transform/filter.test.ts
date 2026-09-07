import { describe, expect, it } from 'vitest'
import { matchesCondition } from '@juxbly/capabilities'
import type { FilterCondition } from '@juxbly/dsl'

/**
 * `filter` — the op whose wrong answer is the quietest: it does not crash, it just
 * returns the wrong half of the data. So the tests here pin the two rules that keep it
 * honest: a missing field never matches, and incomparable types never match.
 */
function condition(op: FilterCondition['op'], value: string | number): FilterCondition {
  return { field: 'price', op, value }
}

describe('filter: comparison operators', () => {
  it('compares numbers numerically', () => {
    expect(matchesCondition(10, condition('>', 5))).toBe(true)
    expect(matchesCondition(3, condition('>', 5))).toBe(false)
    expect(matchesCondition(5, condition('>=', 5))).toBe(true)
    expect(matchesCondition(5, condition('<=', 5))).toBe(true)
    expect(matchesCondition(5, condition('<', 5))).toBe(false)
  })

  it('compares strings lexicographically', () => {
    expect(matchesCondition('banana', condition('>', 'apple'))).toBe(true)
    expect(matchesCondition('apple', condition('<', 'banana'))).toBe(true)
  })

  it('treats a string against a number as no match, not an error', () => {
    // "10" and 10 are different things; a page that renders prices as text must not be
    // filtered as if they were numbers.
    expect(matchesCondition('10', condition('>', 5))).toBe(false)
  })
})

describe('filter: missing values', () => {
  it('never matches a missing field', () => {
    expect(matchesCondition(undefined, condition('>', 5))).toBe(false)
    expect(matchesCondition(null, condition('!=', 1))).toBe(false)
    expect(matchesCondition(undefined, condition('contains', 'x'))).toBe(false)
  })
})

describe('filter: equality', () => {
  it('is strict: "1" and 1 are different', () => {
    expect(matchesCondition(1, condition('==', 1))).toBe(true)
    expect(matchesCondition('1', condition('==', 1))).toBe(false)
    expect(matchesCondition(1, condition('!=', 2))).toBe(true)
  })
})

describe('filter: text operators', () => {
  it('handles contains / starts_with / ends_with on text', () => {
    expect(matchesCondition('Wireless keyboard', condition('contains', 'keyboard'))).toBe(true)
    expect(matchesCondition('Wireless keyboard', condition('starts_with', 'Wire'))).toBe(true)
    expect(matchesCondition('Wireless keyboard', condition('ends_with', 'board'))).toBe(true)
    expect(matchesCondition('Wireless keyboard', condition('contains', 'mouse'))).toBe(false)
  })

  it('accepts numbers as text for text operators', () => {
    expect(matchesCondition(12.5, condition('starts_with', '12'))).toBe(true)
  })

  it('does not treat booleans or objects as text', () => {
    expect(matchesCondition(true, condition('contains', 'true'))).toBe(false)
    expect(matchesCondition({ a: 1 }, condition('contains', 'a'))).toBe(false)
  })
})

describe('filter: matches', () => {
  it('matches with a safe pattern', () => {
    expect(matchesCondition('SKU-12345', condition('matches', '^SKU-\\d+$'))).toBe(true)
    expect(matchesCondition('other', condition('matches', '^SKU-\\d+$'))).toBe(false)
  })

  it('does not match non-string values', () => {
    expect(matchesCondition(12345, condition('matches', '^\\d+$'))).toBe(false)
  })

  it('does not match an unsafe pattern', () => {
    // The gate in execute() rejects this outright; here it must at least never match.
    expect(matchesCondition('aaaaab', condition('matches', '(a+)+$'))).toBe(false)
  })
})

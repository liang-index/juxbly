import { describe, expect, it } from 'vitest'
import { canonicalize, stableHash } from '@juxbly/runtime'

/**
 * Hash stability — the property the whole llm cache rests on.
 *
 * Every case here is a way the hash could silently break: a miss costs money on every
 * page load, and a false hit shows the user an answer they never asked for. Both look
 * like "the cache is flaky" from the outside, so they are pinned here instead.
 */
describe('canonicalize', () => {
  it('does not depend on key order', () => {
    expect(canonicalize({ a: 1, b: 2 })).toBe(canonicalize({ b: 2, a: 1 }))
  })

  it('depends on array order', () => {
    // Rows are a list: reordering them is a real change in the data.
    expect(canonicalize([1, 2])).not.toBe(canonicalize([2, 1]))
  })

  it('distinguishes a missing key from a key with no value', () => {
    // JSON.stringify drops `undefined`, which would collapse "field absent" into
    // "field present but empty" — two different answers for health (§10).
    expect(canonicalize({ a: undefined })).not.toBe(canonicalize({}))
    expect(canonicalize({ a: undefined })).not.toBe(canonicalize({ a: null }))
    expect(canonicalize({ a: '' })).not.toBe(canonicalize({ a: undefined }))
  })

  it('is stable for nested records and mixed values', () => {
    const value = { rows: [{ id: 1, tags: ['a', 'b'], ok: true, image: { src: 'x', alt: '' } }] }
    expect(canonicalize(value)).toBe(canonicalize(structuredClone(value)))
  })

  it('keeps numbers that stringify the same apart', () => {
    expect(canonicalize(0)).not.toBe(canonicalize(-0))
    expect(canonicalize(NaN)).not.toBe(canonicalize(null))
    expect(canonicalize(Number.POSITIVE_INFINITY)).not.toBe(canonicalize(Number.NEGATIVE_INFINITY))
  })

  it('does not confuse a key containing the separators with two keys', () => {
    // Length-prefixed quoting is what makes the form injective; this is the case that
    // would break if the separators were joined naively.
    expect(canonicalize({ 'a:1,b:2': 3 })).not.toBe(canonicalize({ a: 1, b: 2 }))
  })
})

describe('stableHash', () => {
  it('is 16 hex characters and equal for equal input', () => {
    const hash = stableHash([{ title: 'a', price: '$1' }])
    expect(hash).toMatch(/^[0-9a-f]{16}$/)
    expect(hash).toBe(stableHash([{ price: '$1', title: 'a' }]))
  })

  it('changes when the data changes', () => {
    const rows = [{ title: 'a' }, { title: 'b' }]
    expect(stableHash(rows)).not.toBe(stableHash([{ title: 'a' }]))
    expect(stableHash(rows)).not.toBe(stableHash([{ title: 'b' }, { title: 'a' }]))
  })

  it('hashes an empty result deterministically', () => {
    // Extract that matched nothing is still an input: the cache must work for it too.
    expect(stableHash([])).toBe(stableHash([]))
    expect(stableHash({})).not.toBe(stableHash([]))
  })
})

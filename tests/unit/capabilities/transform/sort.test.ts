import { describe, expect, it } from 'vitest'
import { sortItems } from '@juxbly/capabilities'

/**
 * `sort` — two guarantees the Phase 2 benchmark depends on: **stable** (equal rows keep
 * their order, or the same tool reports a different order between runs) and **missing
 * values last, in both directions** (one answer to "where did the row without a price go").
 */
function rows(values: (number | string | boolean | null | undefined)[]): Record<string, unknown>[] {
  return values.map((value) => ({ price: value, tag: String(value) }))
}

function prices(
  items: readonly Record<string, unknown>[],
): (number | string | boolean | null | undefined)[] {
  return items.map((item) => item['price'] as number | string | boolean | null | undefined)
}

describe('sortItems', () => {
  it('sorts numbers ascending and descending', () => {
    const items = rows([3, 1, 2])

    expect(prices(sortItems(items, 'price', 'asc'))).toEqual([1, 2, 3])
    expect(prices(sortItems(items, 'price', 'desc'))).toEqual([3, 2, 1])
  })

  it('sorts strings lexicographically', () => {
    const items = rows(['banana', 'apple', 'cherry'])

    expect(prices(sortItems(items, 'price', 'asc'))).toEqual(['apple', 'banana', 'cherry'])
  })

  it('keeps the original order of equal elements (stability)', () => {
    const items = [
      { price: 2, tag: 'first' },
      { price: 1, tag: 'low' },
      { price: 2, tag: 'second' },
    ]

    const sorted = sortItems(items, 'price', 'asc')
    expect(sorted.map((item) => item['tag'])).toEqual(['low', 'first', 'second'])
  })

  it('puts missing values last in both directions', () => {
    const items = rows([2, undefined, 1, null])

    expect(prices(sortItems(items, 'price', 'asc'))).toEqual([1, 2, undefined, null])
    expect(prices(sortItems(items, 'price', 'desc'))).toEqual([2, 1, undefined, null])
  })

  it('orders mixed types by type, never by coercion', () => {
    const items = rows([true, 'apple', 1])

    // number < string < boolean: "10" and 10 must never become interchangeable.
    expect(prices(sortItems(items, 'price', 'asc'))).toEqual([1, 'apple', true])
  })

  it('does not mutate the input array', () => {
    const items = rows([3, 1, 2])
    const before = prices(items)

    sortItems(items, 'price', 'asc')

    expect(prices(items)).toEqual(before)
  })
})

import { describe, expect, it } from 'vitest'
import { VariableBag, VariableBagError } from '@juxbly/runtime'

/**
 * The variable bag — the second fence behind `validateToolDefinition` (§5.4).
 *
 * These two rules are already enforced at validation time; the bag repeats them because a
 * stored tool can be edited by hand in the open-source build, and because "continue with
 * `undefined`" is how a broken pipeline turns into a wrong answer nobody notices.
 */
describe('VariableBag', () => {
  it('stores and reads what a step produced', () => {
    const bag = new VariableBag()
    bag.set('rows', [{ a: 1 }])

    expect(bag.has('rows')).toBe(true)
    expect(bag.get('rows')).toEqual([{ a: 1 }])
    expect(bag.snapshot()).toEqual({ rows: [{ a: 1 }] })
  })

  it('refuses a second step writing the same variable', () => {
    const bag = new VariableBag()
    bag.set('rows', [])

    // Two producers of one name would make the variable's meaning depend on step order.
    expect(() => bag.set('rows', [])).toThrow(VariableBagError)
    expect(() => bag.set('rows', [])).toThrow(/already produced/)
  })

  it('refuses a forward reference instead of returning undefined', () => {
    const bag = new VariableBag()

    expect(() => bag.get('rows')).toThrow(VariableBagError)
    expect(() => bag.records('rows')).toThrow(/not produced by an earlier step/)
  })

  it('reads an extract result and a plain array as the same thing', () => {
    const bag = new VariableBag()
    const rows = [{ title: 'a' }]
    bag.set('raw', { items: rows, hitCount: 1, fieldPresence: { title: 1 }, missingFields: [] })
    bag.set('filtered', rows)

    // `extract` wraps its rows, `transform` does not: consumers must not care.
    expect(bag.records('raw')).toEqual(rows)
    expect(bag.records('filtered')).toEqual(rows)
  })

  it('refuses a variable that is not a list of records', () => {
    const bag = new VariableBag()
    bag.set('text', 'not rows')

    expect(() => bag.records('text')).toThrow(/not a list of records/)
  })
})

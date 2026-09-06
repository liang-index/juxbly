import { describe, expect, it } from 'vitest'
import { checkRegexSafety, isSafeRegex } from '@juxbly/dsl'

/**
 * §5.4 rule 6 — the ReDoS safety subset. Task file: stage 1-1 Tests 6
 * ("(a+)+", "(x+x+)+y" and similar constructions must be rejected with a reason).
 */
describe('isSafeRegex', () => {
  it('accepts ordinary patterns', () => {
    expect(isSafeRegex('^\\d{4}-\\d{2}$')).toBe(true)
    expect(isSafeRegex('[a-z]+@[a-z]+\\.[a-z]{2,3}')).toBe(true)
    expect(isSafeRegex('^\\$\\d+(\\.\\d{2})?$')).toBe(true)
  })

  it('rejects the canonical nested-quantifier shapes', () => {
    expect(isSafeRegex('(a+)+')).toBe(false)
    expect(isSafeRegex('(x+x+)+y')).toBe(false)
    expect(isSafeRegex('(a+)*')).toBe(false)
    expect(isSafeRegex('(a*)+')).toBe(false)
  })

  it('rejects nesting through an unquantified wrapper group ((a+))+', () => {
    expect(isSafeRegex('((a+))+')).toBe(false)
  })

  it('accepts a nested quantifier under a tiny bounded repeat (price / IP shapes)', () => {
    // "?": at most one repeat — the common optional-fraction shape.
    expect(isSafeRegex('(a+)?')).toBe(true)
    // "{3}" fixed repeats of an IP-ish group must keep passing.
    expect(isSafeRegex('(\\.\\d{1,3}){3}')).toBe(true)
  })

  it('rejects nested quantifiers under a large bounded repeat', () => {
    expect(isSafeRegex('(a+){2,10}')).toBe(false)
    expect(isSafeRegex('(a+){10}')).toBe(false)
  })

  it('rejects an unbounded repeat {n,} on a quantified group', () => {
    expect(isSafeRegex('(a+){2,}')).toBe(false)
  })

  it('rejects oversized bounds regardless of nesting', () => {
    expect(isSafeRegex('a{2,100000}')).toBe(false)
    expect(isSafeRegex('a{1000001}')).toBe(false)
  })

  it('rejects patterns that are not valid JavaScript regexes', () => {
    expect(isSafeRegex('[')).toBe(false)
    expect(isSafeRegex('(unclosed')).toBe(false)
  })

  it('rejects overlong patterns', () => {
    expect(isSafeRegex('a'.repeat(257))).toBe(false)
    expect(isSafeRegex('a'.repeat(256))).toBe(true)
  })
})

describe('checkRegexSafety — the reason travels with the rejection', () => {
  it('explains the nested quantifier', () => {
    const result = checkRegexSafety('(a+)+')
    if (result.safe) throw new Error('expected (a+)+ to be rejected')
    expect(result.reason).toContain('quantifier')
  })

  it('explains an invalid pattern', () => {
    const result = checkRegexSafety('[')
    if (result.safe) throw new Error('expected "[" to be rejected')
    expect(result.reason).toContain('not a valid')
  })
})

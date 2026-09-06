import { describe, expect, it } from 'vitest'
import { matchUrl, UrlPatternError } from '@juxbly/dsl'

/**
 * §5.3 semantics — subdomains, case handling, glob across "/", query/hash ignored.
 * Task file: stage 1-1 Tests (matchUrl paragraph).
 */
describe('matchUrl', () => {
  it('matches a subdomain of the pattern host', () => {
    expect(matchUrl('amazon.com/*', new URL('https://www.amazon.com/dp/X?a=1'))).toBe(true)
  })

  it('matches the pattern host itself', () => {
    expect(matchUrl('amazon.com/*', new URL('https://amazon.com/'))).toBe(true)
  })

  it('does not match hosts that merely contain the pattern host', () => {
    expect(matchUrl('amazon.com/*', new URL('https://notamazon.com/'))).toBe(false)
  })

  it('compares the host case-insensitively on both sides', () => {
    expect(matchUrl('AMAZON.com/*', new URL('https://WWW.Amazon.Com/'))).toBe(true)
  })

  it('lets "*" cross "/" in the path', () => {
    expect(matchUrl('example.com/*/item', new URL('https://example.com/a/b/item'))).toBe(true)
  })

  it('ignores query and hash', () => {
    expect(matchUrl('example.com/*', new URL('https://example.com/x?q=1#top'))).toBe(true)
  })

  it('is case-sensitive in the path', () => {
    expect(matchUrl('example.com/DP', new URL('https://example.com/dp'))).toBe(false)
  })

  it('matches an exact path and nothing below it', () => {
    expect(matchUrl('example.com/dp', new URL('https://example.com/dp'))).toBe(true)
    expect(matchUrl('example.com/dp', new URL('https://example.com/dp/X'))).toBe(false)
  })

  it('strips a scheme from the pattern (fixed decision, see url-pattern.ts)', () => {
    expect(matchUrl('https://example.com/*', new URL('https://example.com/'))).toBe(true)
  })

  it('treats a pathless pattern as the whole site', () => {
    expect(matchUrl('example.com', new URL('https://example.com/'))).toBe(true)
    expect(matchUrl('example.com', new URL('https://example.com/deep/path'))).toBe(true)
  })

  it('does not match a different site', () => {
    expect(matchUrl('example.com/*', new URL('https://other.com/'))).toBe(false)
  })

  it('throws for a pattern that cannot parse (caller skipped validation)', () => {
    expect(() => matchUrl('*.example.com/*', new URL('https://a.example.com/'))).toThrow(UrlPatternError)
  })
})

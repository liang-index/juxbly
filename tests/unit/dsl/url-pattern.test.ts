import { describe, expect, it } from 'vitest'
import { parseUrlPattern, UrlPatternError } from '@juxbly/dsl'

/**
 * §5.3 — the parser's decisions are fixed here (stage 1-1 Edge Cases requires the
 * scheme handling to be pinned by a test): scheme stripped, query/hash ignored,
 * pathless pattern means the whole site, wildcard hosts rejected with a hint.
 */
describe('parseUrlPattern', () => {
  it('parses the canonical host/path shape', () => {
    expect(parseUrlPattern('amazon.com/*')).toEqual({ host: 'amazon.com', pathGlob: '/*' })
  })

  it('strips a leading scheme', () => {
    expect(parseUrlPattern('https://amazon.com/*')).toEqual({ host: 'amazon.com', pathGlob: '/*' })
  })

  it('ignores query and hash suffixes', () => {
    expect(parseUrlPattern('example.com/path?x=1')).toEqual({ host: 'example.com', pathGlob: '/path' })
    expect(parseUrlPattern('example.com/path#frag')).toEqual({ host: 'example.com', pathGlob: '/path' })
  })

  it('lowercases the host (host matching is case-insensitive, §5.3 rule 3)', () => {
    expect(parseUrlPattern('EXAMPLE.com/*')).toEqual({ host: 'example.com', pathGlob: '/*' })
  })

  it('treats a pathless pattern as the whole site', () => {
    expect(parseUrlPattern('amazon.com')).toEqual({ host: 'amazon.com', pathGlob: '/*' })
  })

  it('keeps a bare root path distinct from the whole site', () => {
    expect(parseUrlPattern('amazon.com/')).toEqual({ host: 'amazon.com', pathGlob: '/' })
  })

  it('rejects an empty host', () => {
    expect(() => parseUrlPattern('/*')).toThrow(UrlPatternError)
    expect(() => parseUrlPattern('')).toThrow(UrlPatternError)
  })

  it('rejects a wildcard host and explains that subdomains already match', () => {
    expect(() => parseUrlPattern('*.example.com/*')).toThrow(/drop the/)
  })

  it('rejects whitespace in the host', () => {
    expect(() => parseUrlPattern('example .com/*')).toThrow(UrlPatternError)
  })

  it('carries the offending pattern on the error', () => {
    try {
      parseUrlPattern('*.example.com/*')
      throw new Error('expected parseUrlPattern to throw')
    } catch (error) {
      expect(error).toBeInstanceOf(UrlPatternError)
      expect((error as UrlPatternError).pattern).toBe('*.example.com/*')
    }
  })
})

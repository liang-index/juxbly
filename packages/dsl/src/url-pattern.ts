/**
 * url_pattern parsing — `docs/ARCHITECTURE.md` §5.3.
 *
 * A pattern is "host/path", e.g. "amazon.com/*". Protocol, query and hash are not part
 * of the pattern language. Decisions fixed here (1-1 Edge Cases requires one):
 *
 * - A leading scheme ("https://") is **stripped, not rejected** — LLM output carries it
 *   constantly, and the semantics are unambiguous once it is gone.
 * - Query ("?") and hash ("#") suffixes are **ignored** — they never participate in
 *   matching, so accepting them in the pattern is harmless.
 * - A pattern without a path ("amazon.com") gets pathGlob "/*": the URL
 *   "https://amazon.com" has pathname "/", and a user writing just the host means the
 *   whole site, which is what "/*" already matches.
 * - A wildcard in the host is **rejected** with a hint: host matching already covers
 *   subdomains (§5.3 rule 1), so "*.amazon.com" adds nothing but ambiguity.
 */

/**
 * The page the toolbar overview opens for a tool (stage 1-13, `UI_SPEC` §7.2).
 *
 * A pattern identifies a *set* of pages; a click needs one. The honest one is the site
 * root the pattern already names — everything after the last literal character is a
 * wildcard the user's own browsing will fill in, so guessing deeper would invent a page
 * that may not exist.
 *
 * `null` for an unparseable pattern rather than a thrown error: this runs over every
 * stored record, and one bad pattern must not take the whole list down.
 */
export function patternToUrl(pattern: string): string | null {
  let parsed: UrlPattern
  try {
    parsed = parseUrlPattern(pattern)
  } catch {
    return null
  }

  // Strip the wildcard: "amazon.com/s/*" → "/s/", "amazon.com" → "/".
  const path = parsed.pathGlob.replace(/\*/g, '')
  return `https://${parsed.host}${path === '' ? '/' : path}`
}

export interface UrlPattern {
  host: string
  pathGlob: string
}

export class UrlPatternError extends Error {
  readonly pattern: string

  constructor(pattern: string, reason: string) {
    super(`Invalid url_pattern "${pattern}": ${reason}`)
    this.name = 'UrlPatternError'
    this.pattern = pattern
  }
}

const SCHEME_PREFIX = /^[a-z][a-z0-9+.-]*:\/\//

export function parseUrlPattern(pattern: string): UrlPattern {
  let rest = pattern.trim()
  rest = rest.replace(SCHEME_PREFIX, '')

  const queryOrHash = rest.search(/[?#]/)
  if (queryOrHash >= 0) rest = rest.slice(0, queryOrHash)

  const firstSlash = rest.indexOf('/')
  const host = (firstSlash === -1 ? rest : rest.slice(0, firstSlash)).toLowerCase()
  const pathGlob = firstSlash === -1 ? '/*' : rest.slice(firstSlash)

  if (host === '') {
    throw new UrlPatternError(pattern, 'host is empty')
  }
  if (host.includes('*')) {
    throw new UrlPatternError(
      pattern,
      'the host must not contain wildcards — subdomains already match, drop the "*."',
    )
  }
  if (/\s/.test(host)) {
    throw new UrlPatternError(pattern, 'the host must not contain whitespace')
  }

  return { host, pathGlob }
}

/**
 * url_pattern matching — `docs/ARCHITECTURE.md` §5.3:
 *
 *   1. host: equal, or the URL host ends with "." + pattern host (subdomains)
 *   2. path: glob, where "*" matches any run of characters including "/"
 *   3. host comparison is case-insensitive; path comparison is case-sensitive
 *   4. protocol, query and hash are ignored (URL.pathname already excludes them)
 */
import { parseUrlPattern } from './url-pattern'

/**
 * Throws `UrlPatternError` for an unparseable pattern rather than returning false:
 * `validateToolDefinition` (§5.4 rule 7) guarantees every stored pattern parses, so a
 * throw here means caller-side data that skipped validation — a bug to surface, not a
 * condition to swallow into "no match".
 */
export function matchUrl(pattern: string, url: URL): boolean {
  const parsed = parseUrlPattern(pattern)

  if (!hostMatches(url.hostname.toLowerCase(), parsed.host)) return false
  return globToRegExp(parsed.pathGlob).test(url.pathname)
}

function hostMatches(urlHost: string, patternHost: string): boolean {
  return urlHost === patternHost || urlHost.endsWith(`.${patternHost}`)
}

/**
 * The only wildcard is "*", which becomes [\s\S]* — anchored and linear, so the
 * translation itself cannot introduce backtracking blowups. Everything else is
 * escaped literally.
 */
function globToRegExp(glob: string): RegExp {
  const source = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[\\s\\S]*')
  return new RegExp(`^${source}$`)
}

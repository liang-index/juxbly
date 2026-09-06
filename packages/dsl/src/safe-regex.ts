/**
 * ReDoS safety subset for user- and LLM-supplied regular expressions
 * (`docs/ARCHITECTURE.md` §5.4 rule 6).
 *
 * What is checked:
 *   - length cap (huge patterns are their own hazard)
 *   - syntactic validity (an invalid pattern is rejected, not "somehow matched")
 *   - **nested quantifiers** — the `(a+)+` / `(x+x+)+y` family, the canonical
 *     catastrophic-backtracking shape. A quantifier may not apply to a group whose
 *     body already ends in a quantified atom, through any depth of nesting.
 *   - bounded-repeat caps: bounds above 1000 are rejected outright
 *
 * Not every nested quantifier is catastrophic — it depends on how often the outer
 * quantifier can make the inner one backtrack:
 *
 *   - unbounded outer (`*`, `+`, `{n,}`) → always rejected when nested
 *   - bounded outer → allowed up to `MAX_NESTED_BOUNDED_REPEAT` (4): the backtrack
 *     cost is polynomial with that exponent, acceptable for the short field values
 *     transform steps match. `(\.\d{1,3}){3}` (IP-ish) and `(\.\d{2})?` (price) are
 *     perfectly reasonable V1 patterns and must keep passing.
 *
 * Known limitation, stated rather than hidden: this is a targeted static check, not a
 * RE2 re-implementation. Overlapping alternations such as `(a|aa)+` are not detected.
 * The V1 regex surface is short field-value matches inside transform steps, which
 * keeps the residual risk small; if that surface ever grows to whole-page text, this
 * check must be replaced by a real RE2-grade engine (a Maintainer decision).
 */

export type SafeRegexCheck = { safe: true } | { safe: false; reason: string }

const MAX_LENGTH = 256
/** Any single bound above this is rejected, nested or not. */
const MAX_QUANTIFIER_BOUND = 1000
/** How often a bounded outer quantifier may multiply an inner quantifier. */
const MAX_NESTED_BOUNDED_REPEAT = 4

export function isSafeRegex(pattern: string): boolean {
  return checkRegexSafety(pattern).safe
}

export function checkRegexSafety(pattern: string): SafeRegexCheck {
  if (pattern.length > MAX_LENGTH) {
    return { safe: false, reason: `pattern is longer than ${String(MAX_LENGTH)} characters` }
  }

  try {
    new RegExp(pattern)
  } catch {
    return { safe: false, reason: 'pattern is not a valid JavaScript regular expression' }
  }

  const problem = findQuantifierProblem(pattern)
  if (problem !== null) return { safe: false, reason: problem }

  return { safe: true }
}

/** How many times the quantifier can make its atom repeat. */
interface Repeat {
  /** `*`, `+`, `{n,}` — no upper limit. */
  unbounded: boolean
  /** Upper limit for bounded quantifiers (`?` is 1; `{n}` is n; `{n,m}` is m). */
  max: number
}

/**
 * Single left-to-right scan tracking whether the last atom — literal, escape, class or
 * group — is already quantified, and if it is a group, whether the group's *effective*
 * body tail is quantified. The "effective" part is what catches `((a+))+`, whose outer
 * group body is an unquantified group but which is exactly as dangerous as `(a+)+`.
 */
function findQuantifierProblem(pattern: string): string | null {
  let lastAtomQuantified: boolean = false
  let atomIsGroup: boolean = false
  let groupEndsQuantified: boolean = false
  let justQuantified: boolean = false
  let escaped: boolean = false
  let inClass: boolean = false

  const startNewAtom = (): void => {
    lastAtomQuantified = false
    atomIsGroup = false
    justQuantified = false
  }

  const applyQuantifier = (repeat: Repeat): string | null => {
    if (lastAtomQuantified) return 'two quantifiers in a row'
    if (atomIsGroup && groupEndsQuantified) {
      if (repeat.unbounded || repeat.max > MAX_NESTED_BOUNDED_REPEAT) {
        return (
          'a quantifier applies to a group whose body already ends with a quantifier ' +
          '(catastrophic backtracking risk)'
        )
      }
    }
    lastAtomQuantified = true
    justQuantified = true
    return null
  }

  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i] as string

    if (escaped) {
      escaped = false
      startNewAtom()
      continue
    }
    if (ch === '\\') {
      escaped = true
      startNewAtom()
      continue
    }

    if (inClass) {
      // Characters inside [...] are literals; the class itself is one atom.
      if (ch === ']') {
        inClass = false
        startNewAtom()
      }
      continue
    }
    if (ch === '[') {
      inClass = true
      startNewAtom()
      continue
    }

    if (ch === '(') {
      startNewAtom()
      continue
    }
    if (ch === ')') {
      const bodyEndsQuantified: boolean = lastAtomQuantified || (atomIsGroup && groupEndsQuantified)
      lastAtomQuantified = false
      atomIsGroup = true
      groupEndsQuantified = bodyEndsQuantified
      justQuantified = false
      continue
    }

    if (ch === '*' || ch === '+' || ch === '?') {
      // Lazy (?) and possessive (+) suffixes belong to the quantifier before them.
      if (justQuantified && (ch === '?' || ch === '+')) continue
      const unbounded = ch !== '?'
      const problem = applyQuantifier({ unbounded, max: unbounded ? 0 : 1 })
      if (problem !== null) return problem
      continue
    }

    if (ch === '{') {
      const bounded = readBoundedQuantifier(pattern, i)
      if (bounded === null) {
        // Not a quantifier — a literal "{" (new RegExp already accepted it).
        startNewAtom()
        continue
      }
      // endIndex points past "}" — step back one so the loop's own i++ lands on it.
      i = bounded.endIndex - 1
      if (bounded.error !== undefined) return bounded.error
      const problem = applyQuantifier({ unbounded: bounded.unbounded, max: bounded.max })
      if (problem !== null) return problem
      continue
    }

    startNewAtom()
  }

  return null
}

/**
 * Recognises `{n}`, `{n,}` and `{n,m}` at `start` (which points at "{").
 * Returns null when the brace is a literal; returns an error for oversized bounds.
 */
function readBoundedQuantifier(
  pattern: string,
  start: number,
): { error?: string; endIndex: number; unbounded: boolean; max: number } | null {
  const match = /^\{(\d+)(,(\d*))?\}/.exec(pattern.slice(start))
  if (match === null) return null

  const endIndex = start + match[0].length
  const min = Number(match[1])
  const maxRaw = match[3]

  if (min > MAX_QUANTIFIER_BOUND) {
    return {
      error: `quantifier lower bound ${String(min)} exceeds ${String(MAX_QUANTIFIER_BOUND)}`,
      endIndex,
      unbounded: false,
      max: min,
    }
  }

  // "{n}" — exact repeat, no choice, no multiplicative backtracking.
  if (maxRaw === undefined) return { endIndex, unbounded: false, max: min }
  // "{n,}" — unbounded.
  if (maxRaw === '') return { endIndex, unbounded: true, max: min }

  const max = Number(maxRaw)
  if (max > MAX_QUANTIFIER_BOUND) {
    return {
      error: `quantifier upper bound ${String(max)} exceeds ${String(MAX_QUANTIFIER_BOUND)}`,
      endIndex,
      unbounded: false,
      max,
    }
  }

  return { endIndex, unbounded: false, max: Math.max(min, max) }
}

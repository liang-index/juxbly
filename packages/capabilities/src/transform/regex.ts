/**
 * `regex` — `docs/ARCHITECTURE.md` §5.2.
 *
 * Output shape is **deliberately not** a copy of the input records: this op extracts a
 * value out of each record, so it returns one string per record. A missing field yields
 * `null` and a failed match yields `''` — different values on purpose, because "the field
 * is not there" and "the field did not match" lead to two different repairs, and a tool
 * that cannot tell them apart cannot tell the user what to fix.
 *
 * The pattern passes `checkRegexSafety` (1-1) before a single record is touched. A
 * catastrophic-backtracking pattern does not get to run once and be slow: ReDoS in a
 * content script is a frozen host page.
 */
import { checkRegexSafety } from '@juxbly/dsl'
import { CapabilityError } from '../errors'

export function regexItems(
  items: readonly Record<string, unknown>[],
  field: string,
  pattern: string,
  group = 0,
): (string | null)[] {
  const safety = checkRegexSafety(pattern)
  if (!safety.safe) {
    throw new CapabilityError('REGEX_UNSAFE', `unsafe regular expression: ${safety.reason}`)
  }

  const expression = new RegExp(pattern)

  return items.map((item) => {
    const value = item[field]
    if (value === undefined || value === null) return null

    const match = expression.exec(String(value))
    if (match === null) return ''

    // An out-of-range capture group is treated as "no match" rather than an error: the
    // pattern is the model's output, and a tool must degrade, not break the page.
    return match[group] ?? ''
  })
}

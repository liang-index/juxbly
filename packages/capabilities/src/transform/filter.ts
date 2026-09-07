/**
 * `filter` — `docs/ARCHITECTURE.md` §5.2.
 *
 * Two decisions worth stating, because both are invisible when they are right:
 *
 * 1. **A missing field never matches.** `price > 10` on a record without `price` is not
 *    "false-ish, keep it" and not an error — it is simply not a match. Silently treating
 *    `undefined` as comparable is how a filter quietly returns the wrong half of the data.
 * 2. **Incomparable types do not match, they do not throw.** A string field compared
 *    against a number is a modelling mismatch in the tool, not a runtime fault; the page
 *    the user is looking at must not break because of it.
 */
import type { FilterCondition } from '@juxbly/dsl'
import { checkRegexSafety } from '@juxbly/dsl'

export function filterItems(
  items: readonly Record<string, unknown>[],
  condition: FilterCondition,
): Record<string, unknown>[] {
  return items.filter((item) => matchesCondition(item[condition.field], condition))
}

export function matchesCondition(value: unknown, condition: FilterCondition): boolean {
  // Missing field: never a match (see file note).
  if (value === undefined || value === null) return false

  const target = condition.value

  switch (condition.op) {
    case '>':
    case '>=':
    case '<':
    case '<=': {
      const order = compareOrdered(value, target)
      if (order === null) return false
      if (condition.op === '>') return order > 0
      if (condition.op === '>=') return order >= 0
      if (condition.op === '<') return order < 0
      return order <= 0
    }

    case '==':
      return value === target

    case '!=':
      return value !== target

    case 'contains':
    case 'starts_with':
    case 'ends_with': {
      const haystack = asText(value)
      const needle = asText(target)
      if (haystack === null || needle === null) return false
      if (condition.op === 'contains') return haystack.includes(needle)
      if (condition.op === 'starts_with') return haystack.startsWith(needle)
      return haystack.endsWith(needle)
    }

    case 'matches': {
      if (typeof value !== 'string' || typeof target !== 'string') return false
      // The gate in execute() has already rejected an unsafe pattern; this is the
      // second of the two checks the DSL requires (§5.4 rule 6).
      if (!checkRegexSafety(target).safe) return false
      return new RegExp(target).test(value)
    }
  }
}

/** `null` means "these two cannot be ordered", which callers read as "no match". */
function compareOrdered(left: unknown, right: unknown): number | null {
  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'string' && typeof right === 'string') {
    return left < right ? -1 : left > right ? 1 : 0
  }
  return null
}

/**
 * Only strings and numbers are treated as text. Booleans and objects are not: `"true"`
 * matching a filter for `true` is a coincidence, not a comparison.
 */
function asText(value: unknown): string | null {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return null
}

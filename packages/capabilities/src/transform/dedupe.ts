/**
 * `dedupe` — `docs/ARCHITECTURE.md` §5.2.
 *
 * Records without the field are **all kept**. That is a choice, and the alternative —
 * collapsing every valueless record into one — silently deletes data the user never asked
 * to drop. Dedupe means "these are demonstrably the same"; with no value there is nothing
 * to demonstrate it with.
 *
 * The first occurrence is kept, so the result is a prefix-stable subset of the input and
 * the order the user already saw stays intact.
 */
export function dedupeItems(
  items: readonly Record<string, unknown>[],
  field: string,
): Record<string, unknown>[] {
  // SameValueZero comparison via `Set`: `1` and `"1"` are different values, and only a
  // truly identical value counts as a duplicate. Stringifying would collapse them — the
  // same coercion trap the sort avoids.
  const seen = new Set<unknown>()
  const kept: Record<string, unknown>[] = []

  for (const item of items) {
    const value = item[field]
    if (value === undefined || value === null) {
      kept.push(item)
      continue
    }

    if (seen.has(value)) continue
    seen.add(value)
    kept.push(item)
  }

  return kept
}

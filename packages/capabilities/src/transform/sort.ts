/**
 * `sort` — `docs/ARCHITECTURE.md` §5.2.
 *
 * Two rules, both fixed by tests because both silently corrupt Phase 2 results when they
 * drift:
 *
 * 1. **Stable.** Equal elements keep their original order. An unstable sort makes the same
 *    tool report a different row order between runs, and the benchmark then measures noise.
 * 2. **Missing values sort last, in both directions.** "Where did the row without a price
 *    go?" must have one answer; letting it flip with `order` makes the result
 *    unpredictable for the user and unrepeatable for the benchmark.
 *
 * Mixed types are ordered by type, not coerced: numbers before strings before booleans.
 * Coercing would make `10` and `"10"` interchangeable, which is exactly the kind of
 * convenience that produces a wrong answer that looks right.
 */
export type SortOrder = 'asc' | 'desc'

const TYPE_ORDER = ['number', 'string', 'boolean'] as const

export function sortItems(
  items: readonly Record<string, unknown>[],
  field: string,
  order: SortOrder,
): Record<string, unknown>[] {
  const direction = order === 'asc' ? 1 : -1

  return items
    .map((item, index) => ({ item, index }))
    .sort((left, right) => {
      const leftValue = left.item[field]
      const rightValue = right.item[field]

      // Missing values sink to the end in both directions — never multiplied by the
      // direction, or "last" would flip to "first" on `desc`.
      const leftMissing = isMissing(leftValue)
      const rightMissing = isMissing(rightValue)
      if (leftMissing || rightMissing) {
        if (leftMissing && rightMissing) return left.index - right.index
        return leftMissing ? 1 : -1
      }

      const compared = compareValues(leftValue, rightValue)
      // Tie-break on the original position: stability is a guarantee here, not a
      // property of whichever sort implementation the engine happens to use.
      return compared === 0 ? left.index - right.index : compared * direction
    })
    .map((entry) => entry.item)
}

function compareValues(left: unknown, right: unknown): number {
  const leftMissing = isMissing(left)
  const rightMissing = isMissing(right)

  // Missing values go last regardless of direction — never multiplied by `direction`.
  if (leftMissing && rightMissing) return 0
  if (leftMissing) return 1
  if (rightMissing) return -1

  const leftType = typeRank(left)
  const rightType = typeRank(right)
  if (leftType !== rightType) return leftType - rightType

  if (typeof left === 'number' && typeof right === 'number') return left - right
  if (typeof left === 'string' && typeof right === 'string') {
    return left < right ? -1 : left > right ? 1 : 0
  }
  if (typeof left === 'boolean' && typeof right === 'boolean') {
    return left === right ? 0 : left ? 1 : -1
  }
  return 0
}

function isMissing(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

/** Everything that is not number / string / boolean shares the last rank. */
function typeRank(value: unknown): number {
  const index = TYPE_ORDER.indexOf(typeof value as (typeof TYPE_ORDER)[number])
  return index === -1 ? TYPE_ORDER.length : index
}

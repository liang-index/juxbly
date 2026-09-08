/**
 * Result-layer health — `docs/ARCHITECTURE.md` §10.
 *
 * Compares this run's `RunSummary` against the `recent_runs` window: did the tool stop
 * finding things, or did the shape of what it finds change. Both are `degraded`, never
 * `broken` — the tool ran and produced something, and only a human (or the semantic
 * layer) can say whether the new something is wrong.
 *
 * Two cases are explicitly **not** deviations, because both would otherwise make every
 * young tool look broken:
 *
 * - too little history to have a pattern (`no-baseline`);
 * - a tool that has historically found nothing (`no-baseline`). "Always empty" is a fact
 *   about the page, not evidence of breakage — a tool that has never worked cannot have
 *   stopped working.
 */
import type { RunSummary } from '@juxbly/core'
import { RESULT_BASELINE_MIN_RUNS } from './constants'
import type { ResultLayer } from './types'

export interface ResultJudgement {
  layer: ResultLayer
  reason: string
}

export function judgeResult(
  history: readonly RunSummary[],
  current: RunSummary,
): ResultJudgement {
  const baseline = history.filter((run) => typeof run?.item_count === 'number')

  if (baseline.length < RESULT_BASELINE_MIN_RUNS) {
    return { layer: 'no-baseline', reason: 'not enough history to know what normal looks like' }
  }

  const everHadData = baseline.some((run) => run.had_data && run.item_count > 0)
  if (!everHadData) {
    return { layer: 'no-baseline', reason: 'this tool has never returned rows' }
  }

  // A collapse to nothing is the one count change worth reporting: it is unambiguous, and
  // anything gentler (half as many rows) is too often just a page being quieter today.
  if (!current.had_data || current.item_count === 0) {
    return { layer: 'deviated', reason: 'the run found nothing where it used to find rows' }
  }

  for (const field of Object.keys(current.field_digest)) {
    const expected = baselineShape(baseline, field)
    if (expected === null) continue
    const actual = current.field_digest[field]
    if (actual !== undefined && actual !== expected) {
      return { layer: 'deviated', reason: `the "${field}" field changed shape` }
    }
  }

  return { layer: 'ok', reason: 'the run looks like the runs before it' }
}

/**
 * The shape a field has *always* had, or `null` when the baseline has no single opinion.
 *
 * A field whose digest flickers between `text` and `numeric` across history has no stable
 * expectation, and judging against a moving target is how a tool starts flapping between
 * healthy and degraded on every run.
 */
function baselineShape(baseline: readonly RunSummary[], field: string): string | null {
  const shapes = baseline
    .map((run) => run.field_digest?.[field])
    .filter((shape): shape is string => typeof shape === 'string')

  if (shapes.length < RESULT_BASELINE_MIN_RUNS) return null

  const first = shapes[0] as string
  return shapes.every((shape) => shape === first) ? first : null
}

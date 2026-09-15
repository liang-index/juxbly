/**
 * The health state machine — `docs/ARCHITECTURE.md` §10.
 *
 * Pure by construction: `previous` plus this run's layer verdicts is the whole input, so
 * every branch in §10 can be exhausted by a table of tests rather than discovered in
 * production. Nothing here touches storage, time, or the model.
 *
 * Three rules carry most of the behaviour:
 *
 * - **`broken` never heals itself.** A tool that broke stays broken until a *repaired
 *   version* is confirmed (1-12). Letting a single good run clear the state would hide the
 *   fact that the tool failed, and the version history is the record that matters.
 * - **Recovery takes two clean runs.** One good run after a bad one is noise — pages are
 *   flaky. Two in a row is a pattern. The count is a counter, not a boolean, because
 *   "recovered" and "recovered once" are different facts.
 * - **The semantic layer can only escalate.** `suspicious` on its own changes nothing; it
 *   promotes `degraded` to `broken` only when the result *and* structure layers already
 *   agree that something is off. One model opinion must never break a working tool.
 */
import type { HealthStatus } from '@juxbly/core'
import { RECOVERY_RUNS_REQUIRED } from './constants'
import type { HealthLayers } from './types'

export interface TransitionInput {
  previous: HealthStatus
  /** Consecutive clean runs so far, carried in `ToolHealth`. */
  consecutiveCleanRuns: number
  layers: HealthLayers
  /** Result-layer explanation, reused as the state's reason when that layer fired. */
  resultReason?: string
  structureReason?: string
}

export interface Transition {
  status: HealthStatus
  changed: boolean
  reason: string
  consecutiveCleanRuns: number
}

export function nextStatus(input: TransitionInput): Transition {
  const { previous, layers } = input

  // A broken tool waits for a repair, not for a better day (§10: repair produces a new
  // version, and only that resets the state).
  if (previous === 'broken') {
    return {
      status: 'broken',
      changed: false,
      reason: 'waiting for a repair',
      consecutiveCleanRuns: 0,
    }
  }

  if (layers.execution === 'failed') {
    return {
      status: 'broken',
      // `broken` already returned above, so any arrival here is a change of state.
      changed: true,
      reason: 'the tool could not read the page any more',
      consecutiveCleanRuns: 0,
    }
  }

  const deviated = layers.result === 'deviated' || layers.structure === 'drifted'

  if (deviated) {
    const escalates =
      layers.result === 'deviated' && layers.structure === 'drifted' && layers.semantic === 'suspicious'

    if (escalates) {
      return {
        status: 'broken',
        changed: true,
        reason: 'the page changed and the content no longer looks right',
        consecutiveCleanRuns: 0,
      }
    }

    return {
      status: 'degraded',
      changed: previous !== 'degraded',
      reason: input.resultReason ?? input.structureReason ?? 'this run looks different from before',
      consecutiveCleanRuns: 0,
    }
  }

  if (previous !== 'degraded') {
    return {
      status: 'healthy',
      changed: previous !== 'healthy',
      reason: 'the tool is working',
      consecutiveCleanRuns: 0,
    }
  }

  const streak = input.consecutiveCleanRuns + 1
  if (streak >= RECOVERY_RUNS_REQUIRED) {
    return {
      status: 'healthy',
      changed: true,
      reason: 'back to normal after two clean runs',
      consecutiveCleanRuns: 0,
    }
  }

  return {
    status: 'degraded',
    changed: false,
    reason: 'one clean run — one more and it is healthy again',
    consecutiveCleanRuns: streak,
  }
}

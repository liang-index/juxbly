/**
 * Semantic layer — `docs/ARCHITECTURE.md` §10, `task/stage-1-11.md`.
 *
 * The only layer that spends the user's money, so it is the only one that is gated. Three
 * constraints, in priority order:
 *
 * 1. **It never runs on the happy path.** Only a result-layer or structure-layer deviation
 *    can open the gate — if the cheap layers see nothing wrong, the model is not asked.
 * 2. **It is throttled per tool.** Six hours, no per-site configuration: a tool that drifts
 *    every run must not bill the user on every run.
 * 3. **The user can always force it.** "Check now" is their action and their tokens; the
 *    throttle exists to protect them from *us*, not from themselves.
 *
 * The layer produces **no status of its own**. `suspicious` is an escalation input for
 * `degraded → broken`, never a fourth `HealthStatus` — otherwise a single model opinion
 * could break a tool that is still returning correct data.
 *
 * A failed or timed-out call is recorded as `error` and changes nothing: no network is not
 * a broken tool, and reporting otherwise would be a lie the user pays for.
 */
import type { SemanticCheck } from '@juxbly/core'
import { SEMANTIC_CHECK_MIN_INTERVAL_MS } from './constants'
import type { SemanticLayer } from './types'

export interface SemanticTrigger {
  /** The last check stored for this tool, if any. */
  previous: SemanticCheck | null
  /** Whether any cheap layer judged a deviation this run. */
  deviated: boolean
  /** Epoch millis, injected so the throttle is testable without fake timers. */
  now: number
  /** The user asked for a check explicitly. */
  force?: boolean
}

export function shouldRunSemanticCheck(trigger: SemanticTrigger): boolean {
  if (trigger.force === true) return true
  if (!trigger.deviated) return false

  const last = trigger.previous
  if (last === null) return true

  const elapsed = trigger.now - Date.parse(last.at)
  // An unparseable timestamp is treated as "long ago" rather than "just now": the safe
  // direction is to allow a check, since the throttle is a cost guard, not a lock.
  if (Number.isNaN(elapsed)) return true
  return elapsed >= SEMANTIC_CHECK_MIN_INTERVAL_MS
}

export function judgeSemantic(
  check: SemanticCheck | null | undefined,
  attempted: boolean | undefined,
): SemanticLayer {
  if (check !== null && check !== undefined) return check.verdict
  if (attempted === true) return 'error'
  return 'not-run'
}

/** True only when the model itself says the content is wrong. */
export function isSuspicious(check: SemanticCheck | null | undefined): boolean {
  return check?.verdict === 'suspicious'
}

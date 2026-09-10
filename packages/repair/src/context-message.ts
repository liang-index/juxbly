/**
 * The preset context message — `docs/ARCHITECTURE.md` §9.3, `task/stage-1-12.md` Scope 1.
 *
 * A repair starts because the product already told the user something is wrong; dropping
 * them into an empty composer would make them retype what they were just told. So the
 * first turn is pre-written, and it always carries three things (UI_SPEC §9 rule 2):
 * what was observed, the likely cause, and a next step.
 *
 * The *words* are not here. They live in `packages/ui/src/copy` (§9.5: no user-facing
 * string is hardcoded outside the copy bundle), and the caller hands them in. This module
 * owns only the assembly — which is why the sentence can be tested without React and the
 * copy can later be translated without touching the repair engine.
 */
import type { HealthEvaluation } from '@juxbly/core'

/**
 * Everything this module needs from a health evaluation.
 *
 * The panel holds `RunHealthVerdict` — the subset `run:report_result` sends back — so
 * asking for the whole `HealthEvaluation` here would force the panel to fabricate the
 * fields it does not have. `reason` is the only thing a context message reads.
 */
export type HealthReason = Pick<HealthEvaluation, 'reason'>

export interface RepairContextCopy {
  /** What Juxbly observed, e.g. "This tool has started coming back empty". */
  observed: string
  /** The likely cause, e.g. "the page may have changed". */
  cause: string
  /** The next step — the question the repair flow opens with. */
  next: string
}

/**
 * The observed / cause / next sentence, with the health engine's own reason folded in.
 *
 * The reason is a diagnostic produced by `packages/health` and shown as-is — it is not
 * locale copy (the same rule the panel uses for `HealthEvaluation.reason`), so it is
 * spliced in rather than translated.
 */
export function buildContextMessage(source: HealthReason, copy: RepairContextCopy): string {
  const reason = source.reason.trim()
  const cause = reason === '' ? copy.cause : `${copy.cause} — ${reason}`
  return `${copy.observed} — ${cause}. ${copy.next}`
}

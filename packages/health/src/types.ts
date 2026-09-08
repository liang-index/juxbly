/**
 * Health evaluation contracts — `docs/ARCHITECTURE.md` §5.5 / §8.1 / §10,
 * `task/stage-1-11.md`.
 *
 * The types themselves are transcribed once, in `@juxbly/core` (§5.5: core is the
 * dependency-graph bottom and the type SSOT); this package re-exports them and
 * implements the pure judgement behind them. `HealthInput` carries everything one run
 * can say about itself and nothing more — no page content, no extracted values. That is
 * what lets `evaluateHealth` be a pure function — the same input always yields the same
 * verdict, which in turn is what lets §10's state machine be exhausted by tests instead
 * of hoped for.
 */
import type { RunSummary } from '@juxbly/core'
import { RECENT_RUNS_WINDOW } from './constants'

export type {
  ExecutionLayer,
  HealthEvaluation,
  HealthInput,
  HealthLayers,
  ResultLayer,
  SemanticLayer,
  StructureLayer,
} from '@juxbly/core'

/** The window after this run, oldest dropped — the caller stores what it is given. */
export function appendRun(previous: readonly RunSummary[], summary: RunSummary): RunSummary[] {
  return [...previous, summary].slice(-RECENT_RUNS_WINDOW)
}

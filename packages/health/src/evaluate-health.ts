/**
 * `evaluateHealth()` — the four-layer judgement, `docs/ARCHITECTURE.md` §10,
 * `task/stage-1-11.md`.
 *
 * Pure: the same `HealthInput` always produces the same `HealthEvaluation`. That is what
 * makes the §10 branches exhaustible by tests, and it is why the function **writes
 * nothing** — the caller owns storage, because only the caller knows whether this run is
 * being recorded or merely previewed.
 *
 * What it deliberately does not do, with a note so the next refactor does not add it:
 *
 * - **It does not repair.** No selector rewriting, no regeneration, no "let's try another
 *   container". V1 forbids silent auto-repair (`docs/PRODUCT.md` §6.5,
 *   `docs/ARCHITECTURE.md` §9.3): a tool that quietly changed itself is worse than a
 *   visibly broken one, because then neither outcome can be trusted.
 * - **It does not move the structure baseline on drift.** Comparing against a moving
 *   baseline makes every drift vanish on the second run. The baseline changes only when a
 *   repaired version is confirmed (1-12) — a different decision, a different stage.
 * - **It does not put page content in `reason`.** The reason is shown in the panel, and
 *   the panel sits on someone else's page.
 */
import { judgeExecution } from './execution-layer'
import { captureFingerprint, judgeStructure, type StructureJudgement } from './fingerprint'
import { judgeResult } from './result-layer'
import { judgeSemantic, shouldRunSemanticCheck } from './semantic'
import { nextStatus } from './state-machine'
import { appendRun, type HealthEvaluation, type HealthInput, type HealthLayers } from './types'

export function evaluateHealth(input: HealthInput): HealthEvaluation {
  const { previous, summary } = input
  const now = input.now ?? Date.now()

  const execution = judgeExecution(input.extractError)
  const result = judgeResult(previous.recent_runs, summary)
  const structure = judgeCurrentStructure(previous.structure_fingerprint, input.fingerprint)

  const deviated = result.layer === 'deviated' || structure.layer === 'drifted'
  const semanticCheckRequested =
    execution === 'ok' &&
    shouldRunSemanticCheck({
      previous: previous.last_semantic_check,
      deviated,
      now,
      ...(input.forceSemanticCheck === undefined ? {} : { force: input.forceSemanticCheck }),
    })

  const layers: HealthLayers = {
    execution,
    result: result.layer,
    structure: structure.layer,
    semantic: judgeSemantic(input.semantic, input.semanticError),
  }

  const transition = nextStatus({
    previous: previous.status,
    consecutiveCleanRuns: previous.consecutive_clean_runs,
    layers,
    resultReason: result.reason,
    structureReason: structure.reason,
  })

  return {
    status: transition.status,
    changed: transition.changed,
    reason: transition.reason,
    layers,
    // Capture on the first run that has something to capture; otherwise hold the line.
    fingerprint: previous.structure_fingerprint ?? input.fingerprint ?? null,
    consecutiveCleanRuns: transition.consecutiveCleanRuns,
    semanticCheckRequested,
  }
}

/**
 * No structure reading this run (extract failed, or there was nothing to sample) is a
 * missing measurement, not a drift — the execution layer is the one that reports failure,
 * and inventing a zero-everything fingerprint to compare against would turn "we could not
 * look" into "the page changed".
 */
function judgeCurrentStructure(
  baseline: Parameters<typeof judgeStructure>[0],
  current: Parameters<typeof judgeStructure>[1] | null,
): StructureJudgement {
  if (current === null) {
    return { layer: 'no-baseline', reason: 'no structure reading this run' }
  }
  return judgeStructure(baseline, current)
}

export { appendRun, captureFingerprint }
export type { HealthEvaluation, HealthInput, HealthLayers }

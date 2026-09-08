/**
 * Candidate scoring — `docs/ARCHITECTURE.md` §5.6.
 *
 * The build phase asks a model for candidates and then stops trusting it: every candidate
 * is run as a **dry run** against the real page and scored on what actually matched. This
 * is the whole point of A2 — "the model proposes, the page decides" — and it is why there
 * is no model call anywhere in this file.
 *
 * Three rules hold the file together:
 *
 * - **No side effects.** A dry run is `extract` without `pre_scroll`: it queries and
 *   reads, and it never scrolls, writes or waits. Scoring six candidates must not move
 *   the page the user is looking at.
 * - **A throw eliminates, it does not score zero.** A selector that is syntactically
 *   invalid is a different answer from one that matched nothing (§5.2); the first is
 *   dropped from the ranking, the second stays in it with `hitCount: 0` and loses on
 *   merit.
 * - **Honest zeros.** `hitCount: 0` with a beautiful `fieldFillRate` is not a win; the
 *   hit term dominates for exactly that reason.
 */
import type { CandidateEvaluation, DomPort } from '@juxbly/core'
import type { ExtractStep, FieldType, ToolDefinition } from '@juxbly/dsl'
import { CapabilityError } from './errors'
import { extractList, extractSingle, summarizeFields } from './extract/modes'
import type { FieldValue } from './extract/field-value'
import { hasValue } from './extract/field-value'

/**
 * Weights, summing to 1. Hits come first because a candidate that matched nothing is
 * wrong no matter how clean its fields look; fill and shape only break ties between
 * candidates that found the same container.
 *
 * These are tuning constants, not contract: changing them reorders candidates without
 * changing the protocol. They are exported so a test can assert they still sum to 1 and
 * so the Phase 2 benchmark corpus (2-3) has one place to calibrate.
 */
export const SCORE_WEIGHTS = {
  hitCount: 0.4,
  fieldFillRate: 0.4,
  shapeScore: 0.2,
} as const

/**
 * Hit counts saturate here. 30 rows and 3000 rows are equally "this is the list"; above
 * the knee the number says more about the page than about the candidate.
 */
export const HIT_SATURATION = 30

/**
 * Scores every candidate. The returned array is **sparse by design**: a candidate whose
 * dry run threw is absent, so `evaluations[i].candidateIndex` is the only identity a
 * caller needs and `length < candidates.length` is the normal case, not a bug.
 */
export function evaluateCandidates(
  candidates: readonly ToolDefinition[],
  dom: DomPort,
): CandidateEvaluation[] {
  const evaluations: CandidateEvaluation[] = []

  candidates.forEach((candidate, candidateIndex) => {
    const step = firstExtractStep(candidate)
    if (step === null) return

    const evaluation = dryRun(step, dom)
    if (evaluation === null) return

    evaluations.push({ candidateIndex, ...evaluation })
  })

  return evaluations
}

/** The best-scoring evaluation. Ties go to the earlier candidate: the model's own order is its preference. */
export function pickBestCandidate(
  evaluations: readonly CandidateEvaluation[],
): CandidateEvaluation | null {
  let best: CandidateEvaluation | null = null

  for (const evaluation of evaluations) {
    if (best === null || evaluation.score > best.score) best = evaluation
  }

  return best
}

/**
 * What makes two candidates "the same plan" for the escalation chain: the container and
 * the field selectors, not the name or the description. A retry that returns the same
 * plan with different prose has not tried anything (§9.1 level ① distinctness rule).
 */
export function candidateFingerprint(candidate: ToolDefinition): string {
  const step = firstExtractStep(candidate)
  if (step === null) return `no-extract:${candidate.tool_id}`

  const fields = Object.keys(step.fields)
    .sort()
    .map((name) => `${name}=${step.fields[name] ?? ''}`)
    .join(';')

  return [step.mode, step.selector ?? '', fields].join('|')
}

/**
 * One dry run. Returns `null` when the candidate cannot be evaluated at all — an invalid
 * selector, a step that is not really an extract step, a DOM that is gone.
 *
 * `pre_scroll` is deliberately ignored: scoring must not scroll the user's page, and a
 * candidate that only works after scrolling is not the candidate to confirm on.
 */
function dryRun(step: ExtractStep, dom: DomPort): Omit<CandidateEvaluation, 'candidateIndex'> | null {
  try {
    const outcome = step.mode === 'list' ? extractList(dom, step) : extractSingle(dom, step)
    const fieldNames = Object.keys(step.fields)
    const { fieldPresence } = summarizeFields(outcome.records, fieldNames)

    const fieldFillRate = mean(fieldNames.map((name) => fieldPresence[name] ?? 0))
    const shapeScore = mean(
      outcome.records.flatMap((record) =>
        fieldNames.map((name) =>
          shapeMatch(record[name] as FieldValue, step.field_types?.[name] ?? 'text') ? 1 : 0,
        ),
      ),
    )

    const hitScore = Math.min(outcome.hitCount, HIT_SATURATION) / HIT_SATURATION

    return {
      hitCount: outcome.hitCount,
      fieldFillRate,
      shapeScore,
      score:
        SCORE_WEIGHTS.hitCount * hitScore +
        SCORE_WEIGHTS.fieldFillRate * fieldFillRate +
        SCORE_WEIGHTS.shapeScore * shapeScore,
    }
  } catch (error: unknown) {
    if (error instanceof CapabilityError) return null
    // A DOM that threw something else is not this candidate's fault, and swallowing it
    // would turn "the page is gone" into "no candidate worked".
    throw error
  }
}

/**
 * Does a value look like its declared type? `text` only asks for a non-empty string, so
 * an undeclared field set scores on presence — the shape term is a tie-breaker for the
 * fields a candidate *did* type, never a second opinion on the ones it did not.
 */
function shapeMatch(value: FieldValue, type: FieldType): boolean {
  if (!hasValue(value)) return false
  if (type === 'image') return typeof value !== 'string' && value.src !== ''
  if (type === 'link') return typeof value === 'string' && /^https?:\/\//i.test(value)
  return typeof value === 'string' && value !== ''
}

/** `extract` is the only step a candidate can be judged on: it is the one that touches the page. */
function firstExtractStep(candidate: ToolDefinition): ExtractStep | null {
  for (const step of candidate.steps) {
    if (step.type === 'extract') return step
  }
  return null
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

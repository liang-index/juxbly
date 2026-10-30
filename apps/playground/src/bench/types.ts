/**
 * Stage 2-3 — the benchmark's own contracts.
 *
 * `RunResult` / `CaseResult` follow `task/stage-2-3.md`; `LabeledResult` is the
 * contract stage 2-2 wrote into `docs/ARCHITECTURE.md` §13.1 and is reproduced
 * here because the runner is its first consumer. Both are written back to §13.1.
 *
 * Design rule that shapes every field here: **the runner produces facts, never a
 * verdict.** Nothing in this file decides whether a result is "good" — the label
 * arrives later, from a person, as a `LabeledResult`. A runner that scored itself
 * would bury the subjective standard in code where nobody can review it.
 */
import type { HealthStatus, TokenUsage } from '@juxbly/core'

export type Bucket = 'A' | 'B' | 'C' | 'D' | 'E'

export const BUCKETS: readonly Bucket[] = ['A', 'B', 'C', 'D', 'E']

export interface BenchCase {
  id: string
  bucket: Bucket
  url: string
  corpus: string
  task_description: string
  expected_fields: string[]
  notes: string
  verified_on: string
}

export interface CaseResult {
  caseId: string
  bucket: Bucket
  /** The DSL the model produced — kept raw, so a later reader can see what was asked for. */
  generatedJson: unknown
  /**
   * Every candidate the model returned, in the model's own order, before anything was
   * picked. Recorded because `generatedJson` is only the winner: a run that scores
   * candidates can be replayed from the same pool, and "the model offered three and the
   * best was the second" is a fact about the model, not about the selection rule.
   */
  candidates?: unknown[]
  /** How many candidates the model offered. 1 is the common case, not an error. */
  candidateCount?: number
  /** Which rule chose `generatedJson` out of `candidates`. */
  selection?: SelectionRule
  /**
   * Whether the container selector the tool runs is one the analyser offered.
   *
   * The headline failure of the 50-case corpus is a model that writes its own selector
   * instead of taking one from the list in the same prompt — `B-04` chose `div>div>a`
   * and hit 232 nodes. This is that, counted rather than argued about.
   */
  selectorFromList?: boolean
  /**
   * Field selectors, the same count: how many of the tool's field selectors were ones the
   * analyser offered for that container. Container and fields fail separately, and the
   * 10-site spike already said which one fails more often.
   */
  fieldsFromList?: { yes: number; no: number }
  generationSucceeded: boolean
  /** Why generation failed: the `build:propose` error code, or the validation errors. */
  generationError?: string
  /**
   * True when the first proposal came back as a clarification question instead of a
   * candidate. Offline there is nobody to answer it, so the runner re-asks once with
   * `noMoreQuestions` — this flag is what `correctionRate` counts.
   */
  neededClarification?: boolean
  executionError?: string
  /** The runtime's variable bag: the closest thing to "what the tool actually returned". */
  actualExtractionResult: unknown
  /** Items the tool produced, when the result is a list — the evidence behind a label. */
  itemCount?: number
  latencyMs: number
  tokenUsage?: TokenUsage
  healthStatus?: HealthStatus
  repairResult?: 'success' | 'failed' | 'not-attempted'
  /**
   * The corrected candidates the repair turn produced, in the model's own order.
   * Recorded so a replay re-applies the adoption rule against the same pool instead of
   * trusting the run's word for which tool won.
   */
  repairedCandidates?: unknown[]
}

/**
 * How the runner turned the model's candidates into the one tool it ran.
 *
 * `first-valid` is what the product did before §5.6 scoring existed and is what the
 * benchmark has always done. `best-scored` runs every candidate as a dry run against
 * the snapshot and takes the highest score — the product's own ranking, applied where
 * the benchmark used to just take the first.
 */
export type SelectionRule = 'first-valid' | 'best-scored' | 'none'

/**
 * A prompt-side change under test, named so a run can say which world it was taken in.
 *
 * Two runs are only comparable if the same rule picked the tool, so the variant is part
 * of the reading and part of the digest — a replay that re-selects under a different
 * rule would be measuring a different thing.
 *
 * `repair` is Round B: after the selected tool's first execution, what its extract step
 * actually produced is fed back to the model, which returns corrected candidates. The
 * repaired tool replaces the original only when it validates and runs cleanly (the
 * GT-free adoption rule lives in `repair.ts`); the replaced candidates are recorded so
 * a replay re-applies the same rule.
 */
export type BenchVariant = 'control' | 'bestof' | 'flat' | 'repair'

export interface RunResult {
  runId: string
  startedAt: string
  finishedAt: string
  corpusRevision: string
  model: string
  /** Which prompt/selection world this run was taken in; absent means `control`. */
  variant?: BenchVariant
  cases: CaseResult[]
}

export interface LabeledResult {
  caseId: string
  label: 'correct' | 'partial' | 'wrong'
  notes: string
  judgedAt: string
  judge: string
}

export interface FailureExcerpt {
  caseId: string
  bucket: Bucket
  /** Where it stopped: the model never produced a usable DSL, or the DSL never ran. */
  stage: 'generation' | 'execution'
  detail: string
}

export interface BucketMetrics {
  cases: number
  buildSuccessRate: number | null
  /** Field-level F1 inside this bucket; `null` when no scored case fell in it. */
  fieldF1: number | null
  labelCounts: LabelCounts
  correctionRate: number | null
}

export interface LabelCounts {
  correct: number
  partial: number
  wrong: number
  /** Judged by nobody yet. Reported as pending — never silently counted as `wrong`. */
  pending: number
}

/**
 * Field-level quality: the number the second gate is written against.
 *
 * Build success says a tool ran. This says whether what it extracted was what was
 * asked for — per field, so a failure in one field is not averaged away by a success
 * in another. `null` rates mean "nothing to measure", never "measured zero".
 */
export interface FieldMetrics {
  /** Expected field instances across every scored case — the recall denominator. */
  instances: number
  matched: number
  weak: number
  missing: number
  /** Produced columns that map to no expected field — the invented ones. */
  extra: number
  /** `matched / (matched + weak + extra)`; `null` when nothing was produced. */
  precision: number | null
  /** `matched / instances`; `null` when nothing was asked for. */
  recall: number | null
  /** Harmonic mean of the two; `null` when either is `null` or their sum is zero. */
  f1: number | null
  /** Share of cases whose item count fell inside the ground-truth range. */
  countAccuracy: number | null
}

export interface MetricsReport {
  runId: string
  corpusRevision: string
  model: string
  generatedAt: string
  total: number
  buildSuccessRate: number | null
  /** Field-level quality; `null` only when no case had a ground truth to score against. */
  fieldMetrics: FieldMetrics | null
  /** Container selectors taken from the analyser's list (`yes`) versus written by the model (`no`). */
  selectorFromList: { yes: number; no: number }
  /** The same count over field selectors, which fail separately from the container. */
  fieldsFromList: { yes: number; no: number }
  labelCounts: LabelCounts
  correctionRate: number | null
  healthFalsePositiveRate: number | null
  /**
   * Adopted repairs over attempted repairs (Round B `repair` runs). `null` when the run
   * attempted none — the common case, since control runs never repair. It measures the
   * benchmark's closed-loop experiment, not a product behaviour: V1 still forbids
   * silent auto-repair in the shipped extension (§ red line 6), and any product-side
   * repair would be a visible, versioned step in the panel, never silent.
   */
  repairSuccessRate: number | null
  latencyMs: { average: number; median: number; max: number }
  tokens: { prompt: number; completion: number }
  byBucket: Record<Bucket, BucketMetrics>
  failedCases: FailureExcerpt[]
  /** Cases with no judgement yet, so the report cannot be read as final. */
  pendingCases: string[]
  /**
   * The error code every single case failed with, when they all failed with the same one.
   *
   * A run where no case ever reached the model measured nothing: its 0% is a fact about
   * the network or the key, not about Juxbly. Reporting that as a baseline — or diffing
   * the next real run against it — would manufacture an improvement out of an outage.
   * `null` when at least one case got through, or when the failures differ.
   */
  environmentFailure: string | null
}

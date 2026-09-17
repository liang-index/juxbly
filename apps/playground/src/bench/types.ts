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
}

export interface RunResult {
  runId: string
  startedAt: string
  finishedAt: string
  corpusRevision: string
  model: string
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

export interface MetricsReport {
  runId: string
  corpusRevision: string
  model: string
  generatedAt: string
  total: number
  buildSuccessRate: number | null
  labelCounts: LabelCounts
  correctionRate: number | null
  healthFalsePositiveRate: number | null
  /** The runner does not repair (V1 forbids silent auto-repair); null until something does. */
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

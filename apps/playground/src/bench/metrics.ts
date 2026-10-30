/**
 * Aggregation: a `RunResult` plus the judgements a person has attached becomes the
 * report's numbers.
 *
 * Every rate here is defined in `docs/benchmark/README.md`. Two rules hold them honest:
 * an unjudged case is `pending` and never defaults to `wrong`, and a rate whose
 * denominator is empty is `null` rather than a flattering zero.
 */
import { BUCKETS, type Bucket, type CaseResult, type FailureExcerpt, type LabelCounts, type LabeledResult, type MetricsReport, type RunResult } from './types'
import { fieldMetrics, scoreCase, type CaseScore, type GroundTruth } from './scoring'

/**
 * @param groundTruths by case id. Without one, a case is not scored at field level —
 *   it is not counted as zero, because "no ground truth" is not "extracted nothing".
 */
export function aggregate(
  run: RunResult,
  labeled: readonly LabeledResult[] = [],
  groundTruths: ReadonlyMap<string, GroundTruth> = new Map(),
): MetricsReport {
  const labels = new Map(labeled.map((entry) => [entry.caseId, entry]))
  const labelCounts = countLabels(run.cases, labels)
  const latencies = run.cases.map((entry) => entry.latencyMs).sort((a, b) => a - b)
  const scores = run.cases
    .map((entry) => {
      const gt = groundTruths.get(entry.caseId)
      return gt === undefined ? null : scoreCase(entry, gt)
    })
    .filter((score): score is NonNullable<typeof score> => score !== null)

  return {
    runId: run.runId,
    corpusRevision: run.corpusRevision,
    model: run.model,
    generatedAt: new Date().toISOString(),
    total: run.cases.length,
    buildSuccessRate: rate(usableCases(run.cases).length, run.cases.length),
    fieldMetrics: scores.length === 0 ? null : fieldMetrics(scores),
    selectorFromList: selectorFromList(run.cases),
    fieldsFromList: fieldsFromList(run.cases),
    labelCounts,
    correctionRate: rate(run.cases.filter((entry) => entry.neededClarification === true).length, run.cases.length),
    healthFalsePositiveRate: healthFalsePositiveRate(run.cases),
    repairSuccessRate: repairSuccessRate(run.cases),
    latencyMs: {
      average: average(latencies),
      median: medianOf(latencies) ?? 0,
      max: latencies[latencies.length - 1] ?? 0,
    },
    tokens: run.cases.reduce(
      (totals, entry) => ({
        prompt: totals.prompt + (entry.tokenUsage?.prompt_tokens ?? 0),
        completion: totals.completion + (entry.tokenUsage?.completion_tokens ?? 0),
      }),
      { prompt: 0, completion: 0 },
    ),
    byBucket: byBucket(run.cases, labels, scores),
    failedCases: failures(run.cases),
    pendingCases: run.cases.filter((entry) => !labels.has(entry.caseId)).map((entry) => entry.caseId),
    environmentFailure: environmentFailure(run.cases),
  }
}

/**
 * Of the repair rounds a run attempted, how many ended with the repaired tool adopted.
 *
 * Attempted means `success` or `failed` — a case with `not-attempted` (control runs,
 * cases that never produced a tool) is not a denominator. `null` when nothing was
 * attempted, never zero: no attempt is no measurement.
 */
function repairSuccessRate(cases: readonly CaseResult[]): number | null {
  const attempted = cases.filter(
    (entry) => entry.repairResult === 'success' || entry.repairResult === 'failed',
  )
  if (attempted.length === 0) return null
  const adopted = attempted.filter((entry) => entry.repairResult === 'success').length
  return adopted / attempted.length
}

/**
 * How often the tool ran a container the analyser had offered.
 *
 * Counted over cases that produced a tool, because a case that produced nothing says
 * nothing about selector choice. This is the failure the corpus keeps showing — a model
 * that composes its own selector instead of taking one from the list in the same prompt
 * — made into a number instead of an argument.
 */
function selectorFromList(cases: readonly CaseResult[]): { yes: number; no: number } {
  let yes = 0
  let no = 0
  for (const entry of cases) {
    if (entry.selectorFromList === true) yes += 1
    else if (entry.selectorFromList === false) no += 1
  }
  return { yes, no }
}

function fieldsFromList(cases: readonly CaseResult[]): { yes: number; no: number } {
  let yes = 0
  let no = 0
  for (const entry of cases) {
    yes += entry.fieldsFromList?.yes ?? 0
    no += entry.fieldsFromList?.no ?? 0
  }
  return { yes, no }
}

/**
 * The one error code that stopped every case, if there is one.
 *
 * `NETWORK` on all 50 cases is not "50 failures", it is one failure — the endpoint was
 * unreachable. The same holds for a wrong key (`AUTH`) or an exhausted quota
 * (`RATE_LIMIT`): the run never asked the question it exists to ask. Naming it lets the
 * report say so and the CLI refuse to pass it off as a measurement.
 */
export function environmentFailure(cases: readonly CaseResult[]): string | null {
  if (cases.length === 0) return null
  const codes = cases.map((entry) => (entry.generationSucceeded ? undefined : entry.generationError))
  const first = codes[0]
  if (first === undefined || first === '') return null
  return codes.every((code) => code === first) ? first : null
}

/** Built and ran and returned something — the headline number, `null` when nothing ran. */
function usableCases(cases: readonly CaseResult[]): CaseResult[] {
  return cases.filter(
    (entry) => entry.generationSucceeded && entry.executionError === undefined && (entry.itemCount ?? 0) > 0,
  )
}

/**
 * Share of cases that ran clean and were still reported as not healthy.
 *
 * First-run health has no history to deviate from, so any non-healthy verdict here is a
 * false positive by construction — which is exactly the number §10's tuning needs.
 */
function healthFalsePositiveRate(cases: readonly CaseResult[]): number | null {
  const ran = cases.filter((entry) => entry.generationSucceeded && entry.executionError === undefined)
  const flagged = ran.filter((entry) => entry.healthStatus !== undefined && entry.healthStatus !== 'healthy')
  return rate(flagged.length, ran.length)
}

function countLabels(cases: readonly CaseResult[], labels: Map<string, LabeledResult>): LabelCounts {
  const counts: LabelCounts = { correct: 0, partial: 0, wrong: 0, pending: 0 }
  for (const entry of cases) {
    const label = labels.get(entry.caseId)
    if (label === undefined) counts.pending += 1
    else counts[label.label] += 1
  }
  return counts
}

function byBucket(
  cases: readonly CaseResult[],
  labels: Map<string, LabeledResult>,
  scores: readonly CaseScore[] = [],
): Record<Bucket, BucketCaseMetrics> {
  const out = {} as Record<Bucket, BucketCaseMetrics>
  const byCase = new Map(scores.map((score) => [score.caseId, score]))
  for (const bucket of BUCKETS) {
    const inBucket = cases.filter((entry) => entry.bucket === bucket)
    const bucketScores = inBucket.map((entry) => byCase.get(entry.caseId)).filter((score): score is CaseScore => score !== undefined)
    out[bucket] = {
      cases: inBucket.length,
      buildSuccessRate: rate(usableCases(inBucket).length, inBucket.length),
      fieldF1: bucketScores.length === 0 ? null : fieldMetrics(bucketScores).f1,
      labelCounts: countLabels(inBucket, labels),
      correctionRate: rate(inBucket.filter((entry) => entry.neededClarification === true).length, inBucket.length),
    }
  }
  return out
}

type BucketCaseMetrics = MetricsReport['byBucket'][Bucket]

/**
 * Failures carry the reason, not just the count: "0 hits", "wrong element" and
 * "field semantics" need different fixes, and a number alone cannot tell them apart.
 */
function failures(cases: readonly CaseResult[]): FailureExcerpt[] {
  const out: FailureExcerpt[] = []
  for (const entry of cases) {
    if (!entry.generationSucceeded) {
      out.push({
        caseId: entry.caseId,
        bucket: entry.bucket,
        stage: 'generation',
        detail: entry.generationError ?? (entry.neededClarification === true ? 'asked a clarifying question twice' : 'no usable candidate'),
      })
      continue
    }
    if (entry.executionError !== undefined) {
      out.push({ caseId: entry.caseId, bucket: entry.bucket, stage: 'execution', detail: entry.executionError })
      continue
    }
    if ((entry.itemCount ?? 0) === 0) {
      out.push({ caseId: entry.caseId, bucket: entry.bucket, stage: 'execution', detail: 'ran but extracted 0 items' })
    }
  }
  return out
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * The median, defined for an even count as the average of the two middle values.
 *
 * The gates are written as "the median of two runs", so this half of the definition is
 * the whole of it in practice — and it is the half that a "take the middle element"
 * shortcut gets wrong. That shortcut returns the *upper* of the two readings, which is
 * the better one, which is exactly the direction `docs/benchmark/README.md` forbids:
 * of two readings 37.4% and 38.7%, the reading is 38.1% and not 38.7%.
 */
export function medianOf(values: readonly number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle] ?? null
  const lower = sorted[middle - 1]
  const upper = sorted[middle]
  return lower === undefined || upper === undefined ? null : (lower + upper) / 2
}

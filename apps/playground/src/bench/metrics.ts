/**
 * Aggregation: a `RunResult` plus the judgements a person has attached becomes the
 * report's numbers.
 *
 * Every rate here is defined in `docs/benchmark/README.md`. Two rules hold them honest:
 * an unjudged case is `pending` and never defaults to `wrong`, and a rate whose
 * denominator is empty is `null` rather than a flattering zero.
 */
import { BUCKETS, type Bucket, type CaseResult, type FailureExcerpt, type LabelCounts, type LabeledResult, type MetricsReport, type RunResult } from './types'

export function aggregate(run: RunResult, labeled: readonly LabeledResult[] = []): MetricsReport {
  const labels = new Map(labeled.map((entry) => [entry.caseId, entry]))
  const labelCounts = countLabels(run.cases, labels)
  const latencies = run.cases.map((entry) => entry.latencyMs).sort((a, b) => a - b)

  return {
    runId: run.runId,
    corpusRevision: run.corpusRevision,
    model: run.model,
    generatedAt: new Date().toISOString(),
    total: run.cases.length,
    buildSuccessRate: rate(usableCases(run.cases).length, run.cases.length),
    labelCounts,
    correctionRate: rate(run.cases.filter((entry) => entry.neededClarification === true).length, run.cases.length),
    healthFalsePositiveRate: healthFalsePositiveRate(run.cases),
    repairSuccessRate: null,
    latencyMs: {
      average: average(latencies),
      median: latencies[Math.floor(latencies.length / 2)] ?? 0,
      max: latencies[latencies.length - 1] ?? 0,
    },
    tokens: run.cases.reduce(
      (totals, entry) => ({
        prompt: totals.prompt + (entry.tokenUsage?.prompt_tokens ?? 0),
        completion: totals.completion + (entry.tokenUsage?.completion_tokens ?? 0),
      }),
      { prompt: 0, completion: 0 },
    ),
    byBucket: byBucket(run.cases, labels),
    failedCases: failures(run.cases),
    pendingCases: run.cases.filter((entry) => !labels.has(entry.caseId)).map((entry) => entry.caseId),
  }
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

function byBucket(cases: readonly CaseResult[], labels: Map<string, LabeledResult>): Record<Bucket, BucketCaseMetrics> {
  const out = {} as Record<Bucket, BucketCaseMetrics>
  for (const bucket of BUCKETS) {
    const inBucket = cases.filter((entry) => entry.bucket === bucket)
    out[bucket] = {
      cases: inBucket.length,
      buildSuccessRate: rate(usableCases(inBucket).length, inBucket.length),
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

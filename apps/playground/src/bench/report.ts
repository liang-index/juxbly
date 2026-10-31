/**
 * The report: one markdown file per run in `tests/benchmark/reports/`.
 *
 * It always states the corpus revision, the model and the date, because a number
 * without them cannot be compared to anything — and comparison is the only reason the
 * benchmark exists. The delta against the previous run is printed, not computed away:
 * an improvement in one bucket that hides a regression in another has to be visible.
 */
import type { Bucket, MetricsReport } from './types'
import { BUCKETS } from './types'

export function renderReport(report: MetricsReport, previous: MetricsReport | null = null): string {
  const lines: string[] = []
  lines.push(`# Benchmark ${report.runId}`)
  lines.push('')
  lines.push(`- Model: \`${report.model}\``)
  lines.push(`- Corpus revision: \`${report.corpusRevision}\``)
  lines.push(`- Generated: ${report.generatedAt}`)
  lines.push(`- Cases: ${report.total}`)
  lines.push('')
  if (report.environmentFailure !== null) lines.push(...environmentLines(report.environmentFailure))
  lines.push('## Headline')
  lines.push('')
  lines.push(`| Metric | This run |${previous === null ? '' : ' Previous | Delta |'}`)
  lines.push(`|---|--${previous === null ? '' : '|--|--'}-|`)
  lines.push(`| Build Success Rate | ${percent(report.buildSuccessRate)} |${previous === null ? '' : ` ${percent(previous.buildSuccessRate)} | ${delta(report.buildSuccessRate, previous.buildSuccessRate)} |`}`)
  lines.push(...fieldLines(report, previous))
  lines.push(`| Clarification Rate (proxy) | ${percent(report.correctionRate)} |${previous === null ? '' : ` ${percent(previous.correctionRate)} | ${delta(report.correctionRate, previous.correctionRate)} |`}`)
  lines.push(`| Health false-positive | ${percent(report.healthFalsePositiveRate)} |${previous === null ? '' : ` ${percent(previous.healthFalsePositiveRate)} | ${delta(report.healthFalsePositiveRate, previous.healthFalsePositiveRate)} |`}`)
  lines.push(`| Repair success | ${report.repairSuccessRate === null ? 'not measured' : percent(report.repairSuccessRate)} |`)
  lines.push('')
  lines.push(...judgementLines(report))
  lines.push(...bucketLines(report))
  lines.push(...costLines(report))
  lines.push(...failureLines(report))
  return lines.join('\n')
}

/**
 * The banner for a run that never reached the model.
 *
 * Deliberately the first thing in the file: a reader who opens the report has to be
 * told "this is not a result" before they see any number, because every number below
 * is the same number — the outage, counted once per case.
 */
function environmentLines(code: string): string[] {
  return [
    '> **Not a benchmark result.** Every case failed at generation with the same error',
    `> (\`${code}\`), so no case ever reached the model. The rates below describe the`,
    '> environment, not Juxbly — do not publish them and do not diff against them.',
    '',
  ]
}

/**
 * The second gate's numbers.
 *
 * Printed directly under Build Success Rate because the two are meant to be read
 * together: a run that builds 90% and extracts 36% of what was asked for is not a
 * 90% result, and putting the two on separate screens is how that mistake survives.
 */
function fieldLines(report: MetricsReport, previous: MetricsReport | null): string[] {
  const fields = report.fieldMetrics
  if (fields === null) {
    return ['| Field-level F1 | not scored — no ground truth for this run |']
  }

  const before = previous?.fieldMetrics ?? null
  const row = (label: string, value: number | null, was: number | null): string =>
    `| ${label} | ${percent(value)} |${previous === null ? '' : ` ${percent(was)} | ${delta(value, was)} |`}`

  return [
    row('Field-level F1', fields.f1, before?.f1 ?? null),
    row('Field precision', fields.precision, before?.precision ?? null),
    row('Field recall', fields.recall, before?.recall ?? null),
    row('Item count in range', fields.countAccuracy, before?.countAccuracy ?? null),
    '',
    `Field instances: ${fields.instances} — matched ${fields.matched}, weak ${fields.weak}, ` +
      `missing ${fields.missing}, invented ${fields.extra} (columns nobody asked for).`,
    '',
  ]
}

function judgementLines(report: MetricsReport): string[] {
  const { correct, partial, wrong, pending } = report.labelCounts
  return [
    '## Judgements',
    '',
    `| correct | partial | wrong | pending |`,
    `|---|---|---|---|`,
    `| ${correct} | ${partial} | ${wrong} | ${pending} |`,
    '',
    pending === 0
      ? 'Every case in this run has been judged.'
      : `${pending} case(s) are **not judged yet** — they are not counted as wrong: ${report.pendingCases.join(', ')}`,
    '',
  ]
}

function bucketLines(report: MetricsReport): string[] {
  const lines = ['## By bucket', '', '| Bucket | Cases | Build Success Rate | Field F1 | correct | partial | wrong | pending |', '|---|---|---|---|---|---|---|---|']
  for (const bucket of BUCKETS) {
    const entry = report.byBucket[bucket as Bucket]
    lines.push(
      `| ${bucket} | ${entry.cases} | ${percent(entry.buildSuccessRate)} | ${percent(entry.fieldF1)} | ${entry.labelCounts.correct} | ${entry.labelCounts.partial} | ${entry.labelCounts.wrong} | ${entry.labelCounts.pending} |`,
    )
  }
  lines.push('')
  return lines
}

function costLines(report: MetricsReport): string[] {
  return [
    '## Cost',
    '',
    `- Latency: average ${Math.round(report.latencyMs.average)} ms, median ${Math.round(report.latencyMs.median)} ms, max ${Math.round(report.latencyMs.max)} ms`,
    `- Tokens: ${report.tokens.prompt} prompt + ${report.tokens.completion} completion`,
    '',
  ]
}

function failureLines(report: MetricsReport): string[] {
  if (report.failedCases.length === 0) return ['## Failures', '', 'None.', '']

  const lines = ['## Failures', '', '| Case | Bucket | Stage | Detail |', '|---|---|---|---|']
  for (const failure of report.failedCases) {
    lines.push(`| ${failure.caseId} | ${failure.bucket} | ${failure.stage} | ${failure.detail} |`)
  }
  lines.push('')
  return lines
}

function percent(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`
}

function delta(now: number | null, before: number | null): string {
  if (now === null || before === null) return 'n/a'
  const change = (now - before) * 100
  const sign = change > 0 ? '+' : ''
  return `${sign}${change.toFixed(1)} pp`
}

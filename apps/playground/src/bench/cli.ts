/**
 * The `pnpm test:bench` entry point.
 *
 * Deliberately explicit about money: a full run calls the model for every case, so it
 * never starts on its own, and a missing key is reported as a skip rather than as a
 * failure — CI must not go red for a secret it was never given.
 *
 * Two ways to get numbers out of it:
 *
 * - **live** (`--runs N`) — calls the model, writes `results/<run-id>.json` and a
 *   committable `digests/<run-id>.json`.
 * - **`--replay <digest>`** — re-runs a recorded proposal against the same snapshots.
 *   No key, no spend, same numbers. This is what makes a published number checkable,
 *   and what CI can run on every push.
 */
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { aggregate, medianOf } from './metrics'
import { renderReport } from './report'
import { buildRunId, runBenchmark, writeRunResult } from './runner'
import { DIGEST_SCHEMA, LEGACY_DIGEST_SCHEMA, replayDigest, toDigest, type RunDigest } from './digest'
import type { BenchVariant, Bucket, LabeledResult, MetricsReport, RunResult } from './types'
import type { GroundTruth } from './scoring'

const BENCHMARK_DIR = resolve(process.cwd(), 'tests', 'benchmark')
const DEFAULT_MODEL = 'gpt-4o-mini'

export interface CliOptions {
  caseId?: string | undefined
  bucket?: Bucket | undefined
  limit?: number | undefined
  model: string
  apiKey: string
  baseUrl?: string | undefined
  labels: LabeledResult[]
  /** Full runs in one invocation — the only honest way to see run-to-run variance. */
  runs: number
  /** Which world this run is taken in: prompt representation and selection rule. */
  variant: BenchVariant
  /** Replay a recorded digest instead of calling the model. */
  replay?: string | undefined
}

export async function main(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv, process.env)

  if (options.replay !== undefined) return replay(options)

  if (options.apiKey === '') {
    process.stdout.write('benchmark SKIPPED: JUXBLY_LLM_API_KEY is not set — no model calls were made.\n')
    return 0
  }
  // Labels are read here rather than inside `parseOptions` so that function stays pure
  // (tests call it without touching disk) — but they have to reach the report written
  // *now*. Leaving them empty until the next run means every case reads `pending` on the
  // first report anyone publishes, and labelling only becomes visible after paying twice.
  options.labels = await readLabels()
  const groundTruths = await readGroundTruths()

  const reports: MetricsReport[] = []
  for (let index = 0; index < options.runs; index += 1) {
    const run = await runBenchmark({
      model: options.model,
      settings: { apiKey: options.apiKey, ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }), model: options.model },
      ...(options.caseId === undefined ? {} : { caseId: options.caseId }),
      ...(options.bucket === undefined ? {} : { bucket: options.bucket }),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...(options.variant === 'control' ? {} : { variant: options.variant }),
    })

    const resultPath = await writeRunResult(run)
    const digestPath = await writeDigest(run)
    const report = aggregate(run, options.labels, groundTruths)
    const previous = await previousReport(run.runId)
    const reportPath = join(BENCHMARK_DIR, 'reports', `${run.runId}.md`)
    await writeFile(reportPath, `${renderReport(report, previous)}\n`)
    reports.push(report)

    process.stdout.write(`benchmark ${run.runId}: ${run.cases.length} cases\n`)
    process.stdout.write(`  results: ${resultPath}\n`)
    process.stdout.write(`  digest:  ${digestPath}\n`)
    process.stdout.write(`  report:  ${reportPath}\n`)
    process.stdout.write(headline(report))

    if (report.environmentFailure !== null) {
      process.stderr.write(
        `\nbenchmark FAILED: every case stopped at generation with \`${report.environmentFailure}\`.\n` +
          `  No case reached the model, so this run measured nothing — it is not a 0% baseline and\n` +
          `  the next run must not be diffed against it. Check JUXBLY_LLM_BASE_URL, the key and\n` +
          `  network egress, then delete ${resultPath} and run again.\n`,
      )
      return 1
    }
  }

  if (reports.length > 1) process.stdout.write(variance(reports))
  return 0
}

/** Replay: no key, no spend, and a hard failure on drift. */
async function replay(options: CliOptions): Promise<number> {
  const path = options.replay as string
  const digest = JSON.parse(await readFile(path, 'utf8')) as RunDigest
  if (digest.schema !== DIGEST_SCHEMA && digest.schema !== LEGACY_DIGEST_SCHEMA) {
    process.stderr.write(`replay FAILED: ${path} is digest schema ${digest.schema}, expected ${DIGEST_SCHEMA}.\n`)
    return 1
  }

  const groundTruths = await readGroundTruths()
  const { run, drift } = await replayDigest(digest, { apiKey: '', ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }), model: options.model })
  const report = aggregate(run, await readLabels(), groundTruths)
  const reportPath = join(BENCHMARK_DIR, 'reports', `${run.runId}.md`)
  await writeFile(reportPath, `${renderReport(report, null)}\n`)

  process.stdout.write(`replay ${digest.runId}: ${run.cases.length} cases (no model calls)\n`)
  process.stdout.write(`  report:  ${reportPath}\n`)
  process.stdout.write(headline(report))

  if (drift.length > 0) {
    process.stderr.write(`\nreplay DRIFT: ${drift.length} case(s) produced a different item count than the live run:\n`)
    for (const entry of drift) {
      process.stderr.write(`  ${entry.caseId}: recorded ${entry.recorded ?? 'n/a'}, replayed ${entry.replayed ?? 'n/a'}\n`)
    }
    process.stderr.write('  The corpus snapshot or the runtime changed after the run was recorded.\n')
    return 1
  }

  process.stdout.write('  every replayed item count matches the recorded run.\n')
  return 0
}

export function parseOptions(argv: readonly string[], env: Record<string, string | undefined>): CliOptions {
  const flags = new Map<string, string>()
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]
    if (key === undefined) continue
    flags.set(key.replace(/^--/, ''), argv[index + 1] ?? '')
  }

  const limit = flags.get('limit')
  const runs = Number(flags.get('runs') ?? '1')
  const variant = flags.get('variant')
  return {
    model: flags.get('model') ?? env.JUXBLY_LLM_MODEL ?? DEFAULT_MODEL,
    apiKey: env.JUXBLY_LLM_API_KEY ?? '',
    ...(env.JUXBLY_LLM_BASE_URL === undefined ? {} : { baseUrl: env.JUXBLY_LLM_BASE_URL }),
    ...(flags.has('case') ? { caseId: flags.get('case') } : {}),
    ...(flags.has('bucket') ? { bucket: flags.get('bucket') as Bucket } : {}),
    ...(flags.has('replay') ? { replay: flags.get('replay') } : {}),
    ...(limit === undefined ? {} : { limit: Number(limit) }),
    variant:
      variant === 'bestof' || variant === 'flat' || variant === 'repair' ? variant : 'control',
    runs: Number.isFinite(runs) && runs >= 1 ? Math.floor(runs) : 1,
    labels: [],
  }
}

function headline(report: MetricsReport): string {
  const fields = report.fieldMetrics
  return (
    `  build success rate: ${percent(report.buildSuccessRate)}\n` +
    `  field-level F1:     ${percent(fields?.f1 ?? null)}` +
    `${fields === null ? '' : ` (P ${percent(fields.precision)} / R ${percent(fields.recall)} over ${fields.instances} field instances)`}\n` +
    `  item count in range: ${percent(fields?.countAccuracy ?? null)}\n` +
    `  container from list: ${report.selectorFromList.yes}/${report.selectorFromList.yes + report.selectorFromList.no}\n` +
    `  fields from list:    ${report.fieldsFromList.yes}/${report.fieldsFromList.yes + report.fieldsFromList.no}\n`
  )
}

/**
 * Run-to-run spread, printed whenever more than one run was asked for.
 *
 * One number from one run cannot distinguish a real change from model variance; the
 * corpus's noise band is ~4pp, so anything smaller than this spread is not a finding.
 */
function variance(reports: readonly MetricsReport[]): string {
  const builds = reports.map((report) => report.buildSuccessRate)
  const f1s = reports.map((report) => report.fieldMetrics?.f1 ?? null)
  const spread = (values: readonly (number | null)[]): string => {
    const numbers = values.filter((value): value is number => value !== null)
    if (numbers.length !== values.length || numbers.length === 0) return 'n/a'
    return `${((Math.max(...numbers) - Math.min(...numbers)) * 100).toFixed(1)}pp across ${numbers.length} runs`
  }
  // `medianOf` and not the middle element: with two runs "the median" is their average, and
  // taking the upper one instead reports the better of the two — the one direction the
  // reading rules forbid. See the note on the helper.
  const median = (values: readonly (number | null)[]): string => {
    const numbers = values.filter((value): value is number => value !== null)
    if (numbers.length !== values.length || numbers.length === 0) return 'n/a'
    const middle = medianOf(numbers)
    return middle === null ? 'n/a' : percent(middle)
  }

  return (
    `\nvariance over ${reports.length} runs:\n` +
    `  build success: median ${median(builds)}, spread ${spread(builds)}\n` +
    `  field F1:      median ${median(f1s)}, spread ${spread(f1s)}\n` +
    `  A single-run difference smaller than this spread is not an improvement.\n`
  )
}

/**
 * Run results are named after their run id, which starts with an ISO date —
 * `2026-09-17T15-50-52-905-deepseek_deepseek_chat.json`. The prefix is the filter because
 * `results/` is not only runs: `labels.json` lives beside them, and it sorts last, so a
 * plain "last .json file" picked the judgements and crashed on a missing `cases`.
 */
const RUN_RESULT_FILE = /^\d{4}-\d{2}-\d{2}T/

export async function previousReport(currentRunId: string): Promise<MetricsReport | null> {
  const directory = join(BENCHMARK_DIR, 'results')
  let names: string[]
  try {
    names = (await readdir(directory))
      .filter((name) => name.endsWith('.json') && RUN_RESULT_FILE.test(name))
      .sort()
  } catch {
    return null
  }

  const previousName = names.filter((name) => name !== `${currentRunId}.json`).pop()
  if (previousName === undefined) return null

  const previousRun = JSON.parse(await readFile(join(directory, previousName), 'utf8')) as RunResult
  return aggregate(previousRun, await readLabels(), await readGroundTruths())
}

/**
 * The digest is written compact, not pretty-printed: it is committed, and two-space
 * JSON would double the size of every recorded run for no reader's benefit.
 */
export async function writeDigest(run: RunResult, directory = join(BENCHMARK_DIR, 'digests')): Promise<string> {
  await mkdir(directory, { recursive: true })
  const path = join(directory, `${run.runId}.json`)
  await writeFile(path, `${JSON.stringify(toDigest(run))}\n`)
  return path
}

/** Judgements live next to the results they belong to; they are filled in by a person. */
export async function readLabels(): Promise<LabeledResult[]> {
  try {
    return JSON.parse(await readFile(join(BENCHMARK_DIR, 'results', 'labels.json'), 'utf8')) as LabeledResult[]
  } catch {
    return []
  }
}

/**
 * Ground truths, keyed by case id.
 *
 * Read once and handed to `aggregate`: without them field-level scoring cannot run, and
 * a run that reports build success alone is the number that got us into trouble.
 */
export async function readGroundTruths(): Promise<Map<string, GroundTruth>> {
  const directory = join(BENCHMARK_DIR, 'ground-truth')
  const out = new Map<string, GroundTruth>()
  let names: string[]
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith('.json'))
  } catch {
    return out
  }
  for (const name of names) {
    const gt = JSON.parse(await readFile(join(directory, name), 'utf8')) as GroundTruth
    out.set(gt.case_id ?? name.replace(/\.json$/, ''), gt)
  }
  return out
}

function percent(value: number | null): string {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`
}

export { buildRunId }

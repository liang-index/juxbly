/**
 * The `pnpm test:bench` entry point.
 *
 * Deliberately explicit about money: a full run calls the model for every case, so it
 * never starts on its own, and a missing key is reported as a skip rather than as a
 * failure — CI must not go red for a secret it was never given.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { aggregate } from './metrics'
import { renderReport } from './report'
import { buildRunId, runBenchmark, writeRunResult } from './runner'
import type { Bucket, LabeledResult, MetricsReport, RunResult } from './types'

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
}

export async function main(argv: readonly string[]): Promise<number> {
  const options = parseOptions(argv, process.env)
  if (options.apiKey === '') {
    process.stdout.write('benchmark SKIPPED: JUXBLY_LLM_API_KEY is not set — no model calls were made.\n')
    return 0
  }
  // Labels are read here rather than inside `parseOptions` so that function stays pure
  // (tests call it without touching disk) — but they have to reach the report written
  // *now*. Leaving them empty until the next run means every case reads `pending` on the
  // first report anyone publishes, and labelling only becomes visible after paying twice.
  options.labels = await readLabels()

  const run = await runBenchmark({
    model: options.model,
    settings: { apiKey: options.apiKey, ...(options.baseUrl === undefined ? {} : { baseUrl: options.baseUrl }), model: options.model },
    ...(options.caseId === undefined ? {} : { caseId: options.caseId }),
    ...(options.bucket === undefined ? {} : { bucket: options.bucket }),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
  })

  const resultPath = await writeRunResult(run)
  const report = aggregate(run, options.labels)
  const previous = await previousReport(run.runId)
  const reportPath = join(BENCHMARK_DIR, 'reports', `${run.runId}.md`)
  await writeFile(reportPath, `${renderReport(report, previous)}\n`)

  process.stdout.write(`benchmark ${run.runId}: ${run.cases.length} cases\n`)
  process.stdout.write(`  results: ${resultPath}\n`)
  process.stdout.write(`  report:  ${reportPath}\n`)
  process.stdout.write(`  build success rate: ${report.buildSuccessRate === null ? 'n/a' : `${(report.buildSuccessRate * 100).toFixed(1)}%`}\n`)

  if (report.environmentFailure !== null) {
    process.stderr.write(
      `\nbenchmark FAILED: every case stopped at generation with \`${report.environmentFailure}\`.\n` +
        `  No case reached the model, so this run measured nothing — it is not a 0% baseline and\n` +
        `  the next run must not be diffed against it. Check JUXBLY_LLM_BASE_URL, the key and\n` +
        `  network egress, then delete ${resultPath} and run again.\n`,
    )
    return 1
  }

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
  return {
    model: flags.get('model') ?? env.JUXBLY_LLM_MODEL ?? DEFAULT_MODEL,
    apiKey: env.JUXBLY_LLM_API_KEY ?? '',
    ...(env.JUXBLY_LLM_BASE_URL === undefined ? {} : { baseUrl: env.JUXBLY_LLM_BASE_URL }),
    ...(flags.has('case') ? { caseId: flags.get('case') } : {}),
    ...(flags.has('bucket') ? { bucket: flags.get('bucket') as Bucket } : {}),
    ...(limit === undefined ? {} : { limit: Number(limit) }),
    labels: [],
  }
}

/**
 * The previous run's metrics, recomputed from its raw result.
 *
 * Recomputed rather than stored: the result file is the primary artefact and is
 * immutable, so an aggregation rule that changes later still produces a comparable
 * delta instead of freezing today's arithmetic into a file.
 */
export async function previousReport(currentRunId: string): Promise<MetricsReport | null> {
  const directory = join(BENCHMARK_DIR, 'results')
  let names: string[]
  try {
    names = (await readdir(directory)).filter((name) => name.endsWith('.json')).sort()
  } catch {
    return null
  }

  const previousName = names.filter((name) => name !== `${currentRunId}.json`).pop()
  if (previousName === undefined) return null

  const previousRun = JSON.parse(await readFile(join(directory, previousName), 'utf8')) as RunResult
  return aggregate(previousRun, await readLabels())
}

/** Judgements live next to the results they belong to; they are filled in by a person. */
export async function readLabels(): Promise<LabeledResult[]> {
  try {
    return JSON.parse(await readFile(join(BENCHMARK_DIR, 'results', 'labels.json'), 'utf8')) as LabeledResult[]
  } catch {
    return []
  }
}

export { buildRunId }

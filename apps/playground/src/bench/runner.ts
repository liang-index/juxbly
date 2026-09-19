/**
 * The benchmark runner (stage 2-3).
 *
 * One case is: load the frozen snapshot → analyse it → ask the model for a tool →
 * validate → run it → evaluate health. The runner records what happened; it never
 * decides whether the outcome was good.
 *
 * Runs are append-only: `results/<run-id>.json` is refused if it already exists, because
 * a number that can be rewritten is not a baseline.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { analyzePage } from '@juxbly/analyzer'
import type { LlmPort } from '@juxbly/core'
import { handleRunLlm } from '@juxbly/llm'
import { createMockAdapter } from '@juxbly/browser'
import { createSnapshotHost } from './corpus-host'
import { runTool } from './execute'
import { createLlmProposer, type LlmSettings, type ProposeFn, type Proposal } from './propose'
import type { BenchCase, Bucket, CaseResult, RunResult } from './types'

/** Resolved from the working directory — every entry point in this repo starts at the root. */
const BENCHMARK_DIR = resolve(process.cwd(), 'tests', 'benchmark')

export interface RunOptions {
  model: string
  settings: LlmSettings
  caseId?: string
  bucket?: Bucket
  limit?: number
  /** Injected by tests so a case can be exercised without spending tokens. */
  propose?: ProposeFn
  now?: () => Date
}

export async function runBenchmark(options: RunOptions): Promise<RunResult> {
  const entries = await selectCases(options)
  if (entries.length === 0) throw new Error('benchmark: no case matches the given filter')

  const now = options.now ?? (() => new Date())
  const startedAt = now()
  const cases: CaseResult[] = []

  for (const entry of entries) {
    cases.push(await runCase(entry, options, now))
  }

  return {
    runId: buildRunId(startedAt, options.model),
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    corpusRevision: await readCorpusRevision(),
    model: options.model,
    cases,
  }
}

async function runCase(entry: BenchCase, options: RunOptions, now: () => Date): Promise<CaseResult> {
  const startedAt = now().getTime()
  const html = await readFile(join(BENCHMARK_DIR, entry.corpus), 'utf8')
  const host = createSnapshotHost(html, entry.url)
  const analysis = analyzePage(host.document)

  const proposal = await proposeTool(analysis, entry, options)
  const base = { caseId: entry.id, bucket: entry.bucket }

  if (proposal.tool === null) {
    return {
      ...base,
      generatedJson: null,
      generationSucceeded: false,
      ...(proposal.error === undefined ? {} : { generationError: proposal.error }),
      ...(proposal.askedQuestion ? { neededClarification: true } : {}),
      actualExtractionResult: null,
      latencyMs: now().getTime() - startedAt,
      repairResult: 'not-attempted',
    }
  }

  const execution = await runTool(proposal.tool, host.dom, createBenchLlmPort(options.settings))

  return {
    ...base,
    generatedJson: proposal.tool,
    generationSucceeded: true,
    ...(proposal.askedQuestion ? { neededClarification: true } : {}),
    ...(execution.error === undefined ? {} : { executionError: execution.error }),
    actualExtractionResult: execution.outputs,
    itemCount: execution.itemCount,
    latencyMs: now().getTime() - startedAt,
    tokenUsage: mergeUsage(proposal.usage, execution.usage),
    ...(execution.health === undefined ? {} : { healthStatus: execution.health }),
    repairResult: 'not-attempted',
  }
}

/**
 * Two attempts at most: the model's first answer may be a clarifying question, and
 * offline nobody can answer it. The retry says "no more questions", which is what a
 * benchmark has to do — and the flag is what `correctionRate` counts.
 */
async function proposeTool(analysis: ReturnType<typeof analyzePage>, entry: BenchCase, options: RunOptions): Promise<Proposal> {
  const propose = options.propose ?? createLlmProposer(options.settings)
  const first = await propose({ analysis, task: entry.task_description, url: entry.url, noMoreQuestions: false })
  if (!first.askedQuestion) return first

  const second = await propose({ analysis, task: entry.task_description, url: entry.url, noMoreQuestions: true })
  return { ...second, askedQuestion: true }
}

/**
 * The `llm` step's port, built from `handleRunLlm` — the same function the background
 * runs for `run:llm` (§7.2), so a tool that calls the model mid-run is measured with the
 * product's own prompt and error handling.
 */
function createBenchLlmPort(settings: LlmSettings): LlmPort {
  const adapter = createMockAdapter({
    storage: {
      'juxbly:settings': {
        api_key: settings.apiKey,
        ...(settings.baseUrl === undefined ? {} : { api_base_url: settings.baseUrl }),
        ...(settings.model === undefined ? {} : { model: settings.model }),
      },
    },
  })

  return {
    call: async (step, input) => {
      const result = await handleRunLlm({ kind: 'run:llm', requestId: 'bench', step, input }, adapter)
      if (!result.ok) throw new Error(result.error ?? 'LLM_FAILED')
      return { output: result.output, usage: result.usage ?? { prompt_tokens: 0, completion_tokens: 0 } }
    },
  }
}

function mergeUsage(a: { prompt_tokens: number; completion_tokens: number } | undefined, b: { prompt_tokens: number; completion_tokens: number }): { prompt_tokens: number; completion_tokens: number } {
  return {
    prompt_tokens: (a?.prompt_tokens ?? 0) + b.prompt_tokens,
    completion_tokens: (a?.completion_tokens ?? 0) + b.completion_tokens,
  }
}

async function selectCases(options: RunOptions): Promise<BenchCase[]> {
  if (options.caseId !== undefined) {
    return [await readCase(options.caseId)]
  }

  const files = (await readdir(join(BENCHMARK_DIR, 'cases'))).filter((name) => name.endsWith('.json')).sort()
  const all: BenchCase[] = []
  for (const file of files) {
    all.push(await readCase(file.replace(/\.json$/, '')))
  }

  const filtered = all.filter((entry) => options.bucket === undefined || entry.bucket === options.bucket)
  return options.limit === undefined ? filtered : filtered.slice(0, options.limit)
}

export async function readCase(caseId: string): Promise<BenchCase> {
  const path = join(BENCHMARK_DIR, 'cases', `${caseId}.json`)
  try {
    return JSON.parse(await readFile(path, 'utf8')) as BenchCase
  } catch {
    throw new Error(`benchmark: no case "${caseId}" (expected ${path})`)
  }
}

/**
 * The corpus's own generation stamp, so a report can be tied to the snapshots it ran
 * against. A report without a corpus revision is a number without a denominator.
 */
async function readCorpusRevision(): Promise<string> {
  try {
    const index = JSON.parse(await readFile(join(BENCHMARK_DIR, 'corpus', 'index.json'), 'utf8')) as { generatedAt?: string }
    return index.generatedAt ?? 'unknown'
  } catch {
    return 'unknown'
  }
}

export function buildRunId(at: Date, model: string): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-').replace('Z', '')
  return `${stamp}-${model.replace(/[^a-zA-Z0-9]+/g, '_')}`
}

/** Results are immutable: a second write to the same run id is a bug, not an update. */
export async function writeRunResult(result: RunResult, directory = join(BENCHMARK_DIR, 'results')): Promise<string> {
  const path = join(directory, `${result.runId}.json`)
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' })
  return path
}

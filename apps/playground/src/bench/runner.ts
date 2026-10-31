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
import type { LlmPort, PageAnalysis } from '@juxbly/core'
import { handleRunLlm } from '@juxbly/llm'
import { createMockAdapter } from '@juxbly/browser'
import type { ExtractStep, ToolDefinition } from '@juxbly/dsl'
import type { DomPort } from '@juxbly/core'
import { createSnapshotHost } from './corpus-host'
import { runSelected } from './selection'
import { applyRepair, sampleRowsFromOutputs } from './repair'
import { createLlmProposer, type LlmSettings, type ProposeFn, type Proposal } from './propose'
import type { BenchCase, BenchVariant, Bucket, CaseResult, RunResult } from './types'
import type { Execution } from './execute'

/** Resolved from the working directory — every entry point in this repo starts at the root. */
const BENCHMARK_DIR = resolve(process.cwd(), 'tests', 'benchmark')

export interface RunOptions {
  model: string
  settings: LlmSettings
  caseId?: string
  bucket?: Bucket
  limit?: number
  /**
   * Which world this run is taken in: the prompt representation, and the rule that picks
   * a candidate. Absent means `control`.
   */
  variant?: BenchVariant
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
    runId: buildRunId(startedAt, options.model, options.variant),
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    corpusRevision: await readCorpusRevision(),
    model: options.model,
    ...(options.variant === undefined ? {} : { variant: options.variant }),
    cases,
  }
}

async function runCase(entry: BenchCase, options: RunOptions, now: () => Date): Promise<CaseResult> {
  const startedAt = now().getTime()
  const html = await readFile(join(BENCHMARK_DIR, entry.corpus), 'utf8')
  const host = createSnapshotHost(html, entry.url)
  const analysis = analyzePage(host.document)

  const propose =
    options.propose ??
    createLlmProposer(options.settings, options.variant === 'flat' ? { pageView: 'flat' } : {})
  const proposal = await proposeTool(analysis, entry, propose)
  const base = { caseId: entry.id, bucket: entry.bucket }
  const pool = {
    candidates: proposal.candidates,
    candidateCount: proposal.candidates.length,
  }

  if (proposal.tool === null) {
    return {
      ...base,
      ...pool,
      generatedJson: null,
      generationSucceeded: false,
      selection: 'none' as const,
      ...(proposal.error === undefined ? {} : { generationError: proposal.error }),
      ...(proposal.askedQuestion ? { neededClarification: true } : {}),
      actualExtractionResult: null,
      latencyMs: now().getTime() - startedAt,
      repairResult: 'not-attempted',
    }
  }

  const variant = options.variant ?? 'control'
  const { tool, rule, execution } = await runSelected(
    proposal.candidates,
    host.dom,
    createBenchLlmPort(options.settings),
    variant,
  )
  const fromList = tool === null ? undefined : usedOfferedSelector(tool, analysis)
  const fieldsFromList = tool === null ? undefined : offeredFieldUse(tool, analysis)

  if (tool === null || execution === null) {
    return {
      ...base,
      ...pool,
      generatedJson: null,
      generationSucceeded: false,
      selection: rule,
      generationError: 'NO_CANDIDATE',
      actualExtractionResult: null,
      latencyMs: now().getTime() - startedAt,
      repairResult: 'not-attempted',
    }
  }

  // ── Round B: one closed-loop repair, then the repaired tool is what is measured ────
  if (variant === 'repair') {
    const repairUsage = await repairRound({
      analysis,
      entry,
      propose,
      selected: { tool, execution },
      dom: host.dom,
      llm: createBenchLlmPort(options.settings),
    })
    const merged = mergeUsage(proposal.usage, mergeUsage(execution.usage, repairUsage.usage))
    const repairedFromList = usedOfferedSelector(repairUsage.tool, analysis)
    const repairedFieldsFromList = offeredFieldUse(repairUsage.tool, analysis)

    return {
      ...base,
      ...pool,
      generatedJson: repairUsage.tool,
      generationSucceeded: true,
      selection: rule,
      selectorFromList: repairedFromList,
      fieldsFromList: repairedFieldsFromList,
      ...(proposal.askedQuestion ? { neededClarification: true } : {}),
      ...(repairUsage.execution.error === undefined ? {} : { executionError: repairUsage.execution.error }),
      actualExtractionResult: repairUsage.execution.outputs,
      itemCount: repairUsage.execution.itemCount,
      latencyMs: now().getTime() - startedAt,
      tokenUsage: merged,
      ...(repairUsage.execution.health === undefined ? {} : { healthStatus: repairUsage.execution.health }),
      repairResult: repairUsage.adopted ? 'success' : 'failed',
      repairedCandidates: repairUsage.repairedCandidates,
    }
  }

  return {
    ...base,
    ...pool,
    generatedJson: tool,
    generationSucceeded: true,
    selection: rule,
    ...(fromList === undefined ? {} : { selectorFromList: fromList }),
    ...(fieldsFromList === undefined ? {} : { fieldsFromList }),
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
 * Did the tool take a container the analyser offered, or write its own?
 *
 * Compared as a string against the offered `tagPath`s, which is the strictest reading:
 * a selector that is *equivalent* but spelled differently is not the same claim, and
 * this is a count of what the model did, not of what would have worked.
 */
export function usedOfferedSelector(tool: ToolDefinition, analysis: PageAnalysis): boolean {
  return offeredSelectorUse(tool, analysis).container
}

/**
 * Field selectors, counted the same way, against the hints offered for *this* container.
 *
 * `:self` is counted as offered: it is the one selector the instruction teaches, and a
 * field that takes the container is a choice the model is allowed to make.
 */
export function offeredFieldUse(tool: ToolDefinition, analysis: PageAnalysis): { yes: number; no: number } {
  return offeredSelectorUse(tool, analysis).fields
}

function offeredSelectorUse(
  tool: ToolDefinition,
  analysis: PageAnalysis,
): { container: boolean; fields: { yes: number; no: number } } {
  const empty = { container: false, fields: { yes: 0, no: 0 } }
  const step = tool.steps.find((entry): entry is ExtractStep => entry.type === 'extract')
  if (step === undefined || step.selector === undefined) return empty

  const selector = step.selector.trim()
  const container = analysis.containers.find((entry) => entry.tagPath.trim() === selector)
  if (container === undefined) {
    // The container was invented, so its fields cannot have been offered for it.
    return { container: false, fields: countFields(step, []) }
  }

  return { container: true, fields: countFields(step, container.fieldHints.map((hint) => hint.selector.trim())) }
}

function countFields(step: ExtractStep, offered: readonly string[]): { yes: number; no: number } {
  let yes = 0
  let no = 0
  for (const value of Object.values(step.fields)) {
    const field = value.trim()
    if (field === ':self' || offered.includes(field)) yes += 1
    else no += 1
  }
  return { yes, no }
}

/**
 * Two attempts at most: the model's first answer may be a clarifying question, and
 * offline nobody can answer it. The retry says "no more questions", which is what a
 * benchmark has to do — and the flag is what `correctionRate` counts.
 */
async function proposeTool(
  analysis: ReturnType<typeof analyzePage>,
  entry: BenchCase,
  propose: ProposeFn,
): Promise<Proposal> {
  const first = await propose({ analysis, task: entry.task_description, url: entry.url, noMoreQuestions: false })
  if (!first.askedQuestion) return first

  const second = await propose({ analysis, task: entry.task_description, url: entry.url, noMoreQuestions: true })
  return { ...second, askedQuestion: true }
}

export interface RepairRoundResult {
  /** The tool the case measures: repaired when adopted, otherwise the original. */
  tool: ToolDefinition
  execution: Execution
  adopted: boolean
  repairedCandidates: unknown[]
  usage: { prompt_tokens: number; completion_tokens: number }
}

/**
 * One closed-loop repair turn (Round B).
 *
 * The repair call always says "no more questions": a clarification in a repair turn is
 * a repair that did not happen, recorded as `failed` with the original kept. The model
 * never sees ground truth — the adoption rule in `applyRepair` is execution-shaped.
 */
async function repairRound(input: {
  analysis: ReturnType<typeof analyzePage>
  entry: BenchCase
  propose: ProposeFn
  selected: { tool: ToolDefinition; execution: Execution }
  dom: DomPort
  llm: LlmPort
}): Promise<RepairRoundResult> {
  const { selected } = input
  const emptyUsage = { prompt_tokens: 0, completion_tokens: 0 }
  const kept: RepairRoundResult = {
    tool: selected.tool,
    execution: selected.execution,
    adopted: false,
    repairedCandidates: [],
    usage: emptyUsage,
  }

  const sampleRows = sampleRowsFromOutputs(selected.execution.outputs)
  const reply = await input.propose({
    analysis: input.analysis,
    task: input.entry.task_description,
    url: input.entry.url,
    noMoreQuestions: true,
    repair: { draft: selected.tool, sampleRows },
  })

  if (reply.tool === null || reply.candidates.length === 0) return kept

  const outcome = await applyRepair(reply.candidates, selected, input.dom, input.llm)
  return {
    tool: outcome.tool,
    execution: outcome.execution,
    adopted: outcome.adopted,
    repairedCandidates: reply.candidates,
    usage: reply.usage ?? emptyUsage,
  }
}

/**
 * The `llm` step's port, built from `handleRunLlm` — the same function the background
 * runs for `run:llm` (§7.2), so a tool that calls the model mid-run is measured with the
 * product's own prompt and error handling.
 */
export function createBenchLlmPort(settings: LlmSettings): LlmPort {
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

export function buildRunId(at: Date, model: string, variant?: BenchVariant): string {
  const stamp = at.toISOString().replace(/[:.]/g, '-').replace('Z', '')
  const base = `${stamp}-${model.replace(/[^a-zA-Z0-9]+/g, '_')}`
  // The variant is part of the name because two runs of the same model are not the same
  // experiment: a `flat` run and a `control` run taken five minutes apart are no more
  // comparable than two days apart.
  return variant === undefined || variant === 'control' ? base : `${base}-${variant}`
}

/** Results are immutable: a second write to the same run id is a bug, not an update. */
export async function writeRunResult(result: RunResult, directory = join(BENCHMARK_DIR, 'results')): Promise<string> {
  const path = join(directory, `${result.runId}.json`)
  await writeFile(path, `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' })
  return path
}

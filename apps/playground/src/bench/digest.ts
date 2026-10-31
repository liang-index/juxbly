/**
 * Record and replay: a run's numbers have to be reproducible without spending money.
 *
 * The raw result files (`tests/benchmark/results/*.json`) are gitignored on purpose —
 * they are half a megabyte a run and they cannot be regenerated, so committing them
 * would grow the repository without making anything verifiable. What makes a number
 * verifiable is not the output; it is **the tool the model proposed**, because
 * everything after that is deterministic: the same tool, run against the same frozen
 * snapshot, produces the same items.
 *
 * So a digest keeps exactly that — the proposal and the facts measured around it — and
 * a replay re-runs it. Replay needs no API key and calls no model, which is what lets
 * it run in CI and lets a reader check a published number instead of trusting it.
 *
 * Two things a digest deliberately does not contain:
 *
 * - **The extracted output.** It is recomputed on replay; storing it would only give
 *   two copies that can disagree.
 * - **Anything that changes between runs.** The recorded `itemCount` is kept solely so
 *   a replay can *check* itself — a replay that lands on a different count is drift,
 *   and drift is reported as a failure, not silently adopted as a new number.
 */
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { analyzePage } from '@juxbly/analyzer'
import type { TokenUsage } from '@juxbly/core'
import { createSnapshotHost } from './corpus-host'
import { runSelected } from './selection'
import { applyRepair } from './repair'
import { createBenchLlmPort, readCase, usedOfferedSelector, offeredFieldUse } from './runner'
import type { BenchCase, BenchVariant, Bucket, CaseResult, RunResult } from './types'
import type { LlmSettings } from './propose'

const BENCHMARK_DIR = resolve(process.cwd(), 'tests', 'benchmark')

/** Bumped when the shape changes; a replay refuses a digest it cannot read. */
export const DIGEST_SCHEMA = 2

/** Schema 1 recorded only the tool the run executed — a pool of exactly one. */
export const LEGACY_DIGEST_SCHEMA = 1

export interface DigestCase {
  caseId: string
  bucket: Bucket
  /**
   * Every candidate the model proposed, in its own order. The run's selection rule is
   * re-applied on replay, so a digest has to keep the pool and not just the winner.
   */
  candidates: unknown[]
  /** Schema 1 only: the tool the run executed, when the pool was not recorded. */
  generatedJson?: unknown
  generationSucceeded: boolean
  generationError?: string
  neededClarification?: boolean
  /**
   * Round B: the corrected candidates the repair turn produced. A replay re-applies the
   * adoption rule against the original pool plus these, so the run's choice is checked,
   * not copied.
   */
  repairedCandidates?: unknown[]
  /** Measured during the live run. Replay checks against it; it is not a fallback. */
  recordedItemCount?: number
  latencyMs: number
  tokenUsage?: TokenUsage
}

export interface RunDigest {
  schema: number
  runId: string
  startedAt: string
  corpusRevision: string
  model: string
  /** Which world the run was taken in. Absent means `control`. */
  variant?: BenchVariant
  cases: DigestCase[]
}

export function toDigest(run: RunResult): RunDigest {
  return {
    schema: DIGEST_SCHEMA,
    runId: run.runId,
    startedAt: run.startedAt,
    corpusRevision: run.corpusRevision,
    model: run.model,
    ...(run.variant === undefined ? {} : { variant: run.variant }),
    cases: run.cases.map((entry) => ({
      caseId: entry.caseId,
      bucket: entry.bucket,
      candidates: entry.candidates ?? (entry.generatedJson === null ? [] : [entry.generatedJson]),
      generationSucceeded: entry.generationSucceeded,
      ...(entry.generationError === undefined ? {} : { generationError: entry.generationError }),
      ...(entry.neededClarification === undefined ? {} : { neededClarification: entry.neededClarification }),
      ...(entry.repairedCandidates === undefined ? {} : { repairedCandidates: entry.repairedCandidates }),
      ...(entry.itemCount === undefined ? {} : { recordedItemCount: entry.itemCount }),
      latencyMs: entry.latencyMs,
      ...(entry.tokenUsage === undefined ? {} : { tokenUsage: entry.tokenUsage }),
    })),
  }
}

/** A schema-1 digest is a pool of one: what the run executed is all that was recorded. */
function candidatesOf(entry: DigestCase): unknown[] {
  if (Array.isArray(entry.candidates)) return entry.candidates
  return entry.generatedJson === null || entry.generatedJson === undefined ? [] : [entry.generatedJson]
}

export interface ReplayResult {
  run: RunResult
  /** Cases whose replayed item count differs from the recorded one. */
  drift: { caseId: string; recorded: number | undefined; replayed: number | undefined }[]
}

/**
 * Re-run a digest against the frozen snapshots.
 *
 * The `llm` port is still built, because a tool that declares an `llm` step needs one
 * to exist — but with no key it fails loudly rather than quietly calling a model and
 * charging for it. No case in the current corpus proposes such a step; if one ever
 * does, it shows up as drift rather than as a silent number.
 */
export async function replayDigest(digest: RunDigest, settings: LlmSettings): Promise<ReplayResult> {
  const cases: CaseResult[] = []
  const drift: ReplayResult['drift'] = []
  // The variant is replayed, not looked up: a `bestof` digest re-scores its pool here, so
  // the number a reader checks is the number the run published under the same rule.
  const variant = digest.variant ?? 'control'

  for (const entry of digest.cases) {
    const benchCase = await readCase(entry.caseId)
    const candidates = candidatesOf(entry)

    if (!entry.generationSucceeded || candidates.length === 0) {
      cases.push({
        caseId: entry.caseId,
        bucket: entry.bucket,
        generatedJson: entry.generatedJson ?? null,
        candidates,
        candidateCount: candidates.length,
        selection: 'none',
        generationSucceeded: false,
        ...(entry.generationError === undefined ? {} : { generationError: entry.generationError }),
        ...(entry.neededClarification === undefined ? {} : { neededClarification: entry.neededClarification }),
        actualExtractionResult: null,
        latencyMs: entry.latencyMs,
        ...(entry.tokenUsage === undefined ? {} : { tokenUsage: entry.tokenUsage }),
        repairResult: 'not-attempted',
      })
      continue
    }

    const host = await hostFor(benchCase)
    const llmPort = createBenchLlmPort(settings)
    let selected = await runSelected(candidates, host.dom, llmPort, variant)
    let repairResult: CaseResult['repairResult'] = 'not-attempted'

    // Round B replay: the same adoption rule against the same repaired pool. What the
    // replay checks is the run's *choice*, so the rule has to be the runner's own.
    if (
      variant === 'repair' &&
      selected.tool !== null &&
      selected.execution !== null &&
      entry.repairedCandidates !== undefined &&
      entry.repairedCandidates.length > 0
    ) {
      const outcome = await applyRepair(
        entry.repairedCandidates,
        { tool: selected.tool, execution: selected.execution },
        host.dom,
        llmPort,
      )
      selected = { ...selected, tool: outcome.tool, execution: outcome.execution }
      repairResult = outcome.adopted ? 'success' : 'failed'
    }

    const { tool, rule, execution } = selected
    // Recomputed, not copied from the digest: whether the selector came from the list is a
    // fact about the tool and the page, and a replay has both in front of it.
    const analysis = analyzePage(host.document)
    const fromList = tool === null ? undefined : usedOfferedSelector(tool, analysis)
    const fieldsFromList = tool === null ? undefined : offeredFieldUse(tool, analysis)

    if (tool === null || execution === null) {
      cases.push({
        caseId: entry.caseId,
        bucket: entry.bucket,
        generatedJson: null,
        candidates,
        candidateCount: candidates.length,
        selection: rule,
        generationSucceeded: false,
        generationError: 'NO_CANDIDATE',
        actualExtractionResult: null,
        latencyMs: entry.latencyMs,
        repairResult: 'not-attempted',
      })
      continue
    }

    if (execution.itemCount !== entry.recordedItemCount) {
      drift.push({ caseId: entry.caseId, recorded: entry.recordedItemCount, replayed: execution.itemCount })
    }

    cases.push({
      caseId: entry.caseId,
      bucket: entry.bucket,
      generatedJson: tool,
      candidates,
      candidateCount: candidates.length,
      selection: rule,
      ...(fromList === undefined ? {} : { selectorFromList: fromList }),
      ...(fieldsFromList === undefined ? {} : { fieldsFromList }),
      generationSucceeded: true,
      ...(entry.neededClarification === undefined ? {} : { neededClarification: entry.neededClarification }),
      ...(execution.error === undefined ? {} : { executionError: execution.error }),
      actualExtractionResult: execution.outputs,
      itemCount: execution.itemCount,
      latencyMs: entry.latencyMs,
      ...(entry.tokenUsage === undefined ? {} : { tokenUsage: entry.tokenUsage }),
      ...(execution.health === undefined ? {} : { healthStatus: execution.health }),
      repairResult,
      ...(entry.repairedCandidates === undefined ? {} : { repairedCandidates: entry.repairedCandidates }),
    })
  }

  return {
    run: {
      runId: `${digest.runId}-replay`,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      corpusRevision: digest.corpusRevision,
      model: digest.model,
      ...(digest.variant === undefined ? {} : { variant: digest.variant }),
      cases,
    },
    drift,
  }
}

async function hostFor(entry: BenchCase): Promise<ReturnType<typeof createSnapshotHost>> {
  const html = await readFile(join(BENCHMARK_DIR, entry.corpus), 'utf8')
  return createSnapshotHost(html, entry.url)
}

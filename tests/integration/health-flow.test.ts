import { describe, expect, it } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import { appendRun, capSample, evaluateHealth, shouldRunSemanticCheck, SEMANTIC_SAMPLE_SIZE } from '@juxbly/health'
import { captureFingerprint } from '@juxbly/health'
import { emptyHealth, loadTool, recordHealthResult, saveTool } from '@juxbly/storage'
import type { ExtractError, SemanticCheck, StructureFingerprint, ToolRecord } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'

/**
 * The health write path, end to end over storage (`task/stage-1-11.md` integration AC):
 * a sequence of runs drives `evaluateHealth` exactly the way the background's
 * `run:report` handler does — evaluate, append the window, store — with the semantic
 * call counted at the same seam the background places it (the gate `evaluateHealth`
 * opens, the throttle decides, the caller executes).
 *
 * The background entrypoint itself is wxt assembly and not importable from node; the
 * handler's logic is a transcription of the sequence below, and the sequence is what
 * this test pins.
 */

const T0 = Date.parse('2026-09-08T00:00:00.000Z')
const HOUR = 60 * 60 * 1000

function definition(): ToolDefinition {
  return {
    tool_id: 'tool_health',
    name: 'Health fixture',
    category: 'data',
    url_pattern: 'https://example.test/*',
    version: 1,
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector: '.row',
        fields: { title: 'h3', price: '.price' },
        output_to: 'items',
      },
    ],
    created_at: new Date(T0).toISOString(),
  } as unknown as ToolDefinition
}

function record(): ToolRecord {
  return {
    tool_id: 'tool_health',
    definition: definition(),
    versions: [],
    health: emptyHealth(),
    run_state: { last_extract_hash: null, last_llm_outputs: {} },
    usage: { last_run_at: null, run_count: 0, last_export_at: null, export_count: 0 },
    created_at: new Date(T0).toISOString(),
    updated_at: new Date(T0).toISOString(),
  }
}

const BASELINE: StructureFingerprint = captureFingerprint(
  { hitCount: 20, fieldPresence: { title: 1, price: 0.9 } },
  { at: new Date(T0).toISOString() },
)

function summaryAt(offsetMs: number, itemCount: number) {
  return {
    at: new Date(T0 + offsetMs).toISOString(),
    had_data: itemCount > 0,
    item_count: itemCount,
    field_digest: itemCount > 0 ? { title: 'text', price: 'text' } : {},
  }
}

interface DriveOptions {
  semanticVerdict?: 'ok' | 'suspicious'
  /** The execution layer's signal: what extract threw, if it threw. */
  extractError?: ExtractError
}

/**
 * One run, exactly as the background handler does it: evaluate → (gate open? call the
 * model) → re-evaluate with the verdict → append → store. Returns the evaluation so the
 * test can read status transitions and count semantic calls.
 */
async function driveRun(
  adapter: ReturnType<typeof createMockAdapter>,
  input: {
    summary: ReturnType<typeof summaryAt>
    fingerprint?: StructureFingerprint | null
    now: number
    extractError?: ExtractError
  },
  options: DriveOptions = {},
) {
  const stored = (await loadTool(adapter, 'tool_health')) as ToolRecord

  const fingerprint = input.fingerprint ?? null
  const error = input.extractError ?? options.extractError
  const evaluation = evaluateHealth({
    previous: stored.health,
    summary: input.summary,
    fingerprint,
    now: input.now,
    ...(error === undefined ? {} : { extractError: error }),
  })

  let semanticCalls = 0
  let semantic: SemanticCheck | undefined
  let final = evaluation

  if (evaluation.semanticCheckRequested) {
    semanticCalls = 1
    semantic = {
      at: new Date(input.now).toISOString(),
      verdict: options.semanticVerdict ?? 'ok',
      reason: 'fixture verdict',
      usage: { prompt_tokens: 10, completion_tokens: 2 },
    }
    final = evaluateHealth({
      previous: stored.health,
      summary: input.summary,
      fingerprint,
      now: input.now,
      semantic,
      ...(error === undefined ? {} : { extractError: error }),
    })
  }

  const health = {
    ...stored.health,
    status: final.status,
    recent_runs: appendRun(stored.health.recent_runs, input.summary),
    structure_fingerprint: final.fingerprint,
    last_semantic_check: semantic ?? stored.health.last_semantic_check,
    consecutive_clean_runs: final.consecutiveCleanRuns,
  }
  await recordHealthResult(adapter, 'tool_health', health, input.summary.at)

  return { evaluation: final, semanticCalls }
}

describe('health flow over storage', () => {
  it('first run captures the baseline without judging; the next deformed run degrades', async () => {
    const adapter = createMockAdapter({ storage: { 'juxbly:tools': { tool_health: record() } } })
    await saveTool(adapter, record(), 'created')

    const first = await driveRun(adapter, {
      summary: summaryAt(HOUR, 20),
      fingerprint: BASELINE,
      now: T0 + HOUR,
    })
    expect(first.evaluation.status).toBe('healthy')
    expect(first.semanticCalls).toBe(0)

    const stored = (await loadTool(adapter, 'tool_health')) as ToolRecord
    expect(stored.health.structure_fingerprint).toEqual(BASELINE)
    expect(stored.health.recent_runs).toHaveLength(1)

    // Containers collapse to a quarter of the baseline: drift → degraded, no break.
    const second = await driveRun(adapter, {
      summary: summaryAt(2 * HOUR, 20),
      fingerprint: { ...BASELINE, container_count: 5 },
      now: T0 + 2 * HOUR,
    })
    expect(second.evaluation.status).toBe('degraded')
    expect(second.evaluation.layers.structure).toBe('drifted')
    expect(second.semanticCalls).toBe(1)
  })

  it('two clean runs recover a degraded tool', async () => {
    const adapter = createMockAdapter({ storage: { 'juxbly:tools': { tool_health: record() } } })
    await saveTool(adapter, { ...record(), health: { ...emptyHealth(), status: 'degraded' } }, 'seeded')

    const first = await driveRun(adapter, {
      summary: summaryAt(HOUR, 20),
      fingerprint: BASELINE,
      now: T0 + HOUR,
    })
    expect(first.evaluation.status).toBe('degraded')
    expect(first.evaluation.reason).toContain('one more')

    const second = await driveRun(adapter, {
      summary: summaryAt(2 * HOUR, 20),
      fingerprint: BASELINE,
      now: T0 + 2 * HOUR,
    })
    expect(second.evaluation.status).toBe('healthy')
    expect(second.evaluation.changed).toBe(true)
  })

  it('a suspicious verdict alone never breaks a tool; result + structure + semantic does', async () => {
    // Seed a result baseline (3 healthy 20-item runs) and the structure baseline, so a
    // 0-item run is a genuine *deviation* rather than "no baseline to judge against".
    const seeded = record()
    const history = [10, 11, 12].map((h) => summaryAt(h * HOUR, 20))
    const withBaseline = {
      ...seeded,
      health: {
        ...emptyHealth(),
        recent_runs: history,
        structure_fingerprint: BASELINE,
      },
    }
    const adapter = createMockAdapter({
      storage: { 'juxbly:tools': { tool_health: withBaseline } },
    })
    await saveTool(adapter, withBaseline, 'created')

    // Result layer deviates (20 → 0); structure is untouched. The suspicious verdict
    // arrives — and still does not break the tool (§10: one model opinion is not enough).
    const degraded = await driveRun(
      adapter,
      { summary: summaryAt(20 * HOUR, 0), fingerprint: BASELINE, now: T0 + 20 * HOUR },
      { semanticVerdict: 'suspicious' },
    )
    expect(degraded.evaluation.status).toBe('degraded')
    expect(degraded.evaluation.layers.result).toBe('deviated')
    expect(degraded.evaluation.layers.semantic).toBe('suspicious')

    // Six hours later: result AND structure deviate AND the model says suspicious → the
    // one escalation path §10 allows.
    const escalated = await driveRun(
      adapter,
      {
        summary: summaryAt(27 * HOUR, 0),
        fingerprint: { ...BASELINE, container_count: 2 },
        now: T0 + 27 * HOUR,
      },
      { semanticVerdict: 'suspicious' },
    )
    expect(escalated.evaluation.status).toBe('broken')
  })

  it('an extract error breaks the tool, and a clean run does not quietly heal it', async () => {
    const adapter = createMockAdapter({ storage: { 'juxbly:tools': { tool_health: record() } } })
    await saveTool(adapter, record(), 'created')

    const healthy = await driveRun(adapter, {
      summary: summaryAt(HOUR, 20),
      fingerprint: BASELINE,
      now: T0 + HOUR,
    })
    expect(healthy.evaluation.status).toBe('healthy')

    // The container is gone. The execution layer is the only one that can go straight to
    // broken, and it needs no history to do it — a tool that cannot read cannot be judged
    // against what it used to read.
    const broken = await driveRun(
      adapter,
      { summary: summaryAt(2 * HOUR, 0), fingerprint: null, now: T0 + 2 * HOUR },
      { extractError: { code: 'CONTAINER_MISSING', message: 'no container matched' } },
    )
    expect(broken.evaluation.status).toBe('broken')
    expect(broken.evaluation.layers.execution).toBe('failed')
    // No semantic call: nothing was sampled, and a model cannot repair a selector.
    expect(broken.semanticCalls).toBe(0)

    // A perfect run afterwards — still broken. Only a repaired version clears it (§10),
    // and 1-12 owns that; a single good run must not hide that the tool failed.
    const after = await driveRun(adapter, {
      summary: summaryAt(3 * HOUR, 20),
      fingerprint: BASELINE,
      now: T0 + 3 * HOUR,
    })
    expect(after.evaluation.status).toBe('broken')
    expect(after.evaluation.changed).toBe(false)
  })

  it('the semantic gate stays shut on the happy path and respects the six-hour throttle', () => {
    const noDeviation = shouldRunSemanticCheck({ previous: null, deviated: false, now: T0 })
    expect(noDeviation).toBe(false)

    const previous: SemanticCheck = {
      at: new Date(T0).toISOString(),
      verdict: 'ok',
      reason: 'earlier check',
    }
    expect(shouldRunSemanticCheck({ previous, deviated: true, now: T0 + 5 * HOUR })).toBe(false)
    expect(shouldRunSemanticCheck({ previous, deviated: true, now: T0 + 6 * HOUR })).toBe(true)
  })

  it('the sample sent for a semantic check goes through the single cap', () => {
    const page = Array.from({ length: 50 }, (_, i) => ({ title: `row ${String(i)}` }))

    // `capSample` is the one enforcer (`packages/health`), shared by the content script and
    // the background; asserting the slice inline here would test JavaScript, not Juxbly.
    // The wiring at each call site is fixed by `packages/ui/src/run/health-inputs.test.ts`.
    expect(capSample(page)).toHaveLength(SEMANTIC_SAMPLE_SIZE)
  })
})

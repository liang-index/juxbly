// @vitest-environment jsdom
import { createMockAdapter } from '@juxbly/browser'
import { evaluateHealth } from '@juxbly/health'
import { fromHealth, recordFailure, shouldStop } from '@juxbly/repair'
import {
  handleBuildSaveTool,
  handleToolRollback,
  loadTool,
  recordHealthResult,
} from '@juxbly/storage'
import { createBuildSession } from '@juxbly/ui'
import type { BuildSessionPorts, CandidateScorer, ProposeReply } from '@juxbly/ui'
import type { ExtractError, HealthEvaluation, PageAnalysis, RunSummary } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { describe, expect, it } from 'vitest'

/**
 * The repair flow, end to end — `task/stage-1-12.md` Tests (core acceptance).
 *
 * The sequence is the acceptance criterion, in order:
 *
 *   saved tool (v1) → run → broken → repair entry (preset context message)
 *   → `build:save_tool` with `repair` → v2 written, v1 kept and marked `ever_broken`
 *   → rollback to v1 → the run uses v1's definition again
 *
 * The background entrypoint is wxt assembly and is not importable from node, so this test
 * drives the two handlers it delegates to (`packages/storage`) — which is where the whole
 * write path lives anyway (§7.1). Nothing here writes a version by any other route, and
 * nothing writes one without a validated definition in hand.
 *
 * The last case pins the stop-loss at the seam where it is real: a repair's allowance is
 * spent by model calls, and the build flow answers for them.
 */

const AT = '2026-09-08T10:00:00.000Z'
const TOOL_ID = 'tool_8f3a2b'

function definition(version: number, selector = '.product'): ToolDefinition {
  return {
    tool_id: TOOL_ID,
    name: 'Shop results',
    description: 'Collect the product name and price.',
    category: 'data',
    url_pattern: 'https://example.com/*',
    version,
    created_at: AT,
    updated_at: AT,
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector,
        fields: { title: '.title', price: '.price' },
        field_types: { title: 'text', price: 'text' },
        output_to: 'raw_items',
      },
      { type: 'render', view: 'table', input_from: 'raw_items' },
    ],
  }
}

async function savedTool(): Promise<ReturnType<typeof createMockAdapter>> {
  const adapter = createMockAdapter()
  const result = await handleBuildSaveTool({ kind: 'build:save_tool', tool: definition(1) }, adapter)
  expect(result.ok).toBe(true)
  return adapter
}

/** The verdict the health engine hands the panel when a container stops matching. */
function brokenVerdict(): HealthEvaluation {
  const summary: RunSummary = { at: AT, had_data: false, item_count: 0, field_digest: {} }
  const extractError: ExtractError = {
    code: 'CONTAINER_MISSING',
    message: 'The container matched nothing',
    selector: '.product',
  }

  return evaluateHealth({
    previous: {
      status: 'healthy',
      recent_runs: [summary],
      structure_fingerprint: null,
      last_semantic_check: null,
      consecutive_clean_runs: 0,
    },
    extractError,
    summary,
    fingerprint: null,
    now: Date.parse(AT),
  })
}

describe('the repair flow (§9.3)', () => {
  it('stores v2, keeps v1 and marks it ever_broken', async () => {
    const adapter = await savedTool()

    const result = await handleBuildSaveTool(
      {
        kind: 'build:save_tool',
        tool: definition(1, '.product-card'),
        repair: { toolId: TOOL_ID, trigger: 'broken', note: 'Repaired after the page changed' },
      },
      adapter,
    )

    expect(result).toMatchObject({ ok: true, version: 2 })

    const record = await loadTool(adapter, TOOL_ID)
    expect(record?.definition.version).toBe(2)
    // The page changed, so the selector changed with it — that is the repair.
    expect(record?.definition.steps[0]).toMatchObject({ selector: '.product-card' })
    expect(record?.versions.map((entry) => entry.version)).toEqual([1, 2])
    expect(record?.versions[0]?.ever_broken).toBe(true)
    expect(record?.versions[1]?.ever_broken).toBe(false)
    expect(record?.versions[1]?.note).toBe('Repaired after the page changed')
    // A new version has never run: no baseline, no cache (§8.1).
    expect(record?.health.status).toBe('healthy')
    expect(record?.health.recent_runs).toEqual([])
    expect(record?.run_state.last_extract_hash).toBeNull()
  })

  it('opens with the context message already written, because the tool was broken', async () => {
    const verdict = brokenVerdict()
    expect(verdict.status).toBe('broken')

    const session = fromHealth({ toolId: TOOL_ID, version: 1 }, verdict, {
      observed: 'This tool has started coming back empty',
      cause: 'the page may have changed',
      next: 'Want me to look at the current page structure?',
    })

    // The user is never dropped into an empty box after being told something is wrong.
    expect(session.presetPrompt).toContain('This tool has started coming back empty')
    // ...and the health engine's own reason is folded in, not paraphrased.
    expect(session.presetPrompt).toContain(verdict.reason)
  })

  it('rolls back to v1 and leaves the history exactly as it was', async () => {
    const adapter = await savedTool()
    await handleBuildSaveTool(
      {
        kind: 'build:save_tool',
        tool: definition(1, '.product-card'),
        repair: { toolId: TOOL_ID, trigger: 'broken', note: 'repaired' },
      },
      adapter,
    )

    const result = await handleToolRollback(
      { kind: 'tool:rollback', toolId: TOOL_ID, version: 1 },
      adapter,
    )
    expect(result).toMatchObject({ ok: true, version: 1 })

    const record = await loadTool(adapter, TOOL_ID)
    // The run now uses v1's definition — that is the whole point.
    expect(record?.definition.steps[0]).toMatchObject({ selector: '.product' })
    // History untouched, including the version that was in effect: a rollback is undoable.
    expect(record?.versions.map((entry) => entry.version)).toEqual([1, 2])
    expect(record?.versions[0]?.ever_broken).toBe(true)
  })

  it('marks nothing when the user edited a working tool', async () => {
    const adapter = await savedTool()

    await handleBuildSaveTool(
      {
        kind: 'build:save_tool',
        tool: definition(1, '.item'),
        repair: { toolId: TOOL_ID, trigger: 'user', note: 'Edited by you' },
      },
      adapter,
    )

    const record = await loadTool(adapter, TOOL_ID)
    expect(record?.versions.map((entry) => entry.ever_broken)).toEqual([false, false])
  })

  it('refuses to invent a tool, and refuses to rewrite an invalid one', async () => {
    const adapter = createMockAdapter()

    // Nothing to repair: the tool was deleted mid-flow.
    const missing = await handleBuildSaveTool(
      {
        kind: 'build:save_tool',
        tool: definition(1),
        repair: { toolId: 'tool_gone', trigger: 'broken', note: 'repaired' },
      },
      adapter,
    )
    expect(missing).toMatchObject({ ok: false, error: 'TOOL_NOT_FOUND' })
    expect(await loadTool(adapter, 'tool_gone')).toBeNull()

    // Version that was never in the history.
    await savedTool()
    const unknown = await handleToolRollback(
      { kind: 'tool:rollback', toolId: TOOL_ID, version: 7 },
      createMockAdapter(),
    )
    expect(unknown).toMatchObject({ ok: false, error: 'TOOL_NOT_FOUND' })
  })

  it('validates a repaired definition at the storage gate too (§5.4 double gate)', async () => {
    const adapter = await savedTool()

    // Valid JSON, meaningless tool: no extract step.
    const result = await handleBuildSaveTool(
      {
        kind: 'build:save_tool',
        tool: { ...definition(1), steps: [] },
        repair: { toolId: TOOL_ID, trigger: 'broken', note: 'repaired' },
      },
      adapter,
    )

    expect(result.ok).toBe(false)
    // The old version is untouched: a rejected repair is not a half-written one.
    const record = await loadTool(adapter, TOOL_ID)
    expect(record?.definition.version).toBe(1)
    expect(record?.versions).toHaveLength(1)
  })

  it('writes nothing for a tool that never broke, and health still governs the badge', async () => {
    const adapter = await savedTool()
    const verdict = brokenVerdict()

    await recordHealthResult(
      adapter,
      TOOL_ID,
      {
        status: verdict.status,
        recent_runs: [],
        structure_fingerprint: verdict.fingerprint,
        last_semantic_check: null,
        consecutive_clean_runs: verdict.consecutiveCleanRuns,
      },
      AT,
    )

    const record = await loadTool(adapter, TOOL_ID)
    expect(record?.health.status).toBe('broken')
    // Health never repairs anything: it only says so. The write still has to come from a
    // confirmed proposal behind a user.
    expect(record?.definition.version).toBe(1)
  })
})

describe('the stop-loss (§9.3)', () => {
  it('spends two model calls on a repair that cannot be built, then advises', async () => {
    let calls = 0
    const scorer: CandidateScorer = { score: () => [], fingerprint: () => 'x' }

    const ports: BuildSessionPorts = {
      analyze: (): PageAnalysis => ({
        url: 'https://example.com/products',
        title: 'Products',
        visibleText: 'a product',
        containers: [],
        customElements: [],
        shadowHosts: [],
        scrollHint: 'none',
        truncated: false,
        analyzedAt: AT,
      }),
      // A model that cannot be reached on either try.
      propose: async (): Promise<ProposeReply> => {
        calls += 1
        return { kind: 'failed', error: 'NETWORK' }
      },
      scorer,
      captureScreenshot: async () => '',
      save: async () => ({ ok: false, error: 'NOT_REACHED' }),
      now: () => AT,
    }

    const session = createBuildSession(ports)
    await session.describe('Fix this tool')

    // One conservative retry and no more: the allowance a repair is allowed to spend.
    expect(calls).toBe(2)
    expect(session.state().phase).toBe('failed')
    // Concrete advice, not the word "failed".
    expect(session.state().advice.length).toBeGreaterThan(0)

    // And that is the repair's whole allowance: the second failed turn stops it.
    let repair = fromHealth({ toolId: TOOL_ID, version: 1 }, { reason: 'x' }, {
      observed: 'o',
      cause: 'c',
      next: 'n',
    })
    repair = recordFailure(repair)
    expect(shouldStop(repair)).toBe(false)
    repair = recordFailure(repair)
    expect(shouldStop(repair)).toBe(true)
  })
})

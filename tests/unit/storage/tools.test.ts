import { describe, expect, it } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import type { ToolRecord } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import {
  DEFAULT_TOOL_USAGE,
  deleteTool,
  loadTool,
  loadTools,
  recordExportResult,
  recordRunResult,
  saveTool,
  TOOLS_KEY,
} from '@juxbly/storage'

/**
 * `juxbly:tools` — `docs/ARCHITECTURE.md` §8.1.
 *
 * The acceptance criterion that matters most here is the read side: whatever is already
 * in storage, `loadTools()` returns records that later stages can consume without writing
 * a fallback of their own. The writers of `usage` arrive in 1-10 and 1-15, so the defaults
 * have to exist before they do.
 */
const DEFINITION: ToolDefinition = {
  tool_id: 'tool_1',
  name: 'Price extractor',
  category: 'data',
  url_pattern: 'example.com/*',
  version: 1,
  steps: [{ type: 'extract', mode: 'single', fields: { title: 'h1' }, output_to: 'raw' }],
  created_at: '2026-09-06T00:00:00.000Z',
  updated_at: '2026-09-06T00:00:00.000Z',
}

function record(overrides: Partial<ToolRecord> = {}): ToolRecord {
  return {
    tool_id: 'tool_1',
    definition: DEFINITION,
    versions: [],
    health: {
      status: 'healthy',
      recent_runs: [],
      structure_fingerprint: null,
      last_semantic_check: null,
      consecutive_clean_runs: 0,
    },
    run_state: { last_extract_hash: null, last_llm_outputs: {} },
    usage: { ...DEFAULT_TOOL_USAGE },
    created_at: '2026-09-06T00:00:00.000Z',
    updated_at: '2026-09-06T00:00:00.000Z',
    ...overrides,
  }
}

describe('loadTools', () => {
  it('returns an empty map when nothing has been saved yet', async () => {
    await expect(loadTools(createMockAdapter())).resolves.toEqual({})
  })

  it('fills in usage defaults for a record written before usage existed', async () => {
    // `usage` is written by 1-10 / 1-15; a record from before they landed has no such
    // field, and `undefined` reaching a stats panel is a crash in 1-13, not a display bug.
    const legacy = { ...record(), usage: undefined } as unknown as ToolRecord
    const adapter = createMockAdapter({ storage: { [TOOLS_KEY]: { tool_1: legacy } } })

    const tools = await loadTools(adapter)

    expect(tools['tool_1']?.usage).toEqual({
      last_run_at: null,
      run_count: 0,
      last_export_at: null,
      export_count: 0,
    })
  })

  it('keeps real usage numbers when they are present', async () => {
    const adapter = createMockAdapter({
      storage: {
        [TOOLS_KEY]: {
          tool_1: record({
            usage: { last_run_at: '2026-09-06T10:00:00.000Z', run_count: 3, last_export_at: null, export_count: 0 },
          }),
        },
      },
    })

    const tools = await loadTools(adapter)

    expect(tools['tool_1']?.usage.run_count).toBe(3)
    expect(tools['tool_1']?.usage.last_run_at).toBe('2026-09-06T10:00:00.000Z')
  })

  it('returns null for an unknown tool', async () => {
    await expect(loadTool(createMockAdapter(), 'tool_404')).resolves.toBeNull()
  })
})

describe('saveTool', () => {
  it('round-trips a tool through storage', async () => {
    const adapter = createMockAdapter()

    await saveTool(adapter, record())

    await expect(loadTool(adapter, 'tool_1')).resolves.toMatchObject({ tool_id: 'tool_1' })
  })

  it('appends the current definition as a version without touching history', async () => {
    const adapter = createMockAdapter()
    await saveTool(adapter, record())

    const second = record({
      definition: { ...DEFINITION, version: 2, updated_at: '2026-09-07T00:00:00.000Z' },
      updated_at: '2026-09-07T00:00:00.000Z',
    })
    await saveTool(adapter, second, 'repaired')

    const stored = await loadTool(adapter, 'tool_1')
    // §8.1: old versions are never deleted — rollback (1-12) depends on that.
    expect(stored?.versions.map((version) => version.version)).toEqual([1, 2])
    expect(stored?.versions[1]?.note).toBe('repaired')
  })

  it('does not duplicate a version that is already recorded', async () => {
    const adapter = createMockAdapter()
    await saveTool(adapter, record())
    await saveTool(adapter, record())

    const stored = await loadTool(adapter, 'tool_1')
    expect(stored?.versions).toHaveLength(1)
  })
})

describe('recordRunResult (stage 1-10, §8.1)', () => {
  it('counts the run and moves the timestamp — and nothing else', async () => {
    const adapter = createMockAdapter({ storage: { [TOOLS_KEY]: { tool_1: record() } } })

    await recordRunResult(adapter, 'tool_1', { at: '2026-09-07T12:00:00.000Z' })

    const stored = await loadTool(adapter, 'tool_1')
    expect(stored?.usage.run_count).toBe(1)
    expect(stored?.usage.last_run_at).toBe('2026-09-07T12:00:00.000Z')
    // A run is not an export: those two fields are 1-15's, and inflating them here would
    // make "recently used" lie in the management surface (1-13).
    expect(stored?.usage.export_count).toBe(0)
    expect(stored?.usage.last_export_at).toBeNull()
    expect(stored?.updated_at).toBe('2026-09-07T12:00:00.000Z')
  })

  it('keeps counting across runs', async () => {
    const adapter = createMockAdapter({ storage: { [TOOLS_KEY]: { tool_1: record() } } })

    await recordRunResult(adapter, 'tool_1', { at: '2026-09-07T12:00:00.000Z' })
    await recordRunResult(adapter, 'tool_1', { at: '2026-09-07T13:00:00.000Z' })

    const stored = await loadTool(adapter, 'tool_1')
    expect(stored?.usage.run_count).toBe(2)
    expect(stored?.usage.last_run_at).toBe('2026-09-07T13:00:00.000Z')
  })

  it('stores the run state the engine handed back, and keeps the old one when handed none', async () => {
    const adapter = createMockAdapter({ storage: { [TOOLS_KEY]: { tool_1: record() } } })

    await recordRunResult(adapter, 'tool_1', {
      at: '2026-09-07T12:00:00.000Z',
      runState: { last_extract_hash: 'abc123', last_llm_outputs: { summary: 'text' } },
    })
    expect((await loadTool(adapter, 'tool_1'))?.run_state).toEqual({
      last_extract_hash: 'abc123',
      last_llm_outputs: { summary: 'text' },
    })

    // A cancelled run reports nothing (§9.2); the previous cache must survive it.
    await recordRunResult(adapter, 'tool_1', { at: '2026-09-07T13:00:00.000Z' })
    expect((await loadTool(adapter, 'tool_1'))?.run_state.last_extract_hash).toBe('abc123')
  })

  it('writes nothing for a tool that is no longer there', async () => {
    const adapter = createMockAdapter()

    await expect(recordRunResult(adapter, 'tool_404', { at: '2026-09-07T12:00:00.000Z' })).resolves.toBe(false)
    expect(adapter.calls.filter((call) => call.method === 'storage.set')).toHaveLength(0)
  })
})

describe('recordExportResult (stage 1-15, §8.1)', () => {
  it('counts the export and moves last_export_at — and nothing else', async () => {
    const adapter = createMockAdapter({
      storage: {
        [TOOLS_KEY]: {
          tool_1: record({
            usage: { ...DEFAULT_TOOL_USAGE, run_count: 3, last_run_at: '2026-09-06T10:00:00.000Z' },
          }),
        },
      },
    })

    await recordExportResult(adapter, 'tool_1', '2026-09-07T12:00:00.000Z')

    const stored = await loadTool(adapter, 'tool_1')
    expect(stored?.usage.export_count).toBe(1)
    expect(stored?.usage.last_export_at).toBe('2026-09-07T12:00:00.000Z')
    // An export is not a run: run fields stay where the run writer left them (§8.1).
    expect(stored?.usage.run_count).toBe(3)
    expect(stored?.usage.last_run_at).toBe('2026-09-06T10:00:00.000Z')
  })

  it('keeps counting across exports', async () => {
    const adapter = createMockAdapter({ storage: { [TOOLS_KEY]: { tool_1: record() } } })

    await recordExportResult(adapter, 'tool_1', '2026-09-07T12:00:00.000Z')
    await recordExportResult(adapter, 'tool_1', '2026-09-07T13:00:00.000Z')

    const stored = await loadTool(adapter, 'tool_1')
    expect(stored?.usage.export_count).toBe(2)
    expect(stored?.usage.last_export_at).toBe('2026-09-07T13:00:00.000Z')
  })

  it('writes nothing when the tool is gone (a refused export must not count)', async () => {
    const adapter = createMockAdapter()

    await expect(recordExportResult(adapter, 'tool_404', '2026-09-07T12:00:00.000Z')).resolves.toBe(false)
    expect(adapter.calls.filter((call) => call.method === 'storage.set')).toHaveLength(0)
  })
})

describe('deleteTool (C1: removal is the only exit, no archive tier)', () => {
  it('removes the whole record', async () => {
    const adapter = createMockAdapter({ storage: { [TOOLS_KEY]: { tool_1: record() } } })

    await expect(deleteTool(adapter, 'tool_1')).resolves.toBe(true)
    await expect(loadTools(adapter)).resolves.toEqual({})
  })

  it('reports false instead of inventing a deletion', async () => {
    const adapter = createMockAdapter()

    await expect(deleteTool(adapter, 'tool_404')).resolves.toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import type { ToolRecord } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import {
  DEFAULT_TOOL_USAGE,
  deleteTool,
  listToolOverviews,
  loadTool,
  loadTools,
  mostRecentUse,
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
  it('removes the whole record — versions included, because nothing is archived', async () => {
    const adapter = createMockAdapter({
      storage: {
        [TOOLS_KEY]: {
          tool_1: record({
            versions: [{ version: 1, definition: DEFINITION, note: 'first', ever_broken: true, created_at: '2026-09-06T00:00:00.000Z' }],
          }),
        },
      },
    })

    await expect(deleteTool(adapter, 'tool_1')).resolves.toBe(true)
    await expect(loadTools(adapter)).resolves.toEqual({})
  })

  it('reports false instead of inventing a deletion', async () => {
    const adapter = createMockAdapter()

    await expect(deleteTool(adapter, 'tool_404')).resolves.toBe(false)
  })
})

/**
 * C1 landed for good in 1-13: `ToolUsage` carries no tier state at all. The four fields
 * are the whole contract (§8.1), and an `archived` flag would be a second, hidden exit
 * from the list — the thing the decision removed.
 */
/**
 * The overview's rows (stage 1-13, `UI_SPEC` §7.2 / §8.1).
 *
 * Two things here are decisions rather than plumbing: the row identifies a **host** and
 * never a URL, and "used" means run *or* export, whichever happened later. The second one
 * is the reason this file exists — a tool the user only ever exports would otherwise sink
 * below tools they care about less, because a run is not the only way to use a tool.
 */
describe('listToolOverviews (stage 1-13, §7.2)', () => {
  it('identifies the site by host, never by URL', async () => {
    const adapter = createMockAdapter({
      storage: {
        [TOOLS_KEY]: {
          tool_1: record({
            definition: { ...DEFINITION, url_pattern: 'https://shop.example.com/search?q=*' },
          }),
        },
      },
    })

    const rows = await listToolOverviews(adapter)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.domain).toBe('shop.example.com')
    // Parsed and compared by host, not `startsWith`: a prefix check would also accept
    // `https://shop.example.com.evil.test`, which is the substring-sanitisation mistake
    // CodeQL's `js/incomplete-url-substring-sanitization` names.
    expect(new URL(rows[0]?.url ?? '').hostname).toBe('shop.example.com')
  })

  it('counts an export as use — the more recent of the two wins, either way round', () => {
    // Only ever exported: still a used tool, and not one to be demoted.
    expect(
      mostRecentUse({ last_run_at: null, last_export_at: '2026-09-08T10:00:00.000Z', run_count: 0, export_count: 3 }),
    ).toBe('2026-09-08T10:00:00.000Z')

    // Exported after a run.
    expect(
      mostRecentUse({
        last_run_at: '2026-09-07T10:00:00.000Z',
        last_export_at: '2026-09-09T10:00:00.000Z',
        run_count: 1,
        export_count: 1,
      }),
    ).toBe('2026-09-09T10:00:00.000Z')

    // Run after an export: the same rule, the other direction.
    expect(
      mostRecentUse({
        last_run_at: '2026-09-09T10:00:00.000Z',
        last_export_at: '2026-09-07T10:00:00.000Z',
        run_count: 1,
        export_count: 1,
      }),
    ).toBe('2026-09-09T10:00:00.000Z')

    // Never used is not a timestamp.
    expect(mostRecentUse({ ...DEFAULT_TOOL_USAGE })).toBeNull()
  })

  it('drops a row it cannot open, rather than offering an action that fails', async () => {
    const adapter = createMockAdapter({
      storage: {
        [TOOLS_KEY]: {
          tool_1: record({ definition: { ...DEFINITION, url_pattern: 'https://shop.example.com/*' } }),
          tool_2: record({
            tool_id: 'tool_2',
            definition: { ...DEFINITION, tool_id: 'tool_2', url_pattern: 'not a pattern at all' },
          }),
        },
      },
    })

    const rows = await listToolOverviews(adapter)
    expect(rows.map((row) => row.toolId)).toEqual(['tool_1'])
  })
})

describe('ToolUsage has no tier fields (C1, AC 10)', () => {
  it('is exactly four scalars, and none of them is a state', () => {
    expect(Object.keys(DEFAULT_TOOL_USAGE).sort()).toEqual([
      'export_count',
      'last_export_at',
      'last_run_at',
      'run_count',
    ])
    expect(Object.keys(DEFAULT_TOOL_USAGE)).not.toContain('archived')
  })
})

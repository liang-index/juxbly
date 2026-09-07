import { describe, expect, it } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import type { ToolRecord } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { DEFAULT_TOOL_USAGE, loadTool, loadTools, saveTool, TOOLS_KEY } from '@juxbly/storage'

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

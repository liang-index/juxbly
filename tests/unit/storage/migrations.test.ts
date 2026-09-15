import { describe, expect, it } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import type { BrowserAdapter } from '@juxbly/browser'
import { migrations, runMigrations } from '@juxbly/storage'
import type { Migration } from '@juxbly/storage'

/**
 * Migration skeleton — `docs/ARCHITECTURE.md` §8.1.
 *
 * V1 has no history to migrate, so the chain is empty. What is worth testing now is the
 * part that is impossible to retrofit: **order**. A migration that reshapes data running
 * after the one that reads it is silently wrong, and "silent" is the expensive kind.
 */
function builder(order: number[]): (version: number) => Migration {
  return (version: number) => ({
    version,
    description: `test migration ${String(version)}`,
    apply: async (adapter: BrowserAdapter) => {
      order.push(version)
      await adapter.storage.set(`migration:${String(version)}`, true)
    },
  })
}

/** A pre-1-11 record: health exists but carries none of the four-layer fields. */
const oldRecord = {
  tool_id: 'tool_1',
  health: { status: 'healthy', recent_runs: [] },
}

describe('runMigrations', () => {
  it('the real chain is the V1 health schema, and only that', () => {
    expect(migrations).toHaveLength(1)
    expect(migrations[0]?.version).toBe(1)
    expect(migrations[0]?.description).toContain('ToolHealth')
  })

  it('the V1 migration fills the health fields on old records — and deletes nothing', async () => {
    const adapter = createMockAdapter({ storage: { 'juxbly:tools': { tool_1: oldRecord } } })

    await expect(runMigrations(adapter)).resolves.toBe(1)

    const stored = await adapter.storage.get<{ tool_1: { health: Record<string, unknown> } }>(
      'juxbly:tools',
    )
    expect(stored?.tool_1?.health).toMatchObject({
      status: 'healthy',
      recent_runs: [],
      structure_fingerprint: null,
      last_semantic_check: null,
      consecutive_clean_runs: 0,
    })
    // The tool itself survived: a migration never removes a record (§8.1).
    expect(Object.keys((await adapter.storage.get('juxbly:tools')) ?? {})).toEqual(['tool_1'])
  })

  it('the V1 migration is idempotent — a completed record is left untouched', async () => {
    const adapter = createMockAdapter({ storage: { 'juxbly:tools': { tool_1: oldRecord } } })

    await runMigrations(adapter)
    const setsAfterFirst = adapter.calls.filter((call) => call.method === 'storage.set').length
    expect(setsAfterFirst).toBe(1)

    await runMigrations(adapter)
    expect(adapter.calls.filter((call) => call.method === 'storage.set').length).toBe(setsAfterFirst)
  })

  it('runs migrations in version order even when the list is not', async () => {
    const order: number[] = []
    const adapter = createMockAdapter()
    const build = builder(order)

    // Appended in the wrong order — exactly how a hand-written list goes wrong.
    const result = await runMigrations(adapter, { migrations: [build(3), build(1), build(2)] })

    expect(order).toEqual([1, 2, 3])
    expect(result).toBe(3)
  })

  it('skips migrations at or below the stored version', async () => {
    const order: number[] = []
    const adapter = createMockAdapter()
    const build = builder(order)

    const result = await runMigrations(adapter, {
      migrations: [build(1), build(2), build(3)],
      fromVersion: 2,
    })

    expect(order).toEqual([3])
    expect(result).toBe(3)
  })
})

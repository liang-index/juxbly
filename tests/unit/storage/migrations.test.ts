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

describe('runMigrations', () => {
  it('has an empty chain today', () => {
    expect(migrations).toEqual([])
  })

  it('does nothing at all when the chain is empty', async () => {
    const adapter = createMockAdapter({ storage: { 'juxbly:tools': { tool_1: {} } } })

    await expect(runMigrations(adapter)).resolves.toBe(0)
    expect(adapter.calls.filter((call) => call.method === 'storage.set')).toEqual([])
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

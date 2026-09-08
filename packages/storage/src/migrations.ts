/**
 * Data migration skeleton — `docs/ARCHITECTURE.md` §8.1.
 *
 * There is nothing to migrate yet: V1 has no released schema. The chain is built now
 * because the alternative is discovering, at the first real schema change, that there is
 * nowhere to put a migration and no way to prove it ran in order.
 *
 * One rule is worth stating out loud because the shortcut is tempting: **a migration
 * never deletes a storage key to "solve" a shape change.** Tools are the user's work;
 * dropping them to satisfy a schema is data loss wearing a engineering hat.
 */
import type { BrowserAdapter } from '@juxbly/browser'
import type { ToolRecord } from '@juxbly/core'
import { TOOLS_KEY } from './keys'
import { emptyHealth } from './tools'

export interface Migration {
  /** Schema version this migration produces. Migrations run in ascending order. */
  version: number
  /** What it does, in one line — the storage audit reads this, not the code. */
  description: string
  apply(adapter: BrowserAdapter): Promise<void>
}

/**
 * V1 schema: `ToolHealth` grows the four-layer health fields (stage 1-11).
 *
 * Written as a migration even though `loadTools()` also fills defaults on read, because
 * the read-side fallback is a convenience for *consumers* — the storage audit and any
 * raw reader must be able to see the schema is current without trusting every writer to
 * remember. Idempotent by construction: a record that already has the fields is written
 * back byte-identical, so re-running the migration is a no-op, never a reset. And per
 * the rule at the top of this file: nothing is deleted — old records are completed, not
 * replaced.
 */
export const migrations: readonly Migration[] = [
  {
    version: 1,
    description: 'ToolHealth gains structure_fingerprint / last_semantic_check / consecutive_clean_runs',
    async apply(adapter) {
      const stored = await adapter.storage.get<Record<string, ToolRecord>>(TOOLS_KEY)
      if (stored === null) return

      let changed = false
      const tools: Record<string, ToolRecord> = {}
      for (const [toolId, record] of Object.entries(stored)) {
        const missing =
          record.health === undefined ||
          record.health.structure_fingerprint === undefined ||
          record.health.last_semantic_check === undefined ||
          record.health.consecutive_clean_runs === undefined

        if (missing) {
          tools[toolId] = { ...record, health: { ...emptyHealth(), ...record.health } }
          changed = true
        } else {
          tools[toolId] = record
        }
      }

      if (changed) await adapter.storage.set(TOOLS_KEY, tools)
    },
  },
]

export interface RunMigrationsOptions {
  /** Overridable so the ordering guarantee is testable without touching the real chain. */
  migrations?: readonly Migration[]
  /** Schema version currently stored; migrations at or below it are already applied. */
  fromVersion?: number
}

/**
 * Applies every migration above `fromVersion`, in ascending version order, and returns
 * the resulting schema version.
 *
 * The input is sorted rather than trusted: a hand-written list goes out of order the
 * second someone appends to the wrong end, and a migration that reorders data running
 * before the one that reshapes it is silently wrong.
 */
export async function runMigrations(
  adapter: BrowserAdapter,
  options: RunMigrationsOptions = {},
): Promise<number> {
  const fromVersion = options.fromVersion ?? 0
  const pending = [...(options.migrations ?? migrations)]
    .filter((migration) => migration.version > fromVersion)
    .sort((left, right) => left.version - right.version)

  let current = fromVersion
  for (const migration of pending) {
    await migration.apply(adapter)
    current = migration.version
  }
  return current
}

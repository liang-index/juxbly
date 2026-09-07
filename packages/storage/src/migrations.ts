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

export interface Migration {
  /** Schema version this migration produces. Migrations run in ascending order. */
  version: number
  /** What it does, in one line — the storage audit reads this, not the code. */
  description: string
  apply(adapter: BrowserAdapter): Promise<void>
}

/** Empty by design (see above). The first real schema change appends here. */
export const migrations: readonly Migration[] = []

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

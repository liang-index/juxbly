/**
 * Rollback — `docs/ARCHITECTURE.md` §8.1, `task/stage-1-12.md` Scope 4 (C3: no version
 * switcher UI in V1, the entry is a plain list in the settings panel).
 *
 * A rollback changes **which definition is in effect** and nothing else. The history array
 * is untouched — including the version that is currently in effect — which is what makes
 * "roll back to v2" a reversible act rather than a destructive one.
 *
 * Like `commitRepair`, this is pure: the write belongs to the background (§7.1).
 */
import type { ToolRecord } from '@juxbly/core'
import type { FreshVersionState } from './create-version'

export interface RollbackInput {
  record: ToolRecord
  /** The version to make current again. */
  version: number
  at: string
  fresh: FreshVersionState
}

/**
 * `null` when the version does not exist — an answer the caller has to handle rather than
 * a silently unchanged record that would read as success.
 *
 * The fresh state is applied for the same reason a repaired version gets one: the version
 * being restored has not run under the current page, so any baseline or cache the *other*
 * version left behind describes a definition that is no longer in effect.
 */
export function rollbackTo(input: RollbackInput): ToolRecord | null {
  const target = input.record.versions.find((version) => version.version === input.version)
  if (target === undefined) return null

  return {
    ...input.record,
    definition: { ...target.definition, version: target.version },
    health: input.fresh.health,
    run_state: input.fresh.runState,
    updated_at: input.at,
  }
}

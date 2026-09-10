/**
 * Version creation — `docs/ARCHITECTURE.md` §8.1 / §9.3, `task/stage-1-12.md` Scope 3.
 *
 * One rule drives this file: **a repair always produces a new version and never edits the
 * one before it.** Old versions stay in `versions[]` forever, so a repair can be undone by
 * rolling back (§8.1) and "what did this tool look like last month" stays answerable.
 *
 * Two things are *not* done here, on purpose:
 *
 * - **No silent repair.** Nothing in this module can be reached without a confirmed
 *   proposal behind it; the caller (the background, on `build:save_tool`) only ever sees
 *   one after the user confirmed a highlighted plan (§9.1). If you are adding a caller,
 *   do not add one that skips the confirmation — that is the product invariant, not a
 *   preference.
 * - **No storage.** The transformation is pure; the write belongs to the background, which
 *   is the only context that owns storage (§7.1). That is also what makes the whole repair
 *   path drivable from a node test.
 */
import type { RepairSession, RunState, ToolHealth, ToolRecord, ToolVersion } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'

/**
 * What a freshly written version starts from, supplied by the caller.
 *
 * A new version has never run: it has no rolling window, no structure baseline, and no
 * llm cache. Carrying the old version's state over would let a *different* definition be
 * judged against a baseline it never produced — and would let the cache answer for
 * selectors that are no longer there ("unchanged hash, skip the model" on a definition
 * that just changed is a lie).
 */
export interface FreshVersionState {
  health: ToolHealth
  runState: RunState
}

/**
 * What the repair needs to know about where it came from.
 *
 * Deliberately *not* a whole `RepairSession`: the session lives in the panel, and only
 * these two fields travel to the background (as `RepairSaveRequest`, §7.2). Asking the
 * write path for a full session would force it to invent a preset prompt and an attempt
 * count it has no business knowing.
 */
export type RepairOrigin = Pick<RepairSession, 'trigger' | 'baseVersion'>

export interface CommitRepairInput {
  /** The stored record — the only place the full history lives. */
  record: ToolRecord
  /** Which version this replaces, and whether a breakage is what triggered it. */
  origin: RepairOrigin
  /** The confirmed definition, already validated by the caller (§5.4 double gate). */
  definition: ToolDefinition
  /** Why this version exists. Shown in the rollback list; never empty in practice. */
  note: string
  at: string
  fresh: FreshVersionState
}

export function nextVersionOf(record: ToolRecord): number {
  return record.definition.version + 1
}

/**
 * The record a successful repair writes.
 *
 * `tool_id` is taken from the record, not from the incoming definition: a repair is the
 * same tool with a new version, and letting a model rename the tool would orphan the
 * history (and the tool's identity on the page).
 */
export function commitRepair(input: CommitRepairInput): ToolRecord {
  const version = nextVersionOf(input.record)
  const definition: ToolDefinition = {
    ...input.definition,
    tool_id: input.record.tool_id,
    version,
  }

  return {
    ...input.record,
    definition,
    versions: [
      ...markReplaced(input.record.versions, input.origin),
      {
        version,
        definition,
        // "" would make the rollback list show a blank row; the caller owns the wording.
        note: input.note,
        ever_broken: false,
        created_at: input.at,
      },
    ],
    health: input.fresh.health,
    run_state: input.fresh.runState,
    updated_at: input.at,
  }
}

/**
 * The version a repair replaced is marked `ever_broken` — a **factual record**, not a
 * state (§8.1): it says "this version failed once", never "this version is failing". V1
 * draws no badge for it; the field is kept because history cannot be reconstructed later.
 *
 * Two properties a refactor must not lose:
 *
 * - it is **monotonic** — `false` never comes back once the fact is recorded;
 * - only the version the repair started from is marked. Other versions keep their own
 *   record, and a user-triggered edit (`trigger: 'user'`) marks nothing at all: editing a
 *   working tool is not evidence that it broke.
 */
function markReplaced(versions: readonly ToolVersion[], origin: RepairOrigin): ToolVersion[] {
  if (origin.trigger !== 'broken') return [...versions]

  return versions.map((version) =>
    version.version === origin.baseVersion ? { ...version, ever_broken: true } : version,
  )
}

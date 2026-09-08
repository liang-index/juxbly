/**
 * `juxbly:tools` — `docs/ARCHITECTURE.md` §8.1.
 *
 * Stage 1-3 owns the **read side** contract: whatever is in storage, `loadTools()`
 * returns records that are complete enough for later stages to consume without a
 * fallback of their own. The writers arrive later — `run_count` / `last_run_at` in 1-10,
 * `export_count` / `last_export_at` in 1-15 — so defaults have to exist before they do.
 *
 * Nothing here validates a DSL: that is `validateToolDefinition`, run before save and
 * before every run (§5.4).
 */
import type { BrowserAdapter } from '@juxbly/browser'
import type { RunState, ToolHealth, ToolRecord, ToolUsage, ToolVersion } from '@juxbly/core'
import { TOOLS_KEY } from './keys'

/**
 * §8.1: every field has a default, so a record written before the writers existed still
 * reads back complete. `archived` is gone with the tiered decay (C1).
 */
export const DEFAULT_TOOL_USAGE: ToolUsage = {
  last_run_at: null,
  run_count: 0,
  last_export_at: null,
  export_count: 0,
}

export function emptyRunState(): RunState {
  return { last_extract_hash: null, last_llm_outputs: {} }
}

/**
 * A new record starts `healthy`: §10 has the repair path start the new version from
 * healthy, and there is no run history yet that could justify anything else.
 */
export function emptyHealth(): ToolHealth {
  return {
    status: 'healthy',
    recent_runs: [],
    structure_fingerprint: null,
    last_semantic_check: null,
    consecutive_clean_runs: 0,
  }
}

export async function loadTools(adapter: BrowserAdapter): Promise<Record<string, ToolRecord>> {
  const stored = await adapter.storage.get<Record<string, ToolRecord>>(TOOLS_KEY)
  if (stored === null) return {}

  const tools: Record<string, ToolRecord> = {}
  for (const [toolId, record] of Object.entries(stored)) {
    tools[toolId] = withDefaults(record)
  }
  return tools
}

export async function loadTool(
  adapter: BrowserAdapter,
  toolId: string,
): Promise<ToolRecord | null> {
  const tools = await loadTools(adapter)
  return tools[toolId] ?? null
}

/**
 * Writes one tool and **appends** to `versions` — old versions are never deleted (§8.1),
 * and the version *semantics* (when a new version is justified, what the note says)
 * belong to 1-12. This stage guarantees only that the array exists and grows.
 */
export async function saveTool(
  adapter: BrowserAdapter,
  record: ToolRecord,
  note = 'created',
): Promise<void> {
  const tools = await loadTools(adapter)
  const existing = tools[record.tool_id]

  const versions = appendVersion(
    mergeVersions(existing?.versions ?? [], record.versions ?? []),
    record,
    note,
  )

  tools[record.tool_id] = { ...withDefaults(record), versions }
  await adapter.storage.set(TOOLS_KEY, tools)
}

/**
 * What a finished run leaves in the record (stage 1-10, §8.1): `run_count` and
 * `last_run_at`, and nothing else. `export_count` / `last_export_at` belong to 1-15 —
 * a run is not an export, and conflating the two would make "recently used" lie.
 *
 * `runState` is accepted because the run engine is deliberately side-effect free: it
 * hands the new cache back instead of storing it, so the caller (which is the only side
 * that knows whether the run was cancelled) decides what gets written.
 */
export interface RunResultInput {
  /** ISO 8601; becomes both `last_run_at` and `updated_at`. */
  at: string
  runState?: RunState
}

/** Returns false when there is no record for this tool — a run of a deleted tool is not a write. */
export async function recordRunResult(
  adapter: BrowserAdapter,
  toolId: string,
  input: RunResultInput,
): Promise<boolean> {
  const tools = await loadTools(adapter)
  const record = tools[toolId]
  if (record === undefined) return false

  const usage: ToolUsage = {
    ...DEFAULT_TOOL_USAGE,
    ...record.usage,
    run_count: record.usage.run_count + 1,
    last_run_at: input.at,
  }

  tools[toolId] = {
    ...record,
    usage,
    run_state: input.runState ?? record.run_state,
    updated_at: input.at,
  }
  await adapter.storage.set(TOOLS_KEY, tools)
  return true
}

/** Returns false when there is no record for this tool — an export of a deleted tool is not a write. */
export async function recordExportResult(
  adapter: BrowserAdapter,
  toolId: string,
  at: string,
): Promise<boolean> {
  const tools = await loadTools(adapter)
  const record = tools[toolId]
  if (record === undefined) return false

  // Only the export fields move; `run_count` / `last_run_at` are 1-10's to write and a
  // *run* must not be conflated with an *export* (§8.1).
  const usage: ToolUsage = {
    ...DEFAULT_TOOL_USAGE,
    ...record.usage,
    export_count: record.usage.export_count + 1,
    last_export_at: at,
  }

  tools[toolId] = { ...record, usage, updated_at: at }
  await adapter.storage.set(TOOLS_KEY, tools)
  return true
}

/**
 * Stores what a run's health evaluation produced (stage 1-11, §8.1): the new `ToolHealth`
 * — status, the appended `recent_runs` window, the fingerprint baseline, the semantic
 * check when one ran, the recovery counter — wholesale. The *judgement* belongs to
 * `evaluateHealth` (pure, in `@juxbly/health`); this function is deliberately dumb, so
 * a bug here can corrupt one record but never invent a verdict.
 */
export async function recordHealthResult(
  adapter: BrowserAdapter,
  toolId: string,
  health: ToolHealth,
  at: string,
): Promise<boolean> {
  const tools = await loadTools(adapter)
  const record = tools[toolId]
  if (record === undefined) return false

  tools[toolId] = { ...record, health, updated_at: at }
  await adapter.storage.set(TOOLS_KEY, tools)
  return true
}

/**
 * Deleting a tool is a **complete removal** of the `ToolRecord` (C1: V1 has no archive
 * tier). First caller is the run panel's "Don't keep"; 1-13 reuses it from the
 * management surface.
 */
export async function deleteTool(adapter: BrowserAdapter, toolId: string): Promise<boolean> {
  const tools = await loadTools(adapter)
  if (!(toolId in tools)) return false

  const remaining = { ...tools }
  delete remaining[toolId]
  await adapter.storage.set(TOOLS_KEY, remaining)
  return true
}

/**
 * Fill in everything a record is allowed to be missing.
 *
 * Only `usage` is guaranteed by an acceptance criterion (reading an old record must
 * never yield `undefined`); `health` and `run_state` are filled for the same reason —
 * every later stage would otherwise have to repeat the fallback.
 */
export function withDefaults(record: ToolRecord): ToolRecord {
  return {
    ...record,
    versions: record.versions ?? [],
    health: record.health ?? emptyHealth(),
    run_state: record.run_state ?? emptyRunState(),
    usage: { ...DEFAULT_TOOL_USAGE, ...record.usage },
  }
}

/** Union by version number: existing entries win, so history cannot be rewritten. */
function mergeVersions(existing: readonly ToolVersion[], incoming: readonly ToolVersion[]): ToolVersion[] {
  const merged = [...existing]
  for (const version of incoming) {
    if (merged.some((candidate) => candidate.version === version.version)) continue
    merged.push(version)
  }
  return merged.sort((left, right) => left.version - right.version)
}

function appendVersion(
  versions: readonly ToolVersion[],
  record: ToolRecord,
  note: string,
): ToolVersion[] {
  if (versions.some((version) => version.version === record.definition.version)) return [...versions]

  return [
    ...versions,
    {
      version: record.definition.version,
      definition: record.definition,
      note,
      // A factual record, not UI state (§8.1): V1 ships no version-switching UI, but the
      // fact is free to keep and impossible to reconstruct later.
      ever_broken: false,
      created_at: record.updated_at,
    },
  ]
}

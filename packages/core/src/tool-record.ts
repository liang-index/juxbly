/**
 * Storage contract — `docs/ARCHITECTURE.md` §8.1 (the extension's local storage).
 *
 * Field names stay snake_case verbatim: these shapes round-trip through storage and
 * LLM output without a mapping layer (`docs/ARCHITECTURE.md` §5 preface).
 *
 * Types only. DSL types are referenced through `import type`, which erases at compile
 * time, so `packages/core` keeps zero *runtime* dependencies (module map, §4) even
 * though `ToolRecord` mentions `ToolDefinition`.
 */
import type { ToolDefinition } from '@juxbly/dsl'
import type { TokenUsage } from './messages'

/** Stored under `juxbly:tools` as `Record<tool_id, ToolRecord>`. */
export interface ToolRecord {
  tool_id: string
  /** Currently effective version. */
  definition: ToolDefinition
  /** Full history including the current one; old versions are never deleted (§8.1). */
  versions: ToolVersion[]
  health: ToolHealth
  /** What the llm-cache decision reads, plus the A5 diff data slot (V1.1). */
  run_state: RunState
  /** Local usage statistics; no grading/decay in V1. */
  usage: ToolUsage
  created_at: string
  updated_at: string
}

export interface ToolVersion {
  version: number
  definition: ToolDefinition
  /** Why this version was created or repaired. */
  note: string
  /**
   * Whether this version ever failed — a *fact record*, not UI state. V1 ships no
   * version switcher UI; the field stays because it is a free historical fact that V2
   * would otherwise have to backfill.
   */
  ever_broken: boolean
  created_at: string
}

/**
 * What a *list* of versions is allowed to carry across a context boundary (stage 1-16).
 *
 * A rollback is `tool:rollback {toolId, version}` — the definition is chosen in the
 * background, by number, so a panel never needs an old definition. `ToolVersion` is
 * assignable to this, which is why the rollback list can take the narrower type without
 * a cast at any call site.
 */
export interface ToolVersionSummary {
  version: number
  note: string
  ever_broken: boolean
  created_at: string
}

export type HealthStatus = 'healthy' | 'degraded' | 'broken'

export interface ToolHealth {
  status: HealthStatus
  /** Rolling window of the last 10 runs (§8.2). */
  recent_runs: RunSummary[]
  /** Structure fingerprint baseline: captured on first successful run, then compared. */
  structure_fingerprint: StructureFingerprint | null
  /** Latest semantic-layer check result, when one ran. */
  last_semantic_check: SemanticCheck | null
  /**
   * Clean runs since the last deviation — the counter behind "two in a row to recover"
   * (§10). It has to be a number in storage and not a flag in memory: a run is a separate
   * process from the one before it, and a boolean would only remember that *a* clean run
   * happened, not how many in a row.
   */
  consecutive_clean_runs: number
}

/**
 * Lightweight structure fingerprint: comparable statistics only — no DOM snapshots, no
 * page content. The V1 decision uses exactly two signals, `container_count` and
 * `field_presence`; `tag_path` is recorded but deliberately not part of the V1 decision
 * (it needs per-site calibration V1 has no data for — false positives hurt more than
 * misses).
 */
export interface StructureFingerprint {
  captured_at: string
  /** Hit count of the repeating-unit container (V1 decision signal). */
  container_count: number
  /** Tag path of the first hit container, subscripts stripped (recorded only). */
  tag_path: string
  /** Field name → share of records where the field had a value, 0–1 (V1 signal). */
  field_presence: Record<string, number>
}

export interface SemanticCheck {
  at: string
  verdict: 'ok' | 'suspicious'
  reason: string
  /** Semantic checks also spend tokens; shown to the user like any other llm call. */
  usage?: TokenUsage
}

/** Minimal state: whether there was data and its shape — never the data itself. */
export interface RunSummary {
  at: string
  had_data: boolean
  item_count: number
  /** Field name → shape digest such as "numeric" / "text". */
  field_digest: Record<string, string>
}

export interface RunState {
  /** Hash of the previous extract output; null before the first run. */
  last_extract_hash: string | null
  /** llm step output_to → previous output, for cache reuse. */
  last_llm_outputs: Record<string, unknown>
  /**
   * A5 "last vs current" diff slot. **V1 defines the shape only — nothing writes or
   * reads it** (that work is V1.1). It lives here because adding it later would mean
   * migrating every stored record; one optional field now costs nothing.
   */
  last_result_fingerprints?: string[]
}

/**
 * Local usage statistics. V1 has no Appear grading, so the only
 * consumers are the overview page and the local stats panel. "Recent use" takes the
 * newer of last_run_at / last_export_at — export-only use is real use.
 *
 * Local only: never uploaded, never aggregated, never exported, never logged.
 */
export interface ToolUsage {
  /** ISO 8601; null before the first run. */
  last_run_at: string | null
  run_count: number
  last_export_at: string | null
  export_count: number
}

/** Stored under `juxbly:settings`. */
export interface Settings {
  /** BYOK. Read only in the background context — never in content scripts or pages. */
  api_key: string | null
  /** Any OpenAI-compatible endpoint; defaults to https://api.openai.com/v1. */
  api_base_url: string | null
  model: string | null
  floating_ball_enabled: boolean
}

/** Stored under `juxbly:onboarding` — four one-shot milestones. */
export interface OnboardingFlags {
  first_install_glow_shown: boolean
  first_chat_opened: boolean
  api_key_requested: boolean
  first_tool_built: boolean
}

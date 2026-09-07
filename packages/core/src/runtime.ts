/**
 * Runtime contracts — `docs/ARCHITECTURE.md` §5.5 (the single authoritative place for
 * these shapes; task files must not redefine them).
 *
 * These are runtime structures and message payloads, so fields are camelCase (EC §4).
 * Only the Recipe file format and the storage contract use snake_case.
 *
 * Types only. DSL types come in through `import type` (erased at compile time);
 * cross-module runtime dependencies stay out of `packages/core`.
 */
import type { ToolCategory, ToolDefinition, ToolStep } from '@juxbly/dsl'
import type { TokenUsage } from './messages'
import type { HealthStatus, ToolRecord } from './tool-record'

// ── Page analysis (packages/analyzer output; input to the build flow) ──────────

export interface ContainerCandidate {
  /** Tag path with subscripts stripped, e.g. "div>ul>li". */
  tagPath: string
  hitCount: number
  /** Sample field names / text snippets inside the container, for LLM semantics. */
  sampleFields: string[]
  /**
   * Field-level candidates inside the container (S1). Field selectors were
   * the largest failure bucket in the 10-site spike (container right, fields empty);
   * feeding them to the LLM lifted L0 correctness 20% → 30%.
   */
  fieldHints: FieldHint[]
}

export interface FieldHint {
  /** CSS selector candidate relative to the container. */
  selector: string
  /** Text samples the candidate hit (truncated; never logged). */
  sampleText: string
}

export interface ShadowHostInfo {
  hostTag: string
  /** Summary of the open shadow root's internals (closed roots are not penetrated). */
  innerSummary: string
}

export interface PageAnalysis {
  url: string
  title: string
  /**
   * Simplified visible text (script / style / hidden elements removed). Always enters
   * the prompt as a data segment — the indirect prompt-injection defence — and never
   * participates in system-level decisions.
   */
  visibleText: string
  containers: ContainerCandidate[]
  /** Custom element tag names found by dynamic scanning — mandatory, not optional. */
  customElements: string[]
  shadowHosts: ShadowHostInfo[]
  /** Infinite-scroll / load-more signal, feeds the `pre_scroll` decision. */
  scrollHint: 'none' | 'infinite' | 'load_more'
  /** Whether visibleText was truncated for the token budget. */
  truncated: boolean
  analyzedAt: string
}

// ── Build session (the `conversation` field of build:propose) ──────────────────

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** True for the assistant's clarification questions; the panel counts them (max 2). */
  isClarification?: boolean
  at: string
}

// ── Validation result (what validateToolDefinition returns) ────────────────────

export interface ValidationError {
  /** Field path, e.g. "steps[2].pattern". */
  path: string
  /** Stable English error code — part of the contract, never renamed casually. */
  code: string
  /** User-facing English wording (UI_SPEC §9.5 voice rules). */
  message: string
}

/**
 * Discriminated union.
 *
 * The previous `interface { ok: boolean; errors }` could not carry `value` on success,
 * forcing callers into `as` casts or undefined checks. `validateToolDefinition` is the
 * only gate between LLM output and execution (1-1 Security); the union lets TypeScript
 * narrow `value` out of the `ok: true` branch so "validated but undefined" cannot compile.
 */
export type ValidationResult =
  | { ok: true; value: ToolDefinition }
  | { ok: false; errors: ValidationError[] }

// ── Extract output (shared input to Health and candidate scoring) ──────────────

export type ExtractErrorCode =
  | 'SELECTOR_SYNTAX'
  | 'CONTAINER_MISSING'
  | 'DOM_UNAVAILABLE'
  | 'ABORTED'

export interface ExtractError {
  code: ExtractErrorCode
  message: string
  selector?: string
}

/**
 * Value shapes inside `items` (stage 1-5): `text` and `link` are strings, `image` is
 * `{ src, alt }`. A field with no value is never `undefined` — it is `''`, or
 * `{ src: '', alt: '' }` for an image — so "the field hit nothing" and "the record is
 * missing" stay distinguishable.
 *
 * `link` and `image.src` are resolved to absolute URLs against the document base; a value
 * that cannot be resolved (`javascript:`, `mailto:`) is returned unchanged.
 */
export interface ExtractResult {
  /** Extracted records; single mode yields an array of length 1. */
  items: Record<string, unknown>[]
  /** Field name → share of records with a value (0–1). Feeds health, fingerprint, scoring. */
  fieldPresence: Record<string, number>
  /** Container hit count (list mode); 0 or 1 in single mode. */
  hitCount: number
  /** Fields that hit nothing at all — the direct execution-health signal. */
  missingFields: string[]
  /**
   * True when the container cap cut the result short, so the host page stays
   * responsive. `hitCount` still reports the full match count: capping must not look
   * like a page that changed.
   */
  truncated?: boolean
}

// ── Run engine output ──────────────────────────────────────────────────────────

export interface RunOutcome {
  ok: boolean
  /** Variable bag: output_to → value. The render step consumes the final data. */
  outputs: Record<string, unknown>
  /** Token spend of this run incl. semantic checks; always shown under BYOK. */
  usage: TokenUsage
  /** Whether llm steps were skipped because the cache hit (§9.2 hash comparison). */
  llmCached: boolean
  error?: ExtractError | { code: 'LLM_FAILED' | 'VALIDATION_FAILED'; message: string }
}

// ── Health evaluation (packages/health) ────────────────────────────────────────

export interface HealthInput {
  tool: ToolDefinition
  record: ToolRecord
  extract: ExtractResult | null
  error?: ExtractError
}

export interface HealthEvaluation {
  status: HealthStatus
  /** Which layer fired — the check panel explains "why yellow/red" with this. */
  layer: 'execution' | 'result' | 'structure' | 'semantic'
  reason: string
  /** True only for the semantic layer — the only token-spending layer; must be visible. */
  tokenUsed: boolean
}

// ── Repair session (packages/repair) ───────────────────────────────────────────

export interface RepairSession {
  toolId: string
  trigger: 'broken' | 'user'
  /** Prompt preset so the user never lands in an empty input box. */
  presetPrompt: string
  /** Attempts so far; stop-loss at 2 — no unbounded retries. */
  attempt: number
  /** Version the repair starts from; success writes baseVersion + 1, old versions stay. */
  baseVersion: number
}

// ── Recipe export format (produced in 1-12; desensitisable, curatable) ─────────

/**
 * Recipe file format. The prose source of truth is
 * `docs/contributing/RECIPE_GUIDE.md`; where they disagree, this type wins (type SSOT)
 * and the guide gets fixed in the same change.
 */
export interface RecipeJson {
  recipe_version: 1
  /** kebab-case; doubles as the directory name. */
  name: string
  title: string
  description: string
  scenario: {
    /** Semantically identical to definition.url_pattern (§5.3). */
    url_pattern: string
    site_label: string
    category: ToolCategory
    /** Only step types that exist — recipes must not smuggle unshipped capabilities. */
    capabilities: ToolStep['type'][]
    /** Site structural difficulty; decides whether the recipe fits as a benchmark case. */
    page_difficulty: 'regular' | 'spa' | 'shadow-dom' | 'infinite-scroll' | 'hashed-class'
  }
  /** Shape of expected health results. Contains no scraped content whatsoever. */
  health_baseline: {
    /** A range, e.g. "20-31". */
    expected_item_count: string
    expected_fields: Record<string, string>
  }
  definition: ToolDefinition
  provenance: {
    /** GitHub handle — attribution is the reward. */
    author: string
    license: 'CC BY-SA 4.0' | 'CC0'
    verified_on: string
    juxbly_version: string
  }
}

// ── Export output ──────────────────────────────────────────────────────────────

// ── render output (packages/capabilities/render) ──────────────────────────────

export interface RenderResult {
  view: 'table' | 'card' | 'text'
  /**
   * Records handed to the view. **0 is a normal empty state, not an error**
   * (`docs/UI_SPEC.md` §7): "nothing matched" is an answer a tool is allowed to give.
   */
  itemCount: number
  /** True when rows or long values were capped, so the host page stays responsive. */
  truncated: boolean
}

// ── export output ────────────────────────────────────────────────────────────

export interface ExportResult {
  ok: boolean
  format: 'copy' | 'csv' | 'json'
  /** Number of exported records. The exported content itself never travels back. */
  itemCount: number
  /** Filename for csv / json downloads; undefined for copy. */
  filename?: string
  error?: string
}

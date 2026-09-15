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
import type {
  HealthStatus,
  RunState,
  RunSummary,
  SemanticCheck,
  StructureFingerprint,
  ToolHealth,
} from './tool-record'

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

// ── Candidate scoring (§5.6: the build phase's local dry run) ─────────────────

/**
 * One candidate tool, scored against the page it would run on.
 *
 * The model proposes; the page decides. A candidate that reads beautifully and matches
 * nothing must lose to one that matches something, and the only way to know is to run
 * its `extract` step as a dry run (`docs/ARCHITECTURE.md` §5.6).
 */
export interface CandidateEvaluation {
  /**
   * Index into the candidate array the model returned — the stable identity of a
   * candidate. `evaluateCandidates` returns a **sparse** array (a candidate whose dry run
   * threw is absent), so this is the only thing that still points back at the input.
   */
  candidateIndex: number
  /** Container matches. `0` means the candidate does not describe this page (§5.6). */
  hitCount: number
  /** Share of field values actually present, 0–1 (mean of `fieldPresence`). */
  fieldFillRate: number
  /** Share of values that look like their declared `field_types`, 1 on a perfect match. */
  shapeScore: number
  /**
   * Weighted result of the three signals, 0–1. Weights are an implementation detail of
   * the scorer; the *ordering* is the contract.
   */
  score: number
}

// ── Run engine input / output (packages/runtime, stage 1-7) ────────────────────

/**
 * What the run engine is handed besides the tool itself.
 *
 * `runState` is the previous run's cache: the engine reads it and hands a new one back.
 * Storing it is the **caller's** job (1-10) — the engine stays free of side effects (§4),
 * which is also what makes "cancel mid-run" a matter of returning nothing to store.
 */
export interface RunOptions {
  /**
   * Absent in the content script: it cannot name its own tab (that knowledge lives in the
   * service worker, and `BrowserAdapter.messaging` deliberately does not forward the
   * platform `sender`), and no V1 capability consumes it — identity for a run is the tool
   * plus the page, not the tab. Optional since stage 1-10.
   */
  tabId?: number
  /** Cancelled when the panel closes or the page navigates (§6.1). */
  signal: AbortSignal
  /** What the previous run left behind; absent on the first run. */
  runState?: RunState | null
  /**
   * Run every llm step even when the input hash is unchanged (§9.2 manual refresh) —
   * the only way to spend tokens on purpose, because the cache is the default.
   */
  force?: boolean
}

/**
 * Why a run did not complete. `code` is stable and English because the panel and the
 * health layer branch on it (1-9 / 1-11); `message` is ours and never a capability's —
 * a capability's own text could carry page content, and this structure crosses contexts.
 */
export type RunErrorCode =
  /** Kept verbatim from `ExtractError`: health reports them on different layers (§10). */
  | ExtractErrorCode
  | 'LLM_FAILED'
  | 'VALIDATION_FAILED'
  | 'CAPABILITY_UNREGISTERED'
  | 'CAPABILITY_FAILED'
  /** The variable bag's own fence; `validateToolDefinition` already rejects these (§5.4). */
  | 'VARIABLE_DUPLICATE'
  | 'VARIABLE_UNRESOLVED'
  | 'VARIABLE_NOT_RECORDS'

export interface RunError {
  code: RunErrorCode
  message: string
  /** Index of the step that failed; absent when the whole tool was rejected. */
  step?: number
  /** Field-level reasons — present only for `VALIDATION_FAILED` (§5.4). */
  errors?: ValidationError[]
  /** Carried from `ExtractError` so health can name the selector that failed. */
  selector?: string
}

/** What the llm capability returns: the model's output plus what it cost (BYOK). */
export interface LlmStepOutput {
  output: unknown
  usage: TokenUsage
}

export interface RunOutcome {
  ok: boolean
  /** Variable bag: output_to → value. The render step consumes the final data. */
  outputs: Record<string, unknown>
  /** Token spend of this run incl. semantic checks; always shown under BYOK. */
  usage: TokenUsage
  /** Whether llm steps were skipped because the cache hit (§9.2 hash comparison). */
  llmCached: boolean
  /** The render step's result, when the tool has one. */
  render?: RenderResult
  /** The minimal run summary health keeps in its 10-run window (§8.1). */
  summary: RunSummary
  /**
   * What the caller stores for the next run — absent when the run was cancelled or
   * rejected, so a half-finished run can never poison the cache (§9.2).
   */
  runState?: RunState
  error?: RunError
  /**
   * Per-step timing and shape (stage 1-16, §5.5): what the runtime inspect tab draws.
   *
   * **No data is copied here.** A trace names the step, the variable it wrote and how
   * long it took; the values stay in `outputs`, where they already live. Duplicating them
   * would leave a second copy of page content behind every run and give the project two
   * places to keep clean — the panel resolves `outputs[outputTo]` when it draws.
   *
   * Absent when the tool was rejected before its first step ran.
   */
  steps?: RunStepTrace[]
}

/**
 * One step, as the runtime lived it (stage 1-16).
 *
 * `durationMs` is measured around the capability call only: the engine's own variable
 * resolution is not the step's cost, and folding it in would make a slow step look like
 * a slow engine.
 */
export interface RunStepTrace {
  /** Index in `ToolDefinition.steps`; the inspect tab lists them in order. */
  index: number
  type: ToolStep['type']
  /**
   * Rows handed to the step. `null` for `extract`, which reads the page and consumes no
   * variable (§5.2) — "0 rows" and "nothing was handed over" are different answers.
   */
  inputCount: number | null
  /** The variable this step wrote; absent for `render` and `export` (§5.2). */
  outputTo?: string
  durationMs: number
  /** True when the llm cache answered: no model call, nothing spent. */
  cached?: boolean
  /** Present on the step that failed — the same `RunError` the run reports. */
  error?: RunError
}

// ── Health evaluation (packages/health) ────────────────────────────────────────
//
// The contracts below are transcribed once, here (§5.5 discipline — core is the
// dependency-graph bottom and the type SSOT); `packages/health` re-exports them and
// implements the pure judgement behind them. They describe what stage 1-11 shipped:
// `HealthInput` carries no page content and no extracted values, which is what makes
// `evaluateHealth` a pure function the §10 state machine can be tested against.

export type ExecutionLayer = 'ok' | 'failed'
export type ResultLayer = 'ok' | 'deviated' | 'no-baseline'
export type StructureLayer = 'ok' | 'drifted' | 'no-baseline'
export type SemanticLayer = 'not-run' | 'ok' | 'suspicious' | 'error'

/** The four per-layer verdicts, kept separate so the panel can answer "why is this yellow". */
export interface HealthLayers {
  execution: ExecutionLayer
  result: ResultLayer
  structure: StructureLayer
  semantic: SemanticLayer
}

export interface HealthInput {
  /** The health stored before this run — the baseline every layer compares against. */
  previous: ToolHealth
  /** Set when extract threw. The only signal that can break a tool outright. */
  extractError?: ExtractError | null
  /** This run's summary; appended to the window by the caller, not by `evaluateHealth`. */
  summary: RunSummary
  /** Structure statistics captured for this run; null when nothing could be read. */
  fingerprint: StructureFingerprint | null
  /** Present only when a semantic check ran for this run. */
  semantic?: SemanticCheck | null
  /** Set when a check was attempted and failed (no key, network, timeout). */
  semanticError?: boolean
  /** Wall-clock time, injected so the throttle is testable without fake timers. */
  now?: number
  /** Set by the user pressing "check now": their action, their tokens. */
  forceSemanticCheck?: boolean
}

export interface HealthEvaluation {
  status: HealthStatus
  /** Whether the status moved — the panel only says something when it did. */
  changed: boolean
  /** Why, in one sentence. Never contains page content or extracted values (§10). */
  reason: string
  layers: HealthLayers
  /** The structure baseline to store: a fresh capture, or the previous one kept. */
  fingerprint: StructureFingerprint | null
  /** Consecutive clean-run count, carried forward for the "recover twice" rule. */
  consecutiveCleanRuns: number
  /** Whether a semantic check should run (the caller owns actually running it). */
  semanticCheckRequested: boolean
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

// The `export` capability's `ExportResult` (stage 1-15) lives next to the capability
// contract in `capability.ts` — this file's earlier §5.5 print of it (with `ok`,
// `filename` / `error`) was superseded and removed; the capability-facing shape is the
// source of truth.

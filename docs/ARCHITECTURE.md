# Juxbly ARCHITECTURE.md

> This document is the **single source of truth for Juxbly's type contracts and module interfaces**. Type definitions and module interfaces are authoritative here; engineering conventions live in `docs/CONVENTIONS.md`; UI rules live in `docs/UI_SPEC.md`.

## 1. Design principles

1. **Code is fixed, configuration is variable**: the LLM only generates Tool DSL configuration, never executable code. The runtime interprets configuration and evals nothing.
2. **Express intent, not low-level APIs**: the DSL describes "what to grab, how to process it, how to present it" and does not expose low-level calls such as `querySelectorAll` or `chrome.*`.
3. **Not a JavaScript replacement language**: the DSL forbids `if / else / for / while / map / eval / arbitrary code`. When complexity rises, add a new, semantically explicit capability instead of adding control flow to the DSL.
4. **New capabilities must not force rewriting existing tools**: DSL evolution must stay backward compatible (EC §6).
5. **Least privilege**: capabilities never call `chrome.*` directly — always through the Browser Adapter; the Store Build narrows permissions from the same Core (Policy Surface).
6. **Breakage is visible; repair is a rebuild**: health status must be visible; repair reuses the build flow and produces a new version. V1 forbids silent auto-repair.

---

## 2. System architecture overview

```mermaid
flowchart TD
    subgraph ContentScript["Content Script (per tab)"]
        UI[Floating ball / chat panel / run panel<br/>packages/ui · Shadow DOM isolation]
        HL[Highlight confirmation layer<br/>packages/ui]
        AN[Page analyzer<br/>packages/analyzer]
        RT[Run engine (orchestration)<br/>packages/runtime]
        CAP1[extract / transform / render / export<br/>packages/capabilities]
    end

    subgraph Background["Background Service Worker"]
        BG[Message routing / URL match trigger<br/>apps/extension]
        LLM[BYOK client + prompt-injection defence<br/>packages/llm caller side]
        ST[Storage gateway<br/>packages/storage + browser]
    end

    subgraph Shared["Shared core packages"]
        DSL[Tool DSL types + validation<br/>packages/dsl]
        CORE[Domain models / message protocol<br/>packages/core]
        HEALTH[Health evaluation<br/>packages/health]
        REPAIR[Repair sessions / version management<br/>packages/repair]
    end

    STORE[(chrome.storage.local)]

    UI --> AN
    UI --> RT
    RT --> CAP1
    RT -->|"llm step (the only cross-context capability)"| BG
    BG --> LLM
    BG --> ST
    ST --> STORE
    RT --> HEALTH
    REPAIR --> DSL
    CAP1 --> DSL
    RT --> DSL
```

Layered dependencies (top-down; never reversed):

```text
Tool DSL (packages/dsl)
   ↓
Capability Runtime (packages/runtime + capabilities + health + repair)
   ↓
Browser Adapter (packages/browser — the only package that wraps chrome.*; entrypoint exception in §6.4.1)
   ↓
Browser APIs (DOM / chrome.storage / chrome.tabs / fetch / clipboard / downloads)
```

---

## 3. Toolchain baseline (Phase 0 decisions)

| Item | Choice | Rationale |
|---|---|---|
| Build framework | **WXT** (Vite-based) | Content-script hot reload fits Juxbly's content-script-heavy architecture; multi-browser target keeps the Edge deferral. Swapping it for plain Vite + CRXJS would not change the type contracts named in this document. |
| UI framework | **React 18+** | An existing conclusion from proposal V1.4, promoted into the baseline. |
| Language | **TypeScript (strict)** | An existing SSOT conclusion; `any` and `@ts-ignore` are forbidden (EC §4). |
| Testing | **Vitest** | Matches the Vite-family toolchain. |
| Package management / monorepo | **pnpm workspace** | Matches the `apps/* + packages/*` layout of EC §7. |
| Extension platform | **Chrome MV3 (desktop)** | Edge deferred; Firefox is out of scope (product baseline §16). |

---

## 4. Module map

The directory layout follows EC §7 — semantic boundaries: a stranger can infer each package's responsibility from its name.

| Module | Responsibility | Key exports | Depends on | Side effects / output |
|---|---|---|---|---|
| `packages/core` | Domain models and the cross-context message protocol | `ToolRecord`, `HealthStatus`, `ExtensionMessage` and other types | none | none (pure types) |
| `packages/dsl` | DSL type definitions, schema validation, URL matching | `validateToolDefinition()`, `matchUrl()`, `parseUrlPattern()` | core | none (pure functions) |
| `packages/runtime` | Step orchestration, the variable bag, llm-cache decisions, capability registry | `ToolRuntime`, `CapabilityRegistry` | core, dsl | no direct side effects (through injected ports) |
| `packages/capabilities` | The five capability executors (extract / transform / llm / render / export) | one `CapabilityDefinition` implementation each | core, dsl, browser (interface), ui (render views only) | DOM reads, clipboard writes |
| `packages/browser` | Browser Adapter: chrome API abstraction + mock implementation | the `BrowserAdapter` interface | core | **the only package that wraps chrome.* capabilities** (assembly-layer exception in §6.4.1) |
| `packages/analyzer` | Page analysis: visible-text simplification, structural features, dynamic custom-element scan, shadow expansion | `analyzePage()` | none | none (pure DOM reads) |
| `packages/health` | Breakage evaluation and the health state machine | `evaluateHealth()` | core, dsl | none (results are written through storage) |
| `packages/repair` | Repair sessions, version creation and rollback | `RepairSession` | core, dsl, runtime | storage writes (through browser) |
| `packages/ui` | Floating ball, chat panel, run panel, highlight layer, three views, popup, options | React components | core, dsl | DOM rendering (Shadow DOM isolation) |
| `packages/storage` | chrome.storage wrapper, data migration | `loadTool()`, `saveTool()` etc. | core, browser | chrome.storage.local reads and writes |
| `packages/llm` | BYOK client, prompt templates, prompt-injection defence | `callLlm()`, `buildPrompt()`, `handleRunLlm()` | core, dsl (types), storage, browser (interface) | network requests (executed in the background context only) |
| `apps/extension` | WXT entrypoint assembly: background / content / popup / options, manifest | — | all | process assembly (chrome.* calls limited to the §6.4.1 assembly-layer list) |
| `apps/playground` | Local benchmark carrier (Web Corpus static serving + runner) | — | dsl, runtime | local dev server |

---

## 5. Tool DSL type contracts

> This section is the **single authoritative definition** of the DSL. DSL JSON fields use snake_case — field-for-field identical to storage and to LLM output, with no renaming layer in code. TS identifier naming still follows EC §4; the two scopes are different.

### 5.1 ToolDefinition

```ts
/**
 * Tool category, drives the Tool Identity color system (color values in UI_SPEC.md).
 *
 * V1 has 4. `monitor` was removed from the enum: a monitoring tool
 * needs scheduled / background execution (Orchestration), and V1 explicitly does neither
 * MutationObserver watching nor scheduled or background execution. No V1 capability can
 * therefore produce a monitor tool — keeping the enum value would only invite the LLM to
 * emit a category nothing can execute. When V2 monitoring ships it returns as a pure
 * enum addition; existing tools are unaffected (backward compatible, EC §6).
 */
type ToolCategory = 'data' | 'enhance' | 'analyze' | 'export'

interface ToolDefinition {
  tool_id: string          // stable identifier, e.g. "tool_8f3a2b"
  name: string             // user-readable name, e.g. "Price extractor"
  description?: string
  category: ToolCategory   // suggested by the LLM at build time; the user can change it
  url_pattern: string      // glob pattern; matching semantics in §5.3
  version: number          // starts at 1; +1 on every repair / edit
  steps: ToolStep[]        // V1 executes steps linearly
  created_at: string       // ISO 8601
  updated_at: string
}
```

### 5.2 Step types (five in V1)

```ts
type ToolStep = ExtractStep | TransformStep | LlmStep | RenderStep | ExportStep

/** Field data type — decides extraction and the default view suggestion */
type FieldType = 'text' | 'image' | 'link'

/**
 * Scroll preparation before extraction (A1).
 *
 * Why it exists: most list pages in 2026 load content on scroll or behind a "load more"
 * button, so analysing only the first screen yields "20 of 500 items" — a tool that
 * works but is useless. That is the failure mode the target user (a technical data
 * worker) tolerates least, because it breaks the reuse promise a Persistent Tool makes.
 *
 * Boundary: this is a **DOM preparation step inside extract**, not an Act / Orchestrate
 * capability. It introduces no click / navigate semantics, so it does not violate
 * "no control flow in the DSL" (principle 3).
 * V1 implements `to_bottom` only (pure scrolling, zero new permissions); `click_more`
 * needs an Act capability and stays out.
 */
interface PreScroll {
  mode: 'to_bottom'
  /** Max scroll rounds, default 3. Stops at the cap or when page height stops growing */
  max?: number
  /** Milliseconds to wait after each scroll, default 400, so lazy content can render */
  settle_ms?: number
}

interface ExtractStep {
  type: 'extract'
  mode: 'single' | 'list'
  /** list mode: CSS selector of the repeating-unit container; omitted in single mode */
  selector?: string
  /** field name → CSS selector (relative to selector; document root in single mode) */
  fields: Record<string, string>
  /** Type hints, default all text. image reads src/alt, link reads href */
  field_types?: Partial<Record<string, FieldType>>
  /** Scroll to load more before extracting (see PreScroll). Absent behaves as 'none': only what is already rendered */
  pre_scroll?: PreScroll
  output_to: string       // variable name to write, e.g. "raw_items"
}

type ConditionOp =
  | '>' | '>=' | '<' | '<=' | '==' | '!='
  | 'contains' | 'starts_with' | 'ends_with' | 'matches'  // matches is a regex

interface FilterCondition {
  field: string
  op: ConditionOp
  value: string | number
}

type TransformOp = 'filter' | 'sort' | 'regex' | 'dedupe'

interface TransformStep {
  type: 'transform'
  op: TransformOp
  input_from: string
  output_to: string
  // op-specific parameters (validation rules in §5.4)
  condition?: FilterCondition   // required for filter
  field?: string                // target field for sort / regex / dedupe
  order?: 'asc' | 'desc'        // required for sort
  pattern?: string              // required for regex, RE2-style safe subset
  group?: number                // optional capture group for regex, default 0 (whole match)
}

type LlmTask = 'summarize' | 'translate' | 'classify' | 'sentiment' | 'custom'

interface LlmStep {
  type: 'llm'
  task: LlmTask
  input_from: string
  output_to: string
  prompt?: string        // required when task === 'custom'; optional extra guidance otherwise
  target_lang?: string   // required when task === 'translate'
}

interface RenderStep {
  type: 'render'
  view: 'table' | 'card' | 'text'   // three views in V1, charts later
  input_from: string
}

interface ExportStep {
  type: 'export'
  /** json and csv both go through downloads — no new permission (product baseline §1.6.4) */
  format: 'copy' | 'csv' | 'json'
  input_from: string
}
```

### 5.3 url_pattern matching semantics

```ts
/**
 * A pattern looks like "amazon.com/*" (matches host + path only; protocol and
 * query/hash are ignored). Matching rules:
 *  1. host: the pattern host equals the URL host, or the URL host ends with
 *     "." + pattern host (subdomains)
 *  2. path: glob, where "*" matches any run of characters (including "/")
 *  3. host comparison is case-insensitive
 */
export function matchUrl(pattern: string, url: URL): boolean
```

### 5.4 Validation rules (`validateToolDefinition`)

Validated **twice** — before saving and before every run. Any failure rejects:

1. `steps` is non-empty, and every `output_to` is globally unique.
2. Each step's `input_from` must reference a variable produced by a **strictly earlier** step (V1 executes linearly; forward references are rejected).
3. `render` / `export` are consumers and declare no `output_to`.
4. `extract`'s `fields` is non-empty; `mode: 'list'` requires `selector`.
   If `pre_scroll` is present: `mode` must be `'to_bottom'` (the only value V1 allows); `max`, if present, must stay within
   **1–10** — a hard cap, because runaway scrolling would grind the host page down and violate "never block the host page" (§11);
   `settle_ms`, if present, must stay within 0–2000.
5. `transform` validates op-specific parameter completeness per op (see the §5.2 comments).
6. A `regex`'s `pattern` must pass the safe-regex check (no catastrophic-backtracking constructs).
7. `url_pattern` must be parseable by `parseUrlPattern`.
8. A `type` outside §5.2 or an unknown field → reject. This is what stops the DSL from quietly growing (EC §20 agent prohibitions).

### 5.5 Runtime contracts

> This section completes the runtime types that previously had no contract — nine items originally, eleven now with `ChatMessage` and
> `ExtractError`. **These types must not be redefined anywhere else**; to change one, change it here.

```ts
// ── Page analysis (packages/analyzer output; input to the build flow) ──────────────────────
// Naming: types in this section are runtime structures / message payloads — fields are camelCase (EC §4).
// Only JSON file formats (RecipeJson) and the storage contract (§8.1) use snake_case.

interface ContainerCandidate {
  /** Tag path with subscripts stripped, e.g. "div>ul>li" */
  tagPath: string
  hitCount: number
  /** Sample field names / text snippets found inside the container, for LLM semantics */
  sampleFields: string[]
  /**
   * Field-level candidates inside the container (S1): relative selector + hit text samples.
   * Measured on a 10-site sample: field-level selectors were the largest failure bucket (4/10 — right container,
   * empty fields); feeding field-level candidates to the LLM lifted L0 correctness 20% → 30%.

   */
  fieldHints: FieldHint[]
}

interface FieldHint {
  /** Relative CSS selector candidate inside the container */
  selector: string
  /** Text samples the candidate hit (truncated, for semantic judgement only; sample text never enters logs) */
  sampleText: string
}

interface ShadowHostInfo {
  hostTag: string
  /** Summary of the open shadow root's internals (closed roots cannot be pierced and are not recorded) */
  innerSummary: string
}

interface PageAnalysis {
  url: string
  title: string
  /**
   * Simplified visible text (script / style / hidden elements removed).
   * **Always enters the prompt as a data section** — the §12 indirect prompt-injection defence — and never takes part in system-level decisions.
   */
  visibleText: string
  containers: ContainerCandidate[]
  /** Custom element tag names found by dynamic scanning — an M0 fix item, **mandatory, not optional** */
  customElements: string[]
  shadowHosts: ShadowHostInfo[]
  /** Infinite-scroll / load-more signal, feeds the `pre_scroll` decision (A1) */
  scrollHint: 'none' | 'infinite' | 'load_more'
  /** Whether visibleText was truncated for the token budget */
  truncated: boolean
  analyzedAt: string
}

// ── Build session (the `conversation` field of build:propose) ──────────────────────────

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  /** True for the assistant's clarification questions; the build panel counts them, at most two rounds (product baseline §3.3) */
  isClarification?: boolean
  at: string
}

// ── Validation result (what validateToolDefinition returns) ────────────────────────────────

interface ValidationError {
  /** Field path, e.g. "steps[2].pattern" */
  path: string
  /** Stable error code, English; part of the contract, never renamed casually */
  code: string
  /** User-facing English wording (UI_SPEC §9.5 copy discipline) */
  message: string
}

/**
 * Discriminated union.
 *
 * The previous shape `interface { ok: boolean; errors: ValidationError[] }` could not
 * carry `value` on success, forcing callers into `as` casts or undefined checks.
 * `validateToolDefinition` is the only gate between "LLM output" and "execution";
 * a failed narrowing makes it far too easy to write code that passes validation but
 * reads an undefined definition — the union lets the type system hold this gate.
 */
type ValidationResult =
  | { ok: true; value: ToolDefinition }
  | { ok: false; errors: ValidationError[] }

// ── extract output (shared input to Health and candidate scoring) ─────────────────────────────

type ExtractErrorCode =
  | 'SELECTOR_SYNTAX'      // invalid selector syntax
  | 'CONTAINER_MISSING'    // the container matched nothing
  | 'DOM_UNAVAILABLE'      // page context gone (navigation / close)
  | 'ABORTED'              // cancelled through an AbortSignal

interface ExtractError {
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
 * `link` and `image.src` are resolved to absolute URLs against the document base. A value
 * that cannot be resolved (`javascript:`, `mailto:`) is returned unchanged and is never
 * rendered as a link until the render layer checks the protocol (§5.2 Edge Cases).
 */
interface ExtractResult {
  /** Extracted records; single mode yields an array of length 1 */
  items: Record<string, unknown>[]
  /** field name → share of records with a value (0–1). Shared by the health result layer, the structure fingerprint and candidate scoring */
  fieldPresence: Record<string, number>
  /** Container hit count (list mode); 0 or 1 in single mode */
  hitCount: number
  /** Fields that hit nothing at all — the direct verdict input for execution-layer health */
  missingFields: string[]
  /**
   * True when the container cap cut the result short, so the host page stays responsive
   * (§11). `hitCount` still reports the full match count, which is what health compares
   * against an expected range — capping must not look like a page that changed.
   */
  truncated?: boolean
}

// ── Run engine (packages/runtime, stage 1-7) ───────────────────────────────────

/** What the engine is handed besides the tool itself. */
interface RunOptions {
  tabId: number
  /** Cancelled when the panel closes or the page navigates (§6.1) */
  signal: AbortSignal
  /** What the previous run left in storage; absent on the first run */
  runState?: RunState | null
  /** Run every llm step even when the input hash is unchanged (§9.2 manual refresh) */
  force?: boolean
}

/**
 * Why a run did not complete. `code` is stable and English because the panel and the
 * health layer branch on it; `message` is the engine's own and never a capability's —
 * a capability's text can be built from page content, and this crosses contexts.
 */
type RunErrorCode =
  /** Kept verbatim from `ExtractError`: health reports them on different layers (§10) */
  | ExtractErrorCode
  | 'LLM_FAILED'
  | 'VALIDATION_FAILED'
  | 'CAPABILITY_UNREGISTERED'
  | 'CAPABILITY_FAILED'
  /** The variable bag's own fence; §5.4 already rejects these at validation time */
  | 'VARIABLE_DUPLICATE'
  | 'VARIABLE_UNRESOLVED'
  | 'VARIABLE_NOT_RECORDS'

interface RunError {
  code: RunErrorCode
  message: string
  /** Index of the step that failed; absent when the whole tool was rejected */
  step?: number
  /** Field-level reasons — present only for `VALIDATION_FAILED` (§5.4) */
  errors?: ValidationError[]
  /** Carried from `ExtractError`, so health can name the selector that failed */
  selector?: string
}

/** What the llm capability returns: the model's output plus what it cost (BYOK) */
interface LlmStepOutput {
  output: unknown
  usage: TokenUsage
}

interface RunOutcome {
  ok: boolean
  /** The variable bag: output_to → value. The render step consumes the final data */
  outputs: Record<string, unknown>
  /** Token spend of this run (semantic-layer checks included) — must be shown transparently under BYOK */
  usage: TokenUsage
  /** Whether llm steps were skipped because the cache hit (the §9.2 hash comparison) */
  llmCached: boolean
  /** The render step's result, when the tool has one */
  render?: RenderResult
  /** The minimal run summary health keeps in its 10-run window (§8.1) */
  summary: RunSummary
  /** What the caller stores for the next run — absent when the run was cancelled or rejected */
  runState?: RunState
  error?: RunError
}

// ── Health evaluation (packages/health) ─────────────────────────────────────────

interface HealthInput {
  tool: ToolDefinition
  record: ToolRecord
  extract: ExtractResult | null
  error?: ExtractError
}

interface HealthEvaluation {
  status: HealthStatus
  /** Which layer fired — the check panel uses this to explain "why yellow / why red" (product baseline §9.3, the check capability) */
  layer: 'execution' | 'result' | 'structure' | 'semantic'
  reason: string
  /** True only for the semantic layer — the only token-consuming layer, must stay transparent (product baseline §14 scope note) */
  tokenUsed: boolean
}

// ── Repair session (packages/repair) ────────────────────────────────────────────

interface RepairSession {
  toolId: string
  trigger: 'broken' | 'user'
  /** The context message preset for the user — never an empty input box (product baseline §6.3) */
  presetPrompt: string
  /** Attempts so far; stop-loss at 2, no unbounded retries (product baseline §6.3) */
  attempt: number
  /** The version the repair starts from; success writes baseVersion + 1 and old versions stay */
  baseVersion: number
}

// ── Recipe export format (produced by the export capability; desensitisable, curatable) ────────────────────────────

/**
 * Recipe file format. **The factual documentation of the file structure and field
 * examples is `docs/contributing/RECIPE_GUIDE.md`**; this section is its TypeScript
 * typing. Where the two disagree this section wins (the type SSOT) and the guide gets
 * fixed in the same change.
 */
interface RecipeJson {
  recipe_version: 1
  name: string                     // kebab-case, doubles as the directory name
  title: string                    // user-readable title
  description: string
  scenario: {
    /** Must be semantically identical to definition.url_pattern (ARCHITECTURE §5.3) */
    url_pattern: string
    site_label: string
    category: ToolCategory
    /** Only step types that exist — a recipe must not smuggle unshipped capabilities */
    capabilities: ToolStep['type'][]
    /** Site structural difficulty — decides whether the recipe qualifies as a benchmark case */
    page_difficulty: 'regular' | 'spa' | 'shadow-dom' | 'infinite-scroll' | 'hashed-class'
  }
  /** The **shape** of expected health results. **Contains no scraped content whatsoever** (product baseline §13) */
  health_baseline: {
    expected_item_count: string    // a range, e.g. "20-31"
    expected_fields: Record<string, string>
  }
  definition: ToolDefinition
  provenance: {
    author: string                 // GitHub handle — attribution is the reward (product baseline §10.9.4)
    license: 'CC BY-SA 4.0' | 'CC0'
    verified_on: string
    juxbly_version: string
  }
}

// ── render output (packages/capabilities/render, stage 1-4) ───────────────────

interface RenderResult {
  view: 'table' | 'card' | 'text'
  /** Records handed to the view. **0 is a normal empty state, not an error** (UI_SPEC §7) */
  itemCount: number
  /** True when rows or long values were capped, so the host page stays responsive */
  truncated: boolean
}

// ── export output ────────────────────────────────────────────────────────────

interface ExportResult {
  ok: boolean
  format: 'copy' | 'csv' | 'json'
  /** Number of exported records. **The exported content itself never travels back** (banned from logs and messages alike) */
  itemCount: number
  /** Filename for csv / json downloads; undefined for copy */
  filename?: string
  error?: string
}

// ── Browser Adapter (packages/browser — the only package that wraps chrome.* capabilities, see §6.4) ──

/**
 * Division of labour with §6.1 `RuntimePorts`:
 *   - `BrowserAdapter` is the **abstraction over chrome APIs** (implementations: the chrome
 *     implementation / a mock / the playground stand-in)
 *   - `RuntimePorts` are the **execution ports injected into capabilities** (consumer: Capability.execute)
 * The former provides the low-level abilities; the latter is the facade injected at run time.
 * Neither may import the other's implementation — they share interfaces only.
 */
interface BrowserAdapter {
  storage: StoragePort
  clipboard: ClipboardPort
  downloads: DownloadsPort
  /** Cross-context messaging (content script ↔ background), carrying every §7.2 message type */
  messaging: MessagingPort
}

// ── LLM package contracts (packages/llm — runs in the background context only) ──────────────

/**
 * Completed by stage 1-6 around the §6.1 `LlmPort` (which stays the capability-facing
 * contract). The key flows: storage → `LlmEndpoint` → one request header — nothing else.
 */

interface LlmEndpoint {
  baseUrl: string   // any OpenAI-compatible endpoint; empty → https://api.openai.com/v1
  apiKey: string    // read only here (§12.2): never logged, never sent back over messaging
  model: string
}

interface LlmMessage { role: 'system' | 'user'; content: string }

interface LlmRequest {
  endpoint: LlmEndpoint
  messages: readonly LlmMessage[]
  /** 'json' requests a JSON object and parses strictly — JSON.parse is the only parser (§12.1) */
  responseFormat?: 'text' | 'json'
  /** Cancelled on panel close / page navigation */
  signal?: AbortSignal
  timeoutMs?: number          // default 60_000
}

interface LlmResponse {
  output: unknown
  /** Success only — a failed call reports no usage, so a failure never reads as free. */
  usage: TokenUsage
}

/** The three prompt sections. Page content may appear in `data` and nowhere else (§12.3). */
interface PromptSpec { system: string; instruction: string; data: string }

type LlmErrorCode =
  | 'NOT_CONFIGURED'   // no key / model yet — 1-13's onboarding step takes over
  | 'NETWORK'          // endpoint unreachable
  | 'AUTH'             // 401 / 403
  | 'RATE_LIMIT'       // 429 — a distinct copy path from NETWORK (§11)
  | 'HTTP_ERROR'       // any other non-2xx
  | 'TIMEOUT'
  | 'ABORTED'          // caller cancelled
  | 'INVALID_REQUEST'  // the step has nothing to send (custom task without a prompt)
  | 'INVALID_RESPONSE' // the reply is not a readable chat completion

class LlmError extends Error {
  code: LlmErrorCode
  status?: number
}

function callLlm(req: LlmRequest, deps?: { fetchImpl?: LlmFetch; logger?: Logger }): Promise<LlmResponse>
function buildPrompt(spec: PromptSpec): LlmMessage[]
//   Three messages, in order: system instruction / wrapped data section / instruction —
//   so the last thing the model reads is Juxbly's instruction, not the page's.
function handleRunLlm(message: RunLlmMessage, adapter: BrowserAdapter): Promise<RunLlmResultMessage>
//   The background side of run:llm (§7.2). Never rejects: `run:llm_result.error` carries
//   the LlmErrorCode string and the panels (1-9 / 1-10) map a code to copy — `error` is a
//   category, not prose.
```

### 5.6 Candidate scoring (A2)

> Why it exists: the highest-priority problem recorded during the M0 review was "the LLM
> tends to hit nothing by emitting outdated tag names".
> That is a **verification problem, not a generation problem** — and verification runs
> entirely locally without spending a token.

```ts
interface CandidateEvaluation {
  /** The candidate's index in the `candidates` array */
  index: number
  /** Container hit count */
  hitCount: number
  /** Field fill rate (0–1) */
  fieldFillRate: number
  /** Shape plausibility (0–1): does a numeric field look like a number, does a link field look like a URL */
  shapeScore: number
  /** Combined score; higher is better */
  score: number
}

/**
 * Dry-runs each candidate's extract step against the real page and scores it —
 * **no model call, no token spend**. Called only during the build phase (before
 * highlight confirmation) to present the best candidate for the user to confirm.
 *
 * Constraints:
 *   - The dry run must be read-only DOM queries with no side effects (no clipboard
 *     writes, no downloads, no storage writes);
 *   - A candidate that throws `ExtractError` is eliminated outright (it does not enter
 *     the ranking) and is not treated as a run failure;
 *   - If every candidate fails, the §9.1 failure escalation chain takes over — no
 *     immediate stop-loss.
 */
function evaluateCandidates(
  candidates: ToolDefinition[],
  dom: DomPort
): CandidateEvaluation[]
```

Scoring weights and thresholds land with the implementation and iterate with the Phase 2
benchmark data (**never tuned to make the numbers look good** — the same discipline as the
M0 review records).

---

## 6. Capability Runtime contracts

### 6.1 CapabilityDefinition (replaces the EC §5 conceptual example)

```ts
interface CapabilityDefinition<I, O> {
  type: ToolStep['type']
  version: string                       // semantic version
  inputSchema: JSONSchema               // JSON Schema draft-07
  outputSchema: JSONSchema
  permissions: CapabilityPermission[]   // see §6.3
  securityNotes: string                 // required for contributions (one of the eight EC §5 requirements)
  execute(input: I, ctx: ExecutionContext): Promise<O>
}

interface ExecutionContext {
  tabId: number
  signal: AbortSignal                   // cancelled on page navigation / panel close
  /** Platform service ports: every environmental capability execution needs; touching chrome.* directly is forbidden */
  ports: RuntimePorts
}

interface RuntimePorts {
  dom: DomPort            // query and render mount point needed by extract / render (injected only in the content-script context)
  llm: LlmPort            // BYOK calls via background (used by the llm capability)
  clipboard: ClipboardPort
  downloads: DownloadsPort
  log: (event: LogEvent) => void   // structured logging, tag [JUXBLY][*] (EC §15)
}

/**
 * What the run engine hands a capability for steps 2..N: the step, **plus** the records
 * `input_from` resolved to (stage 1-4). A capability receives its data; it never goes
 * looking for it.
 */
interface CapabilityInput<Step> {
  step: Step
  items: readonly Record<string, unknown>[]
}

/**
 * Port shapes. All are **interfaces** — implementations come from
 * `packages/browser` (chrome) or test mocks / playground stand-ins; capabilities depend on
 * interfaces only and must not touch `chrome.*` (§6.4).
 *
 * Where these live in code: `CapabilityDefinition`, `ExecutionContext`, `RuntimePorts`,
 * `DomPort` and `LlmPort` are `packages/core/src/capability.ts` (the dependency-graph
 * bottom, so runtime and capabilities can both depend on them without a cycle); the
 * storage / clipboard / downloads / messaging port shapes stay in `packages/browser`
 * (§5.5, stage 1-3) and are imported, never restated; `CapabilityRegistry` is
 * `packages/runtime/src/registry.ts` (§6.2).
 */
interface DomPort {
  /**
   * Query within the document (including open shadow roots); closed shadow roots cannot
   * be pierced. Throws on invalid selector syntax — "threw" and "matched nothing" are
   * different answers and map to different `ExtractErrorCode`s (§5.5).
   *
   * `scope` restricts the search to a subtree: field selectors of an `extract` step are
   * relative to the container (§5.2), so without it every row of a list would resolve to
   * the same first match.
   */
  query(selector: string, scope?: Element): Element[]
  /** Container where render results mount — always inside Juxbly's own Shadow DOM (UI_SPEC §11) */
  mountPoint(): HTMLElement
  /** A1: scroll to the bottom to trigger lazy loading; returns whether page height changed */
  scrollToBottom(): Promise<boolean>
}

interface LlmPort {
  /** Implemented only in the background context. api_key never enters the content script (§12) */
  call(step: LlmStep, input: unknown): Promise<{ output: unknown; usage: TokenUsage }>
  /**
   * A3 visual fallback: call a multimodal model with a screenshot as input.
   * Enabled only after the DOM route fails (§9.1 failure escalation chain), and the panel must
   * tell the user that "visual understanding was used this time".
   */
  callVision?(screenshot: string, instruction: string): Promise<{ output: unknown; usage: TokenUsage }>
}

interface ClipboardPort {
  /** Must be triggered by a real user gesture (UI_SPEC §7.3: `Copy` must never execute silently under program control) */
  writeText(text: string): Promise<void>
}

interface DownloadsPort {
  /** Executed via background: the content script only sends messages and never calls chrome.downloads directly */
  download(filename: string, content: string, mime: string): Promise<void>
}

/** Used by `BrowserAdapter.storage`; the only path in the repo allowed to read and write chrome.storage.local */
interface StoragePort {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T): Promise<void>
  /** Data migration hook (called on schema version upgrades) */
  migrate?(fromVersion: number): Promise<void>
}

/** Used by `BrowserAdapter.messaging`; carries all §7.2 message types */
interface MessagingPort {
  send<T extends ExtensionMessage>(msg: ExtensionMessage): Promise<T | null>
  /**
   * Subscribe to messages pushed **into** this context (background → content script,
   * e.g. the shortcut relay). The listener receives `unknown` — messages cross a trust
   * boundary. Returns an unsubscribe function. (Stage 1-8; `send` is request/response
   * and does not cover this direction.)
   */
  onMessage(listener: (message: unknown) => void): () => void
  /** Screenshots are initiated on the background side (A3); the content script only responds and never uploads page content on its own */
  captureTab(): Promise<string>
}
```

### 6.2 Capability registry

```ts
class CapabilityRegistry {
  register(def: CapabilityDefinition<unknown, unknown>): void
  get(type: string): CapabilityDefinition<unknown, unknown> | undefined
  list(): readonly CapabilityDefinition<unknown, unknown>[]
}
```

Registering the same type twice throws: two implementations of one step type would make
the meaning of that step depend on registration order.

V1 registers four capabilities — `extract`, `transform`, `llm` and `render`. `export`
(§6.3's `clipboard.write` / `downloads` consumer) joins at the same call in stage 1-15;
the engine needs no change when it does, which is the point of having a registry.

### 6.3 Permission list

```ts
type CapabilityPermission =
  | 'dom.read'        // extract
  | 'clipboard.write' // export(copy)
  | 'downloads'       // export(csv)
  | 'llm.call'        // llm (BYOK, executed in background only)
  | 'none'            // transform / render (render writes only its own Shadow DOM)
```

### 6.4 Browser Adapter boundary (mandatory)

- `packages/browser` is the **only package that wraps `chrome.*` capability**: chrome API semantics, error handling, and mock stand-ins are defined here; no other location may reach them directly or re-wrap them.
- Capability, Runtime, UI, storage, and llm all depend on the `BrowserAdapter` interface; tests use the mock implementation (the operational form of the EC §5 prohibitions).
- `apps/playground` provides a chrome-free Adapter stand-in backing the Web Corpus benchmarks.
- The sole exception is the entrypoint assembly layer defined in §6.4.1.

**Confirmed minimal set** (interface in §5.5, port shapes in §6.1):

| Port | Platform capability | Permission (§7.3) |
|---|---|---|
| `storage` | `chrome.storage.local` | `storage` |
| `clipboard` | clipboard write | `clipboardWrite` |
| `downloads` | `chrome.downloads.download` | `downloads` |
| `messaging` | runtime messaging, visible-tab capture | none (capture is covered by `activeTab`) |

Nothing `tabs`-shaped is exposed **through the adapter**. URLs arrive through `activeTab`
and the existing message flow, and DOM reads are not an adapter concern at all — they are
injected as `RuntimePorts.dom` (§6.1). The one sanctioned `tabs.*` use is the background
assembly-layer relay in §6.4.1 (`commands.onCommand` → active tab), which needs no
`tabs` permission. Adding a port is a §7.3 permission decision before it is an
interface change.

#### 6.4.1 Entrypoint assembly-layer exception (E1)

MV3's Service Worker / content script / extension page entrypoints **can only be invoked by the platform directly**; an Adapter cannot be injected into them.
Therefore `apps/extension/entrypoints/*` is an **enumerable, assertable assembly-layer exception**, not a loosening of permissions:

| Location | Permitted `chrome.*` | Notes |
|---|---|---|
| `entrypoints/background.ts` | `runtime.onMessage` / `runtime.onInstalled` / `commands.onCommand` / `runtime.getURL` / `tabs.query` / `tabs.sendMessage` | **Registration calls**: listener registration, lifecycle, shortcut reception, locating the extension's own resources (no remote CDN dependency); the two `tabs.*` calls exist **only** to relay a received shortcut to the active tab's content script (stage 1-8) — no `tabs` permission is requested, and no tab metadata is read |
| `entrypoints/content.ts` | **none** | the content script belongs to the UI-side host; all messaging and data reads/writes go through `BrowserAdapter` |
| `entrypoints/popup/**` · `entrypoints/options/**` | **none** | extension pages are also UI-side |

Everything outside the exception — **including the business processing logic inside background itself** — lives in `packages/*` and is injected through ports;
the assembly layer only "catches events and hands them to implementations" and must not carry business rules.

The assembly layer calls these APIs through WXT's `browser` (`wxt/browser`) namespace rather than the `chrome` global: both are the same MV3 platform capability,
and `browser` is just WXT's type-safe wrapper. The guardrails assert on **API paths** (`runtime.onMessage` etc.), independent of namespace,
so switching to `chrome.*` or adding multi-browser targets later cannot bypass them.

The exception is enforced by two guardrails (not by convention):

- ESLint `no-restricted-globals` (`chrome`) is lifted only for `packages/browser/**` and `apps/extension/entrypoints/background.ts`;
- `tests/unit/architecture/chrome-boundary.test.ts` asserts that **every** chrome API appearing in entrypoints is on the list in the table above (a file + API double allowlist; guardrail strength no lower than the previous directory allowlist).

> Expanding this list requires going back through the EC document change protocol; **never** move a call into the assembly layer just because it is "convenient".

---

## 7. MV3 runtime topology

### 7.1 Components and responsibilities

| Component | Location | Responsibilities |
|---|---|---|
| Content Script | per tab, document_idle | floating ball host, chat / run panels (Shadow DOM isolation), highlight layer, page analysis, extract / transform / render / copy execution |
| Background SW | persistent | message routing, llm step execution (BYOK key never enters the page context), storage gateway, CSV download |
| Popup | extension icon | tool overview entry (tools matching the current page + a link to the management page) |
| Options | extension page | BYOK settings (key / endpoint / model), floating ball toggle |

### 7.2 Message protocol (defined in `packages/core`; all via `chrome.runtime.sendMessage`)

```ts
type ExtensionMessage =
  // build (panel → background)
  | { kind: 'build:propose'; requestId: string; conversation: ChatMessage[]; pageAnalysis: PageAnalysis
      /** A3 visual fallback: a screenshot attached only after the DOM route has failed (base64 PNG).
       *  First builds **never carry one** — a screenshot means page pixels leave the machine for the user's own model
       *  endpoint, so it must be an explicit, post-failure remedy rather than the normal path (product document §13 data-flow disclosure) */
      ; screenshot?: string }
  | { kind: 'build:propose_result'; requestId: string; ok: boolean
      ; reply?: ChatMessage; tool?: ToolDefinition
      /** A2 candidates: the model may emit several candidates at once; the content script scores
       *  them locally (§5.6) and presents the best to the user. When absent, degrades to the single `tool` — old behaviour unchanged, backward compatible */
      ; candidates?: ToolDefinition[]
      ; error?: string }
  | { kind: 'build:save_tool'; tool: ToolDefinition }
  // run (content script ↔ background)
  | { kind: 'run:query_tools'; url: string }
  | { kind: 'run:query_tools_result'; tools: ToolDefinition[] }
  | { kind: 'run:llm'; requestId: string; step: LlmStep; input: unknown }
  | { kind: 'run:llm_result'; requestId: string; ok: boolean
      ; output?: unknown; usage?: TokenUsage; error?: string }
  | { kind: 'run:report'; toolId: string; summary: RunSummary }
  // health (content script → background; semantic-layer checks call the model, whose key lives only in background)
  | { kind: 'health:semantic_check'; requestId: string; fields: string[]; sample: unknown[] }
  | { kind: 'health:semantic_check_result'; requestId: string; ok: boolean
      ; verdict?: 'ok' | 'suspicious'; reason?: string; usage?: TokenUsage }
  // export (content script → background)
  | { kind: 'export:download_csv'; filename: string; csv: string }
  | { kind: 'export:download_json'; filename: string; json: string }
  // settings (popup / options ↔ background)
  | { kind: 'settings:get' }
  // Reply carries the public subset only — `api_key` never crosses back (§12). (Stage 1-8)
  | { kind: 'settings:get_result'; floating_ball_enabled: boolean }
  | { kind: 'settings:set'; patch: Partial<Settings> }
  // internal: channel availability check, **not business protocol**.
  // The `internal:` prefix is namespaced away from `build:*` / `run:*` / `health:*` / `export:*` / `settings:*`,
  // so verification messages cannot be misread as business semantics in later stages.
  | { kind: 'internal:ping' }
  | { kind: 'internal:pong'; ok: true }
  // internal: shortcut relay, background → content via `tabs.sendMessage` (§6.4.1). (Stage 1-8)
  | { kind: 'internal:command'; command: string }

interface TokenUsage { prompt_tokens: number; completion_tokens: number }  // shown transparently in the panel
```

Adding message types is allowed; changing the semantics of existing fields must go through the EC document change protocol.

> **Landing cadence**: this union is the **target shape**, landing gradually as each stage delivers — stage 0-3 lands only `internal:ping` / `internal:pong` in `packages/core` (payload types for the other messages do not exist yet),
> 1-1 lands `build:*` / `run:*` together with the DSL types, and 1-6 / 1-9 / 1-10 / 1-11 / 1-13 fill in the rest. **Existing field semantics are not modified.**

### 7.3 Manifest permission list

```json
{
  "permissions": ["storage", "activeTab", "clipboardWrite", "downloads"],
  "host_permissions": ["<all_urls>"]
}
```

`<all_urls>` covers both content script injection and background fetches to BYOK custom endpoints. **Not requested**: `tabs` (URLs come via `activeTab` + the existing message flow), `scripting` (no programmatic injection), `webRequest`.

> This section operationalises the product document (V1.12) §13 "Permission policy (V1.12 changes)": the Open Source Build declares `<all_urls>` statically; the Store Build narrows it through the Policy Surface into optional host_permissions (requested on demand by URL Pattern when a tool is saved). Neither build requests `tabs` / `scripting` / `webRequest`.

---

## 8. Storage contracts (chrome.storage.local)

### 8.1 Keys and structures

```ts
// 'juxbly:tools' → Record<tool_id, ToolRecord>
interface ToolRecord {
  tool_id: string
  definition: ToolDefinition       // currently active version
  versions: ToolVersion[]          // full history (including current); old versions are never deleted
  health: ToolHealth
  run_state: RunState              // needed for the llm cache decision + the A5 diff data port (V1.1)
  usage: ToolUsage                 // local usage stats (management page + stats panel); no tiered decay in V1
  created_at: string
  updated_at: string
}

interface ToolVersion {
  version: number
  definition: ToolDefinition
  note: string                     // creation / repair reason
  /**
   * Whether this version has ever been broken — a **factual record**, not UI state.
   * V1 ships no version-switcher UI and no "was broken" badge: the rollback
   * entry lives in the open-source settings panel, and V1 users have few tools, so a dedicated
   * management UI is not worth it.
   * The field stays because it is a zero-cost historical fact — no backfill needed when V2 builds version UI.
   */
  ever_broken: boolean
  created_at: string
}

type HealthStatus = 'healthy' | 'degraded' | 'broken'

interface ToolHealth {
  status: HealthStatus
  recent_runs: RunSummary[]        // rolling window of the last 10 runs
  /** Structure fingerprint baseline: captured on the first successful run, then used for structural drift detection (implemented in V1, see §10) */
  structure_fingerprint: StructureFingerprint | null
  /** Most recent semantic-layer check result (implemented in V1, see §10) */
  last_semantic_check: SemanticCheck | null
}

/**
 * Lightweight structure fingerprint: stores only comparable statistical features — no DOM snapshots,
 * no page content. Judges "has the page structure visibly drifted"; a single DOM mutation never
 * directly marks a tool broken (product document §6.4).
 *
 * V1 judgement scope: **only the `container_count` and `field_presence` signals**.
 * `tag_path` is still captured but **does not participate in V1 judgement** — it needs per-site threshold
 * calibration, and V1 lacks enough real data; enabling it early would only manufacture false positives,
 * and false positives hurt more than misses (the "suspected breakage never interrupts" discipline of
 * product document §6.2).
 * Thresholds must never be tuned to make metrics look good (same discipline as product document §3.8.6).
 */
interface StructureFingerprint {
  captured_at: string
  container_count: number                    // hit count of the repeating unit container (counts in V1 judgement)
  tag_path: string                           // tag path of the first matching container (index-stripped) (recorded only; not part of V1 judgement)
  field_presence: Record<string, number>     // field name → presence ratio (0–1) (counts in V1 judgement)
}

interface SemanticCheck {
  at: string
  verdict: 'ok' | 'suspicious'
  reason: string
  usage?: TokenUsage                         // semantic checks consume tokens too; must be transparent
}

/** Minimal state: stores only "was there data + a shape digest", never the full data (failure design §2) */
interface RunSummary {
  at: string
  had_data: boolean
  item_count: number
  field_digest: Record<string, string>   // field name → shape digest, e.g. "numeric" / "text"
}

interface RunState {
  last_extract_hash: string | null          // hash of the last extract output
  last_llm_outputs: Record<string, unknown> // llm step output_to → last output

  /**
   * Data port for the A5 "last run vs this run" diff.
   * **V1 defines the structure only — nothing is written or read**; that work belongs to V1.1.
   *
   * Why define it now: it is a storage structure, and adding it later in V1.1 would trigger a data
   * migration. Leaving the port costs one type line; not leaving it costs migrating old records.
   *
   * Why in `RunState` and not `RunSummary`: `RunSummary` is a rolling window of the last 10 runs —
   * storing it there would mean 10 fingerprint copies; the diff needs only "the last one", and
   * `RunState` is precisely "the state left by the last run".
   *
   * Content conventions (effective when V1.1 lands):
   *   - each result records one fingerprint string (a short hash over concatenated key field values),
   *     **not the result data itself**;
   *   - consistent with the `RunSummary` "minimal state" discipline: **no page content, no full results**;
   *   - roughly 1–3 KB per tool — not enough to trigger the §8.2 usage governance;
   *   - the fingerprint strategy (whether ExtractStep needs a stable identifier field) is a V1.1
   *     decision; V1 presets nothing.
   */
  last_result_fingerprints?: string[]
}

/**
 * Local usage stats.
 *
 * Purpose narrowed: originally fed the Appear intensity tiers (Active / Quiet / Archived). V1 cut
 * tiered decay — V1 users have no 30-day usage history yet, so tiering logic would be dead code.
 * Two uses remain in V1: **management page stats** (`UI_SPEC` §7.2) and the **local usage stats panel** (A7).
 *
 * The `archived` field is removed: its only consumer was the tiering mechanism; with the mechanism
 * gone the field is meaningless. If V2 restores tiering, it returns as an **added optional field**;
 * existing records need no migration.
 *
 * Lifecycle:
 *   - writes: run_count / last_run_at are written by the run layer on every run:report;
 *             export_count / last_export_at are written by the export capability on successful export.
 *   - reads: the overview page stats area and the local usage stats panel.
 *             "Recently used" takes the **more recent** of last_run_at and last_export_at —
 *             exporting without running is just as real a use.
 *   - defaults: every field has a default; old records need no migration.
 *
 * Constraints: purely local; never uploaded, aggregated, exported into Recipes, or logged
 * (product document §13 permanent zero telemetry). Like `RunSummary`, **stores no result data and no page content**.
 */
interface ToolUsage {
  last_run_at: string | null      // ISO 8601; null before the first run
  run_count: number               // total run count; defaults to 0
  last_export_at: string | null   // most recent export; defaults to null
  export_count: number            // total export count; defaults to 0
}

// 'juxbly:settings' → Settings
interface Settings {
  api_key: string | null        // BYOK; read only by background, stored encrypted
  api_base_url: string | null   // any OpenAI-compatible endpoint (OpenAI / OpenRouter / local gateway); defaults to https://api.openai.com/v1
  model: string | null
  floating_ball_enabled: boolean
}

// 'juxbly:onboarding' → OnboardingFlags (four one-shot milestones, product document §9)
interface OnboardingFlags {
  first_install_glow_shown: boolean
  first_chat_opened: boolean
  api_key_requested: boolean
  first_tool_built: boolean
}
```

### 8.2 Usage constraints

The `recent_runs` rolling window holds 10 entries; `versions` is uncapped but a single tool's DSL is small (KB scale), so no V1 governance is needed.

`ToolUsage` is a fixed 4 scalars (about 80 bytes per tool), growing linearly with tool count — no V1 governance needed. **It stores no result data and no page content** (the same "minimal state" discipline as `RunSummary`, product document §13).

`RunState.last_result_fingerprints` (the A5 diff data port, enabled in V1.1) is one fingerprint set per tool, roughly 1–3 KB. It likewise **stores no result data and no page content**, grows linearly with tool count, and needs no V1 governance.

---

## 9. Core data flows

### 9.1 Build flow (with highlight confirmation; per build flow design §2/§3)

```text
Floating ball idle → user input → (cs) analyzePage: visible text + structural features
  + dynamic custom-element tag scan + shadow interior expansion (the M0 repair item, mandatory)
  + infinite scroll / load-more signal (A1, input for the pre_scroll decision)
→ (cs→bg) build:propose (page content wrapped as a data section in the prompt — prompt-injection defence)
→ bg composes the prompt and calls BYOK → clarification questions (≤2 rounds) or a ToolDefinition draft / **candidate array** (A2)
→ (cs) validateToolDefinition (validates each candidate; invalid ones are eliminated)
→ (cs) evaluateCandidates: local trial-run scoring picks the best (A2, **zero tokens**)
→ (cs) the highlight layer renders each field selector of the best candidate + panel text explanation
→ user: confirm / click to correct (updating the proposal) / re-describe (back to clarification)
→ build:save_tool (bg validates then persists, version=1) → first render → run mode

Failure escalation chain (A4; replaces the old "retry once then stop"; revised per the A4 spike measurements):
  ① All candidates eliminated / hit count 0
       → swap candidates or regenerate (more conservative prompt), at most once.
         **Check for distinctness before retrying**: if the new candidate is materially the same as an
         already-evaluated candidate (e.g. identical container selector), the retry is void and does
         not consume this attempt — the spike showed the same model can emit three identical outputs
         for the same page.
       → **Carry the best candidate across levels** (replacing the old "last level wins"): escalation
         must not discard an already-verified better candidate; the final proposal = the highest
         locally scored candidate across all levels. The spike showed "last level wins" could retry
         a partial into a wrong (a net loss — the mdn case).
  ② Still failing and the page is judged DOM-route-unfriendly (hashed classes / Canvas / complex SPA)
       → A3 visual fallback: call a multimodal model with a screenshot attached and tell the user in
         the panel that "visual understanding was used this time"
         ⚠ **This level's effectiveness is not yet engineering-verified** (no multimodal endpoint was
         available during the spike). Until Phase 2 verification completes, external documents must
         not promise "the visual fallback covers SPA / hashed-class pages".
  ③ Still failing and the user has configured a stronger model
       → suggest switching to the stronger model and retrying once
         ⚠ likewise **unverified** (the spike's model endpoint mapping made this level unmeasurable).
  ④ Still failing
       → concrete advice (narrow the scope / reword the description / honestly say the page is too
         complex); **stop here, no infinite retries**

> Why "give up" moved from the second failure to the fourth: the target audience "can code, just
> can't be bothered" — the escape hatch is at hand.
> After two failures they are still here; by the third they have gone back to writing a script.
> Every escalation level must be **visible in the panel** (which step we are on, and why); silent
> retries are not allowed (§11 degradation strategy).
>
> A4 spike data (10-site sample): within measurable range, ① added only +10% (and carried the
> mdn net-loss case); ② ③ untested; the largest observed single improvement came from analyzer
> field-level candidates (L0 20% → 30%).
> **A4 is a mechanism for avoiding net loss, not the main engine for raising accuracy — the main engine is the stage 1-2 analyzer.**

```

### 9.2 Run flow (per run-phase presentation design §2/§3)

```text
Page load → (cs) run:query_tools(location.href) → bg runs matchUrl → returns the tool list
→ (cs) runs extract (on every refresh; free, local)
→ hash(extract output) compared against run_state.last_extract_hash:
    unchanged → reuse last_llm_outputs, skip the llm step
    changed / first run → (cs→bg) run:llm → returns output + TokenUsage
→ transform (local, always runs) → render (local)
→ floating panel display (view switching = local re-render; extract/llm do not re-run)
→ run:report sends RunSummary → health evaluation (execution / result / structure-fingerprint layers judged locally;
     the semantic layer calls the model via background only when triggered, see §10)
Manual refresh button: forces the full flow (including llm).
Every real llm call (including semantic-layer checks) shows a token usage estimate in the panel (BYOK transparency).
```

### 9.3 Breakage and repair flow (per the breakage and iteration interaction design)

```text
After a run, evaluateHealth (four layers, see §10):
  extract throws (selector syntax / container gone)        → broken   → error state + CTA
  result pattern deviates from baseline (drops to 0 / odd field shapes) → degraded → subtle badge hint, no interruption
  structure fingerprint drift (container count / tag path / field presence) → degraded (can escalate to broken when it and the result layer are both off)
  semantic layer judges "the grabbed content is not the wanted content" → the escalation basis for degraded (triggered calls, throttled)
CTA → enter build mode (preset context message: "This tool has recently returned empty results…")
→ reuse the full §9.1 flow → new version (version+1; the old version is kept and marked ever_broken)
Two failures → stop: concrete advice, no infinite retries.
V1 has no silent auto-repair; a repair always produces a new version, and rollback is possible.
```

---

## 10. Health state machine

V1 scope of the four-layer checks: **execution, result, structure-fingerprint, and semantic layers — all four are implemented in V1**. The earlier wording "structure fingerprint as a reserved interface, semantic layer in v2" is void.

| Layer | Signal | Maps to | Consumes tokens |
|---|---|---|---|
| Execution | extract throws (selector syntax error / container gone) | → `broken` | no |
| Result | pattern deviation from the `recent_runs` baseline (item count collapses, odd field shapes) | → `degraded` | no |
| Structure fingerprint | drift from the `structure_fingerprint` baseline — **V1 uses only the container count and field presence signals**; `tag_path` is recorded but does not participate in judgement (§8.1) | → `degraded` (can escalate to `broken` when the drift is pronounced and the result layer is off at the same time) | no |
| Semantic | the model judges whether "elements were hit" equals "the right content was obtained" | serves as the **escalation basis** for `degraded` → `broken`; produces no state on its own | **yes** (via background; must be shown transparently) |

> The semantic layer is the only one of the four that calls the model, so it **does not run on every execution**. Trigger principle (a constraint at this document's level):
> the semantic check fires only when execution- and result-layer signals are normal but the structure-fingerprint layer has judged `degraded`, or when the result layer deviates repeatedly with no explanation in `run_state` changes;
> triggering is throttled per tool (the minimum interval is defined by an implementation constant, no per-site configuration).
> Implementation details land with the corresponding stage, but **the judgement signals and state mapping follow this section**.

```text
                      extract throws ───────────────┐
                                                    ▼
                                                 broken
                                                    ▲
                                                    │ semantic layer judges suspicious
                                                    │ (triggered, consumes tokens)
                 extract throws                      │
    ┌───────────────────────────────┐               │
    │                               ▼               │
healthy ──── result pattern drift ──→ degraded ─────┘
    ▲            ▲                  │
    │            └── fingerprint drift ──┤ historical pattern restored twice in a row
    │                               │
    └── repaired version confirmed ──┘

Repair success: the new version starts from healthy; old versions keep versions[].ever_broken = true
```

> The diagram above includes the two previously missing edges (structure fingerprint → degraded, semantic layer → broken);
> it is consistent with this section's table.

---

## 11. Error and degradation strategy

| Layer | Strategy |
|---|---|
| DSL validation failure (before save / before execution) | reject with concrete field-level reasons; no silent degradation |
| Build failure | retry once (conservative prompt) → concrete advice → stop |
| Runtime extract failure | broken state + CTA; no system notifications (passive display) |
| llm call failure (network / quota) | panel error state + keep the last cached output for viewing + a manual refresh entry |
| Storage read/write failure | log `[JUXBLY][STORAGE]` + a panel hint; never crash the host page |
| Any UI exception | the panel falls back to the floating ball state; host page interaction is never blocked |

---

## 12. Security boundaries

1. **No dynamic code**: no `eval` / `new Function` / remote code loading anywhere in the repo; MV3 default CSP, not relaxed.
2. **BYOK data flow**: api_key is stored only in `chrome.storage.local` (encrypted) and used only in the background SW; **it never enters the content script, the page context, or logs**.
3. **Indirect prompt-injection defence**: in llm step prompts, page content passed in from extract is always wrapped as a data section, not instructions (build flow design §3.3; implemented jointly by M2 and prompt engineering).
4. **DSL double validation**: validated once before save and once before execution (§5.4).
5. **Permission convergence**: capabilities declare permissions through the Runtime (§6.3); the Store Build's Policy Surface narrows from the same Core — the open-source core is not pre-capped for the CWS.
6. **Regex safety**: regex in the DSL passes the safe-subset check, guarding against ReDoS.
7. **No silent repair**: a broken tool is never quietly rewritten in the background; repair produces a **new, user-confirmed version** and keeps old versions for rollback (a red line; external wording in `SECURITY.md`).

---

## 13. Test architecture

| Layer | Scope | Location |
|---|---|---|
| Unit | DSL validation rules, url_pattern matching, the four transform ops, the llm cache decision (hash comparison), health state machine transitions, **structure fingerprint comparison**, **semantic layer judgement (mock semantic port)** | `tests/unit/` |
| Integration | ToolRuntime end-to-end (fixture HTML + mock BrowserAdapter + mock LlmPort) | `tests/integration/` |
| Benchmark | Web Corpus real-site snapshots + Task Corpus + Ground Truth (established in Phase 2; the runner runs in apps/playground) | `tests/benchmark/` |
| Regression | trigger: any change to `packages/dsl`, `packages/runtime`, `packages/capabilities`, or `packages/health` (EC §16) | CI |

---

## 14. Evolution strategy (reserved extension points)

| Extension | Mechanism | Introduced |
|---|---|---|
| New transform op (limit / rename / computed) | `TransformOp` enum extension + op-specific parameter validation | as needed |
| New LLM task | `LlmTask` enum extension | as needed |
| Chart view | `RenderStep.view` extended with `'chart'` | v2 |
| Conditional / loop steps | new `type` added to the `ToolStep` union (reserved in build flow design §3.7; explicitly not implemented in V1) | v2+ |
| DSL top-level triggers / context / state / outputs / actions / orchestration | optional fields added to ToolDefinition (EC §6) | v2+, staying backward compatible |
| **Local model (Chrome Prompt API)** | a local implementation added to `LlmPort` (`chrome.languageModel`) | **V1.1** (moved up from v2) |
| **A5 "last run vs this run" diff** | enable `RunState.last_result_fingerprints` (data port already reserved in §8.1) | **V1.1** (originally a Phase 4 candidate) |
| **`monitor` category returns** | `'monitor'` added to the `ToolCategory` enum, landing together with Orchestration scheduling | v2, additive and backward compatible |

> **Why the local model moved up**: Chrome 138 (2026-04) opened `chrome.languageModel`
> (Gemini Nano) to extensions and simplified the opt-in flow. It is a **fallback path** — it only
> handles "get running with zero configuration" and carries none of the core build quality; users
> who want stronger results are then guided to configure BYOK. The value is not saving money but
> **removing the configuration barrier at first use**:
> the steepest cut in the product funnel.

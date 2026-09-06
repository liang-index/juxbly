/**
 * Tool DSL types — `docs/ARCHITECTURE.md` §5.1 / §5.2, transcribed directly. That
 * section is the single authoritative definition; this file adds no fields and renames
 * nothing.
 *
 * DSL JSON fields are snake_case, identical to storage and LLM output — there is no
 * renaming layer (`docs/ARCHITECTURE.md` §5 preface). TS identifiers follow EC §10.
 */

/**
 * V1 has exactly 4 categories. `monitor` was removed: monitoring needs
 * scheduled / background execution (Orchestration), which V1 does not do, so no V1
 * capability can produce such a tool — keeping the value would only invite the LLM to
 * emit tools nothing can execute. V2 brings it back as a pure enum addition, which is
 * backward compatible.
 */
export type ToolCategory = 'data' | 'enhance' | 'analyze' | 'export'

export interface ToolDefinition {
  /** Stable identifier, e.g. "tool_8f3a2b". */
  tool_id: string
  /** Human-readable name, e.g. "Price extractor". */
  name: string
  description?: string
  /** Suggested by the LLM at build time; the user can change it. */
  category: ToolCategory
  /** Glob pattern; matching semantics in §5.3. */
  url_pattern: string
  /** Starts at 1; +1 on every repair or edit. */
  version: number
  /** V1 executes steps linearly. */
  steps: ToolStep[]
  created_at: string
  updated_at: string
}

export type ToolStep = ExtractStep | TransformStep | LlmStep | RenderStep | ExportStep

/** Field data type — decides extraction and the default view suggestion. */
export type FieldType = 'text' | 'image' | 'link'

/**
 * Scroll preparation before extraction (A1).
 *
 * Why it exists: most list pages in 2026 load content on scroll, so analysing only the
 * first screen yields "20 of 500 items" — a tool that works but is useless. This is a
 * DOM *preparation* inside extract, not an Act/Orchestrate capability: no click, no
 * navigation, so the "no control flow in the DSL" principle still holds.
 *
 * V1 implements `to_bottom` only (pure scrolling, zero new permissions); `click_more`
 * needs an Act capability and stays out.
 */
export interface PreScroll {
  mode: 'to_bottom'
  /** Max scroll rounds, default 3. Stops early when page height stops growing. */
  max?: number
  /** Wait after each scroll, default 400 ms, so lazy content can render. */
  settle_ms?: number
}

export interface ExtractStep {
  type: 'extract'
  mode: 'single' | 'list'
  /** list mode: CSS selector of the repeating-unit container; omitted in single mode. */
  selector?: string
  /** Field name → CSS selector (relative to selector; relative to the document in single mode). */
  fields: Record<string, string>
  /** Type hints, default all text. image reads src/alt, link reads href. */
  field_types?: Partial<Record<string, FieldType>>
  /** Scroll before extracting. Absent ≡ take only what is already rendered. */
  pre_scroll?: PreScroll
  /** Variable name to write, e.g. "raw_items". */
  output_to: string
}

export type ConditionOp =
  | '>'
  | '>='
  | '<'
  | '<='
  | '=='
  | '!='
  | 'contains'
  | 'starts_with'
  | 'ends_with'
  /** A regular expression; must pass the safety check (§5.4 rule 6). */
  | 'matches'

export interface FilterCondition {
  field: string
  op: ConditionOp
  value: string | number
}

export type TransformOp = 'filter' | 'sort' | 'regex' | 'dedupe'

export interface TransformStep {
  type: 'transform'
  op: TransformOp
  input_from: string
  output_to: string
  // op-specific parameters; completeness rules in §5.4 rule 5
  /** filter: required. */
  condition?: FilterCondition
  /** sort / regex / dedupe target field. */
  field?: string
  /** sort: required. */
  order?: 'asc' | 'desc'
  /** regex: required; RE2-style safe subset only. */
  pattern?: string
  /** regex: capture group to use, default 0 (whole match). */
  group?: number
}

export type LlmTask = 'summarize' | 'translate' | 'classify' | 'sentiment' | 'custom'

export interface LlmStep {
  type: 'llm'
  task: LlmTask
  input_from: string
  output_to: string
  /** Required for task "custom"; optional extra guidance otherwise. */
  prompt?: string
  /** Required for task "translate". */
  target_lang?: string
}

export interface RenderStep {
  type: 'render'
  /** V1 ships three views; charts stay out. */
  view: 'table' | 'card' | 'text'
  input_from: string
}

export interface ExportStep {
  type: 'export'
  /** json and csv both go through downloads — no extra permission. */
  format: 'copy' | 'csv' | 'json'
  input_from: string
}

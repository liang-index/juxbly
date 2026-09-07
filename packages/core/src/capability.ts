/**
 * Capability Runtime contracts — `docs/ARCHITECTURE.md` §6.1 / §6.3, transcribed.
 *
 * These shapes are the contract every capability is written against, so they live in the
 * dependency-graph bottom (`packages/core`) where both `packages/runtime` (the registry
 * and the run engine) and `packages/capabilities` (the implementations) can depend on
 * them without a cycle.
 *
 * The port shapes (`ClipboardPort`, `DownloadsPort`, `StoragePort`, `MessagingPort`) are
 * **reused** from `@juxbly/browser` rather than restated here. They are one contract in
 * two places only if someone copies them; importing keeps the single definition. The
 * import is type-only, so it erases at compile time and leaves `packages/core` free of
 * runtime dependencies.
 */
import type { ClipboardPort, DownloadsPort } from '@juxbly/browser'
import type { LlmStep, ToolStep } from '@juxbly/dsl'
import type { LogEvent } from './logger'
import type { TokenUsage } from './messages'

/**
 * A JSON Schema (draft-07) document. Typed structurally: pulling in a JSON Schema library
 * for a shape nobody validates at runtime yet would cost more than it buys, and the
 * field-by-field validation that actually runs lives in `validateToolDefinition` (§5.4).
 */
export type JsonSchema = Record<string, unknown>

/** §6.3 — the complete V1 list. `none` is not "unset", it is the answer. */
export type CapabilityPermission =
  | 'dom.read'
  | 'clipboard.write'
  | 'downloads'
  | 'llm.call'
  | 'none'

/**
 * §6.1. `I` is what the runtime hands the capability, `O` what it hands back.
 *
 * Every capability declares its permissions and its security notes: contributing one
 * without them is rejected in review (CONVENTIONS §5), so the fields are not optional.
 */
export interface CapabilityDefinition<I, O> {
  type: ToolStep['type']
  /** Semantic version of the *implementation*, not of the DSL. */
  version: string
  inputSchema: JsonSchema
  outputSchema: JsonSchema
  permissions: CapabilityPermission[]
  securityNotes: string
  execute(input: I, ctx: ExecutionContext): Promise<O>
}

export interface ExecutionContext {
  tabId: number
  /** Cancelled when the page navigates or the panel closes — long work must observe it. */
  signal: AbortSignal
  /** The only way a capability reaches anything outside itself. */
  ports: RuntimePorts
}

export interface RuntimePorts {
  /** Injected in the content-script context only. */
  dom: DomPort
  /** BYOK calls, executed through the background context. */
  llm: LlmPort
  clipboard: ClipboardPort
  downloads: DownloadsPort
  log: (event: LogEvent) => void
}

export interface DomPort {
  /**
   * Queries the document including open shadow roots; closed roots cannot be pierced.
   *
   * Throws on invalid selector syntax: "threw" and "matched nothing" are different
   * answers, and §5.5 `ExtractErrorCode` has a code for each.
   *
   * `scope` restricts the search to a subtree, because field selectors of an `extract`
   * step are relative to the container (§5.2) — without it every row of a list would
   * resolve to the same first match.
   */
  query(selector: string, scope?: Element): Element[]
  /** Where render results mount — always inside Juxbly's own Shadow DOM (UI_SPEC §11). */
  mountPoint(): HTMLElement
  /** A1: scroll to the bottom to trigger lazy loading; returns whether the height changed. */
  scrollToBottom(): Promise<boolean>
}

export interface LlmPort {
  /** Implemented in the background context only; the key never enters the page. */
  call(step: LlmStep, input: unknown): Promise<{ output: unknown; usage: TokenUsage }>
  /**
   * A3 visual fallback: a multimodal call with a screenshot as input. Only after the DOM
   * route has failed, and the panel must say so (§9.1).
   */
  callVision?(screenshot: string, instruction: string): Promise<{ output: unknown; usage: TokenUsage }>
}

/**
 * Stage 1-4 resolves a step's `input_from` into records before calling a capability, so
 * what a capability receives is the step **and** the data it operates on. Passing the step
 * alone would leave every implementation to invent its own way of getting the rows.
 */
export interface CapabilityInput<Step> {
  step: Step
  items: readonly Record<string, unknown>[]
}

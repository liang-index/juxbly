/**
 * Cross-context message protocol — `docs/ARCHITECTURE.md` §7.2. All of it travels over
 * the runtime messaging channel (via `BrowserAdapter.messaging`).
 *
 * The union below is the target shape. Stage 0-3 shipped only the channel probe; stage
 * 1-1 lands the rest now that the payload types exist (§5.5, §5.1/§5.2, §8.1).
 * Appending message kinds is allowed; changing the meaning of existing fields goes
 * through the doc change protocol.
 *
 * Types only. DSL types come in through `import type` (erased at compile time).
 */
import type { LlmStep, ToolDefinition } from '@juxbly/dsl'
import type { ChatMessage, PageAnalysis } from './runtime'
import type { OnboardingFlags, RunState, RunSummary, Settings } from './tool-record'

/** Shown in the panel for every real llm call (BYOK transparency). */
export interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
}

export type ExtensionMessage =
  // Build (panel → background)
  | {
      kind: 'build:propose'
      requestId: string
      conversation: ChatMessage[]
      pageAnalysis: PageAnalysis
      /**
       * A4 level ①: true on the single conservative retry, asking the model for the
       * plainest, most literal reading of the page instead of a clever one.
       */
      conservative?: boolean
      /**
       * The clarification cap reaching the prompt: the model must answer with a draft
       * instead of another question. The cap is enforced in the panel as well — a prompt
       * is a request, the cap is a rule (§9.1).
       */
      noMoreQuestions?: boolean
      /**
       * A3 visual fallback: screenshot attached only after the DOM route
       * failed (base64 PNG). First builds never carry one — a screenshot means page
       * pixels leave this machine for the user's own endpoint, so it must be an
       * explicit, failure-triggered remediation, never the default path.
       */
      screenshot?: string
    }
  | {
      kind: 'build:propose_result'
      requestId: string
      ok: boolean
      reply?: ChatMessage
      tool?: ToolDefinition
      /**
       * What the call cost. BYOK transparency (UI_SPEC §9 rule 4): every real model call
       * is paid for by the user, so the panel shows it even when the answer is a question.
       */
      usage?: TokenUsage
      /**
       * A2 candidates: the model may return several; the content script
       * scores them locally (§5.6) and presents the best. Absent → fall back to `tool`;
       * old behaviour unchanged, backward compatible.
       */
      candidates?: ToolDefinition[]
      error?: string
    }
  | { kind: 'build:save_tool'; tool: ToolDefinition }
  /**
   * The reply to `build:save_tool`. Storage is the background's to write (§7.1), so the
   * content script has to be told whether it worked — a save that silently failed would
   * leave the user with a tool they believe they have.
   */
  | { kind: 'build:save_tool_result'; ok: boolean; error?: string }
  // Run (content script ↔ background)
  | { kind: 'run:query_tools'; url: string }
  | { kind: 'run:query_tools_result'; tools: ToolDefinition[] }
  | { kind: 'run:llm'; requestId: string; step: LlmStep; input: unknown }
  | {
      kind: 'run:llm_result'
      requestId: string
      ok: boolean
      output?: unknown
      usage?: TokenUsage
      error?: string
    }
  /**
   * The run layer's closing message (stage 1-10). `summary` feeds Tool Health, `runState`
   * is what the next run starts from (§8.1: the llm cache decision lives in the record,
   * and only the content script has executed the steps that produced it), and `ok` is
   * what separates "the tool worked" from "the tool ran and failed" — the two cases
   * differ in what the background is allowed to conclude from them.
   */
  | { kind: 'run:report'; toolId: string; summary: RunSummary; ok?: boolean; runState?: RunState }
  /**
   * The mirror of `run:report`: a run starts by asking what the previous one left behind.
   * Without it the content script would rebuild the run state from scratch on every page
   * load, and an unchanged page would pay for the same model call again and again.
   */
  | { kind: 'run:load_state'; toolId: string }
  | { kind: 'run:load_state_result'; toolId: string; runState: RunState | null }
  /**
   * "Don't keep" on the retention line (UI_SPEC §7.3) — the first writer of the delete
   * path. Stage 1-13 reuses it from the management surface.
   */
  | { kind: 'tool:delete'; toolId: string }
  | { kind: 'tool:delete_result'; ok: boolean; toolId: string; error?: string }
  /**
   * The four one-shot milestones (§8.1). The content script cannot read storage, and the
   * run panel needs `first_tool_built` to choose the promise line — so the flags are
   * asked for, exactly like settings. No secret travels in either direction.
   */
  | { kind: 'onboarding:get' }
  | { kind: 'onboarding:get_result'; flags: OnboardingFlags | null }
  // Health (content script → background; the semantic check calls the model, key stays in background)
  | { kind: 'health:semantic_check'; requestId: string; fields: string[]; sample: unknown[] }
  | {
      kind: 'health:semantic_check_result'
      requestId: string
      ok: boolean
      verdict?: 'ok' | 'suspicious'
      reason?: string
      usage?: TokenUsage
    }
  // Export (content script → background)
  | { kind: 'export:download_csv'; filename: string; csv: string }
  | { kind: 'export:download_json'; filename: string; json: string }
  // Settings (popup / options ↔ background)
  | { kind: 'settings:get' }
  | {
      kind: 'settings:get_result'
      /**
       * The public subset only. The BYOK key never crosses back to a content script, so
       * the reply is a flat allowlist, not a `Settings` object (stage 1-8; §12).
       */
      floating_ball_enabled: boolean
    }
  | { kind: 'settings:set'; patch: Partial<Settings> }
  // Internal: channel probe, NOT business protocol.
  // The `internal:` prefix keeps it out of the business namespaces so a later stage
  // cannot mistake it for a real protocol message.
  | { kind: 'internal:ping' }
  | { kind: 'internal:pong'; ok: true }
  // Internal: background → content command forwarding. `commands.onCommand` only fires
  // in the service worker, so the shortcut is relayed to the active tab (stage 1-8).
  | { kind: 'internal:command'; command: string }

export type InternalPing = Extract<ExtensionMessage, { kind: 'internal:ping' }>
export type InternalPong = Extract<ExtensionMessage, { kind: 'internal:pong' }>

/** The llm step's cross-context hop: the content script has no key, so it asks (§7.1). */
export type RunLlmMessage = Extract<ExtensionMessage, { kind: 'run:llm' }>
export type RunLlmResultMessage = Extract<ExtensionMessage, { kind: 'run:llm_result' }>

/** The run layer's messages (stage 1-10, §7.2). */
export type RunQueryToolsMessage = Extract<ExtensionMessage, { kind: 'run:query_tools' }>
export type RunQueryToolsResultMessage = Extract<ExtensionMessage, {
  kind: 'run:query_tools_result'
}>
export type RunReportMessage = Extract<ExtensionMessage, { kind: 'run:report' }>
export type RunLoadStateMessage = Extract<ExtensionMessage, { kind: 'run:load_state' }>
export type RunLoadStateResultMessage = Extract<ExtensionMessage, { kind: 'run:load_state_result' }>
export type ToolDeleteMessage = Extract<ExtensionMessage, { kind: 'tool:delete' }>
export type ToolDeleteResultMessage = Extract<ExtensionMessage, { kind: 'tool:delete_result' }>
export type OnboardingGetResultMessage = Extract<ExtensionMessage, {
  kind: 'onboarding:get_result'
}>

export type BuildProposeMessage = Extract<ExtensionMessage, { kind: 'build:propose' }>
export type BuildProposeResultMessage = Extract<ExtensionMessage, { kind: 'build:propose_result' }>
export type BuildSaveToolMessage = Extract<ExtensionMessage, { kind: 'build:save_tool' }>
export type BuildSaveToolResultMessage = Extract<ExtensionMessage, { kind: 'build:save_tool_result' }>

/**
 * Messages cross a trust boundary: anything that arrives over the runtime message
 * channel is `unknown` until proven otherwise.
 */
function hasKind(message: unknown, kind: ExtensionMessage['kind']): boolean {
  return (
    typeof message === 'object' && message !== null && (message as { kind?: unknown }).kind === kind
  )
}

export function isPing(message: unknown): message is InternalPing {
  return hasKind(message, 'internal:ping')
}

export function isPong(message: unknown): message is InternalPong {
  return hasKind(message, 'internal:pong')
}

export function isRunLlm(message: unknown): message is RunLlmMessage {
  return hasKind(message, 'run:llm')
}

/** The run layer's three panel → background messages (§7.2). */
export function isRunQueryTools(message: unknown): message is RunQueryToolsMessage {
  return hasKind(message, 'run:query_tools')
}

export function isRunReport(message: unknown): message is RunReportMessage {
  return hasKind(message, 'run:report')
}

export function isRunLoadState(message: unknown): message is RunLoadStateMessage {
  return hasKind(message, 'run:load_state')
}

export function isToolDelete(message: unknown): message is ToolDeleteMessage {
  return hasKind(message, 'tool:delete')
}

/** The build flow's two panel → background messages (§7.2). */
export function isBuildPropose(message: unknown): message is BuildProposeMessage {
  return hasKind(message, 'build:propose')
}

export function isBuildSaveTool(message: unknown): message is BuildSaveToolMessage {
  return hasKind(message, 'build:save_tool')
}

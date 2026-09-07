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
import type { RunSummary, Settings } from './tool-record'

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
       * A2 candidates: the model may return several; the content script
       * scores them locally (§5.6) and presents the best. Absent → fall back to `tool`;
       * old behaviour unchanged, backward compatible.
       */
      candidates?: ToolDefinition[]
      error?: string
    }
  | { kind: 'build:save_tool'; tool: ToolDefinition }
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
  | { kind: 'run:report'; toolId: string; summary: RunSummary }
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

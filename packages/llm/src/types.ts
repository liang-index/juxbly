/**
 * BYOK client contracts — `docs/ARCHITECTURE.md` §5.5 (LLM package contracts).
 *
 * `LlmPort` itself is transcribed **once**, in `packages/core/src/capability.ts`
 * (§6.1, together with the rest of `RuntimePorts` — the dependency-graph bottom that
 * both `packages/runtime` and `packages/capabilities` share). Re-exported here so this
 * package's consumers and the mock keep importing it from `@juxbly/llm`.
 */
import type { TokenUsage } from '@juxbly/core'

export type { LlmPort } from '@juxbly/core'

/** OpenAI-compatible chat roles. V1 sends no assistant turns and no tool calls. */
export type LlmRole = 'system' | 'user'

export interface LlmMessage {
  role: LlmRole
  content: string
}

/**
 * Where a call goes and which key opens the door.
 *
 * The key lives here and nowhere else reachable: no log line, no error message, no
 * message that crosses back to the content script (`docs/ARCHITECTURE.md` §12.2).
 */
export interface LlmEndpoint {
  /** Any OpenAI-compatible endpoint (OpenAI / OpenRouter / a local gateway). */
  baseUrl: string
  apiKey: string
  model: string
}

/** `json` asks the endpoint for a JSON object and parses the reply strictly. */
export type LlmResponseFormat = 'text' | 'json'

export interface LlmRequest {
  endpoint: LlmEndpoint
  messages: readonly LlmMessage[]
  responseFormat?: LlmResponseFormat
  /** Cancelled on panel close / page navigation (§6.1 `ExecutionContext.signal`). */
  signal?: AbortSignal
  timeoutMs?: number
}

export interface LlmResponse {
  output: unknown
  usage: TokenUsage
}

/**
 * The three sections a Juxbly prompt is built from.
 *
 * `data` is the only section page content may ever appear in (§12.3).
 */
export interface PromptSpec {
  /** The standing instruction. Never contains page content. */
  system: string
  /** What this call should do with the data. Never contains page content. */
  instruction: string
  /** Page content / extract output. Always delivered wrapped as a data section. */
  data: string
}

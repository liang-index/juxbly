/**
 * `@juxbly/llm` — the BYOK client, prompt templates and the injection defence.
 *
 * Module map: `docs/ARCHITECTURE.md` §4. Contracts: §5.5 (LLM package contracts) and
 * §6.1 (`LlmPort`). Message hop: §7.2 `run:llm` / `run:llm_result`. Security: §12.
 *
 * Everything here runs in the **background context only**: it is the one place in the
 * repository that reads `Settings.api_key` (§12.2). The content script reaches it
 * through `run:llm` and never sees a key, a request header, or a prompt.
 */
export * from './types'
export * from './errors'
export * from './build-prompt'
export * from './client'
export * from './mock-llm-port'
export * from './run-llm'

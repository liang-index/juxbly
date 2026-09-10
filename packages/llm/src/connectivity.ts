/**
 * One minimal call against a candidate configuration — `docs/ARCHITECTURE.md` §7.2
 * (`llm:connectivity`), stage 1-13.
 *
 * It lives in `packages/llm` for the same reason `handleRunLlm` does: the only place a
 * key may be read is this package (§12.2), and a connectivity test *is* a read plus a
 * call. Putting it in the assembly layer would make `background.ts` the second reader of
 * the credential field.
 *
 * The candidate is never saved here. The options page is allowed to test a configuration
 * the user has not committed yet, because "the test failed" must not be the thing that
 * decides whether a key can be stored — an offline user still has to be able to finish
 * setting up (`task/stage-1-13.md`, edge cases).
 *
 * Never rejects: a thrown error here would leave the options page's button hanging in its
 * loading state, and the whole point of the call is to come back with a category.
 */
import type { Settings } from '@juxbly/core'
import { callLlm, DEFAULT_API_BASE_URL, modelOrDefault } from './client'
import type { LlmFetch } from './client'
import { isLlmError } from './errors'
import type { LlmResponse } from './types'

export interface ConnectivityResult {
  ok: boolean
  /** An `LlmErrorCode` as a string, so it can travel in a message. */
  error?: string
  /** What the probe spent — BYOK transparency (UI_SPEC §9 rule 4). */
  usage?: LlmResponse['usage']
}

export interface ConnectivityDeps {
  fetchImpl?: LlmFetch
  timeoutMs?: number
}

/**
 * The smallest request an OpenAI-compatible endpoint can answer.
 *
 * One user turn, one word, no system prompt: the question is only "does this endpoint
 * accept this key and talk the protocol", and anything larger would be spending the
 * user's money to ask it.
 */
const PROBE_MESSAGES = [{ role: 'user', content: 'hi' }] as const

/** Short: a hung endpoint must not look like a slow one. */
const PROBE_TIMEOUT_MS = 15_000

export async function runConnectivityTest(
  candidate: Partial<Settings>,
  deps: ConnectivityDeps = {},
): Promise<ConnectivityResult> {
  const endpoint = endpointOf(candidate)
  if (endpoint === null) return { ok: false, error: 'NOT_CONFIGURED' }

  try {
    const response = await callLlm(
      {
        endpoint,
        messages: PROBE_MESSAGES,
        timeoutMs: deps.timeoutMs ?? PROBE_TIMEOUT_MS,
      },
      { ...(deps.fetchImpl === undefined ? {} : { fetchImpl: deps.fetchImpl }) },
    )

    return { ok: true, usage: response.usage }
  } catch (error) {
    const code = isLlmError(error) ? error.code : 'INVALID_RESPONSE'
    return { ok: false, error: code }
  }
}

/**
 * An endpoint needs a key; a model it can default. Probing a candidate with no model
 * asks the same question the real run will ask, which is the only honest test — and it
 * is the difference between "paste a key, press the button" and "go find out what a
 * model name is first" (friction ceiling, PRODUCT §10.4).
 */
function endpointOf(
  candidate: Partial<Settings>,
): { baseUrl: string; apiKey: string; model: string } | null {
  const apiKey = (candidate.api_key ?? '').trim()
  if (apiKey === '') return null

  const model = modelOrDefault(candidate.model)
  const baseUrl = (candidate.api_base_url ?? '').trim()
  return { baseUrl: baseUrl === '' ? DEFAULT_API_BASE_URL : baseUrl, apiKey, model }
}

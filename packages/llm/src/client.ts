/**
 * The BYOK client: one OpenAI-compatible chat completion call.
 *
 * Three rules shape this file:
 *
 * 1. **The key is read here and only here.** It goes into one request header and into
 *    nothing else — not a log, not an error, not a message heading back to a content
 *    script (`docs/ARCHITECTURE.md` §12.2).
 * 2. **Failures are categories, not exceptions.** Every failure leaves as an `LlmError`
 *    with a stable code, because the panel has to offer a different next action per
 *    category (§11).
 * 3. **Model output is data.** `JSON.parse` is the only thing that ever touches it —
 *    no `eval`, no `new Function`, no remote code (§12.1).
 */
import type { Logger } from '@juxbly/core'
import { createLogger } from '@juxbly/core'
import { createLlmError, LlmError } from './errors'
import type { LlmRequest, LlmResponse } from './types'

/** §8.1: `api_base_url` defaults to OpenAI when the user never set one. */
export const DEFAULT_API_BASE_URL = 'https://api.openai.com/v1'

/**
 * The model used when the user picked a key but no model (§8.1: `model` is nullable).
 *
 * A missing model used to make the whole endpoint unconfigured — the user saved a key,
 * saw "Saved.", and then hit a wall of `NOT_CONFIGURED` with nothing on screen naming
 * the model as the reason. `gpt-4o-mini` is the cheapest model that exists under that
 * literal name on OpenAI *and* on the OpenAI-compatible gateways the product points at
 * (OpenRouter, Together, LM Studio), which is what makes it safe as a fallback rather
 * than as a silent upsell: it is the name most likely to resolve everywhere.
 *
 * It is a fallback, never a hidden preference — whatever the user types wins, and the
 * options form shows this name as the field's placeholder so the default is visible
 * before it is relied on.
 */
export const DEFAULT_MODEL = 'gpt-4o-mini'

/** The model a request actually goes out with: the user's, or the documented default. */
export function modelOrDefault(model: string | null | undefined): string {
  const trimmed = (model ?? '').trim()
  return trimmed === '' ? DEFAULT_MODEL : trimmed
}

/** Long enough for a real answer, short enough that a hung endpoint is not forever. */
export const DEFAULT_TIMEOUT_MS = 60_000

export interface LlmHttpResponse {
  ok: boolean
  status: number
  text(): Promise<string>
}

export interface LlmHttpRequestInit {
  method: string
  headers: Record<string, string>
  body: string
  signal: AbortSignal
}

/**
 * The structural shape of `fetch` this file needs. Declared here so tests hand in a
 * plain function instead of stubbing a global, and so the client stays usable in the
 * playground and in Node.
 */
export type LlmFetch = (url: string, init: LlmHttpRequestInit) => Promise<LlmHttpResponse>

export interface LlmClientDeps {
  fetchImpl?: LlmFetch
  logger?: Logger
}

const log: Logger = createLogger('CAPABILITY')

function resolveFetch(deps: LlmClientDeps): LlmFetch {
  if (deps.fetchImpl !== undefined) return deps.fetchImpl
  const impl = (globalThis as { fetch?: LlmFetch }).fetch
  if (impl === undefined) throw createLlmError('NETWORK')
  return impl
}

function chatCompletionsUrl(baseUrl: string): string {
  // A trailing slash on a user-configured endpoint is common and would otherwise
  // produce ".../v1//chat/completions".
  //
  // Trimmed with endsWith/slice rather than a regex: `baseUrl` is user configuration,
  // i.e. uncontrolled data, and a quantifier over it is exactly the shape a static
  // analyzer reads as polynomial backtracking. The loop is linear by construction.
  let base = baseUrl
  while (base.endsWith('/')) base = base.slice(0, -1)
  return `${base}/chat/completions`
}

function toTokenCount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Strip a ```json fence before giving up.
 *
 * Models routinely wrap JSON even when asked for a JSON object; refusing to read that
 * would turn a cosmetic habit into a user-visible failure. Parsing stays `JSON.parse`
 * either way — the fence is removed, never evaluated.
 */
function parseJsonOutput(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    // fall through to the fenced form
  }

  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const inner = fenced?.[1]
  if (inner !== undefined) {
    try {
      return JSON.parse(inner.trim())
    } catch {
      // fall through to the error below
    }
  }

  throw createLlmError('INVALID_RESPONSE')
}

function readEnvelope(raw: string): { content: string; usage: { prompt: number; completion: number } } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw createLlmError('INVALID_RESPONSE')
  }

  if (!isRecord(parsed)) throw createLlmError('INVALID_RESPONSE')

  const choices = parsed['choices']
  const first = Array.isArray(choices) ? choices[0] : undefined
  const content = isRecord(first) && isRecord(first['message']) ? first['message']['content'] : undefined

  if (typeof content !== 'string') throw createLlmError('INVALID_RESPONSE')

  const usage = isRecord(parsed['usage']) ? parsed['usage'] : {}

  return {
    content,
    usage: {
      prompt: toTokenCount(usage['prompt_tokens']),
      completion: toTokenCount(usage['completion_tokens']),
    },
  }
}

/**
 * One call. Returns `output` plus the token count the panel shows (BYOK transparency,
 * `docs/UI_SPEC.md` §9 rule 4); a failed call has no `usage` at all rather than a
 * zeroed one, so "no tokens were spent" can never be inferred from a failure.
 */
export async function callLlm(req: LlmRequest, deps: LlmClientDeps = {}): Promise<LlmResponse> {
  const logger = deps.logger ?? log
  const { baseUrl, apiKey, model } = req.endpoint

  if (apiKey.trim() === '' || model.trim() === '') throw createLlmError('NOT_CONFIGURED')

  const url = chatCompletionsUrl(baseUrl.trim() === '' ? DEFAULT_API_BASE_URL : baseUrl)
  const body = JSON.stringify({
    model,
    messages: req.messages,
    ...(req.responseFormat === 'json' ? { response_format: { type: 'json_object' } } : {}),
  })

  const timeoutMs = req.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const controller = new AbortController()
  const external = req.signal
  let timedOut = false

  // Distinguishing "our deadline" from "the caller cancelled" has to happen here: both
  // arrive as the same abort, and the panel offers a different next action for each.
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  const forwardAbort = (): void => controller.abort()

  if (external !== undefined) {
    if (external.aborted) {
      clearTimeout(timer)
      throw createLlmError('ABORTED')
    }
    external.addEventListener('abort', forwardAbort, { once: true })
  }

  const startedAt = Date.now()

  try {
    const http = resolveFetch(deps)
    let response: LlmHttpResponse

    try {
      response = await http(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`,
        },
        body,
        signal: controller.signal,
      })
    } catch (error) {
      if (timedOut) throw createLlmError('TIMEOUT')
      // The thrown value is not re-used: a platform error object can carry request
      // context, and this file is the one place that must not risk echoing a header.
      if (external?.aborted === true || (isRecord(error) && error['name'] === 'AbortError')) {
        throw createLlmError('ABORTED')
      }
      throw createLlmError('NETWORK')
    }

    if (!response.ok) {
      const code =
        response.status === 401 || response.status === 403
          ? 'AUTH'
          : response.status === 429
            ? 'RATE_LIMIT'
            : 'HTTP_ERROR'
      throw createLlmError(code, { status: response.status })
    }

    const raw = await response.text()
    const { content, usage } = readEnvelope(raw)
    const output = req.responseFormat === 'json' ? parseJsonOutput(content) : content

    logger.info('llm call completed', {
      model,
      promptTokens: usage.prompt,
      completionTokens: usage.completion,
      ms: Date.now() - startedAt,
    })

    return {
      output,
      usage: { prompt_tokens: usage.prompt, completion_tokens: usage.completion },
    }
  } catch (error) {
    const code = error instanceof LlmError ? error.code : 'INVALID_RESPONSE'
    logger.warn('llm call failed', { model, code, ms: Date.now() - startedAt })
    throw error
  } finally {
    clearTimeout(timer)
    external?.removeEventListener('abort', forwardAbort)
  }
}

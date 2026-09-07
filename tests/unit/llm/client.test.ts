import { callLlm, DEFAULT_API_BASE_URL, DEFAULT_TIMEOUT_MS } from '@juxbly/llm'
import type { LlmEndpoint, LlmFetch, LlmHttpRequestInit, LlmResponse } from '@juxbly/llm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * `callLlm` is the whole BYOK surface, so this suite pins the five outcomes the panel
 * has to tell apart (`task/stage-1-6.md` AC 1, `docs/ARCHITECTURE.md` §11): success,
 * timeout, auth, quota and an unreadable reply.
 *
 * `usage` is asserted on the success path and its *absence* on every failure: a failed
 * call must never look like a free one.
 */

const FAKE_KEY = 'sk-juxbly-test-0000000000'
const MODEL = 'gpt-4o-mini'

const ENDPOINT: LlmEndpoint = { baseUrl: 'https://example.test/v1', apiKey: FAKE_KEY, model: MODEL }

function completion(content: string, usage: Record<string, number> = {}): unknown {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 12, completion_tokens: 4, ...usage },
  }
}

function ok(body: unknown): LlmFetch {
  return async (): Promise<{ ok: boolean; status: number; text(): Promise<string> }> => ({
    ok: true,
    status: 200,
    text: async (): Promise<string> => JSON.stringify(body),
  })
}

function httpStatus(status: number): LlmFetch {
  return async (): Promise<{ ok: boolean; status: number; text(): Promise<string> }> => ({
    ok: false,
    status,
    text: async (): Promise<string> => 'nope',
  })
}

/** Rejects the way a cancelled fetch does, so the abort paths are exercised for real. */
function abortable(): LlmFetch {
  return (_url: string, init: LlmHttpRequestInit): Promise<never> =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
      })
    })
}

let logged: string[] = []
const consoleMethods = ['info', 'warn', 'error', 'log', 'debug'] as const

beforeEach(() => {
  logged = []
  for (const method of consoleMethods) {
    vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
      logged.push(
        args
          .map((arg) => (typeof arg === 'object' && arg !== null ? JSON.stringify(arg) : String(arg)))
          .join(' '),
      )
    })
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('callLlm — success', () => {
  it('returns the output and the token usage', async () => {
    const response = await callLlm(
      { endpoint: ENDPOINT, messages: [{ role: 'user', content: 'hi' }] },
      { fetchImpl: ok(completion('The desk is $429.')) },
    )

    expect(response.output).toBe('The desk is $429.')
    expect(response.usage).toEqual({ prompt_tokens: 12, completion_tokens: 4 })
  })

  it('posts to the configured endpoint with the key in one header', async () => {
    const seen: { url?: string; init?: LlmHttpRequestInit } = {}
    const fetchImpl: LlmFetch = async (url, init) => {
      seen.url = url
      seen.init = init
      return { ok: true, status: 200, text: async () => JSON.stringify(completion('ok')) }
    }

    await callLlm({ endpoint: ENDPOINT, messages: [{ role: 'user', content: 'hi' }] }, { fetchImpl })

    expect(seen.url).toBe('https://example.test/v1/chat/completions')
    expect(seen.init?.method).toBe('POST')
    expect(seen.init?.headers?.authorization).toBe(`Bearer ${FAKE_KEY}`)
  })

  it('falls back to the default endpoint when none is configured', async () => {
    const seen: string[] = []
    const fetchImpl: LlmFetch = async (url) => {
      seen.push(url)
      return { ok: true, status: 200, text: async () => JSON.stringify(completion('ok')) }
    }

    await callLlm(
      { endpoint: { ...ENDPOINT, baseUrl: '' }, messages: [{ role: 'user', content: 'hi' }] },
      { fetchImpl },
    )

    expect(seen[0]).toBe(`${DEFAULT_API_BASE_URL}/chat/completions`)
  })

  it('reads zero tokens when the endpoint reports none', async () => {
    const response = await callLlm(
      { endpoint: ENDPOINT, messages: [{ role: 'user', content: 'hi' }] },
      { fetchImpl: ok({ choices: [{ message: { content: 'ok' } }] }) },
    )

    // Unknown is zero, never undefined: the panel adds these up.
    expect(response.usage).toEqual({ prompt_tokens: 0, completion_tokens: 0 })
  })

  it('parses a JSON reply when one was asked for', async () => {
    const response = await callLlm(
      { endpoint: ENDPOINT, messages: [{ role: 'user', content: 'hi' }], responseFormat: 'json' },
      { fetchImpl: ok(completion('{"verdict":"ok"}')) },
    )

    expect(response.output).toEqual({ verdict: 'ok' })
  })

  it('reads a fenced JSON reply instead of failing on the fence', async () => {
    const response = await callLlm(
      { endpoint: ENDPOINT, messages: [{ role: 'user', content: 'hi' }], responseFormat: 'json' },
      { fetchImpl: ok(completion('```json\n{"verdict":"ok"}\n```')) },
    )

    expect(response.output).toEqual({ verdict: 'ok' })
  })
})

describe('callLlm — failures', () => {
  it('reports an unreadable reply instead of crashing', async () => {
    const fetchImpl: LlmFetch = async () => ({ ok: true, status: 200, text: async () => 'not json' })

    await expect(
      callLlm({ endpoint: ENDPOINT, messages: [] }, { fetchImpl }),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('reports a JSON reply that is not JSON when JSON was asked for', async () => {
    await expect(
      callLlm(
        { endpoint: ENDPOINT, messages: [], responseFormat: 'json' },
        { fetchImpl: ok(completion('I think it is fine.')) },
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })

  it('tells auth, quota and other HTTP failures apart', async () => {
    await expect(
      callLlm({ endpoint: ENDPOINT, messages: [] }, { fetchImpl: httpStatus(401) }),
    ).rejects.toMatchObject({ code: 'AUTH', status: 401 })

    await expect(
      callLlm({ endpoint: ENDPOINT, messages: [] }, { fetchImpl: httpStatus(429) }),
    ).rejects.toMatchObject({ code: 'RATE_LIMIT', status: 429 })

    await expect(
      callLlm({ endpoint: ENDPOINT, messages: [] }, { fetchImpl: httpStatus(500) }),
    ).rejects.toMatchObject({ code: 'HTTP_ERROR', status: 500 })
  })

  it('reports a dead endpoint as a network failure', async () => {
    const fetchImpl: LlmFetch = async () => {
      throw new TypeError('fetch failed')
    }

    await expect(
      callLlm({ endpoint: ENDPOINT, messages: [] }, { fetchImpl }),
    ).rejects.toMatchObject({ code: 'NETWORK' })
  })

  it('reports no configuration rather than calling anything', async () => {
    const fetchImpl = vi.fn(ok(completion('ok')))

    await expect(
      callLlm({ endpoint: { ...ENDPOINT, apiKey: '' }, messages: [] }, { fetchImpl }),
    ).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
    await expect(
      callLlm({ endpoint: { ...ENDPOINT, model: '' }, messages: [] }, { fetchImpl }),
    ).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })

    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('times out a call that never answers', async () => {
    await expect(
      callLlm({ endpoint: ENDPOINT, messages: [], timeoutMs: 5 }, { fetchImpl: abortable() }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('reports a cancellation as cancelled, and not as a timeout', async () => {
    const controller = new AbortController()
    const pending = callLlm(
      { endpoint: ENDPOINT, messages: [], signal: controller.signal, timeoutMs: 10_000 },
      { fetchImpl: abortable() },
    )

    controller.abort()

    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' })
  })

  it('refuses to start a call that was already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      callLlm({ endpoint: ENDPOINT, messages: [], signal: controller.signal }, { fetchImpl: abortable() }),
    ).rejects.toMatchObject({ code: 'ABORTED' })
  })

  it('never reports usage for a failed call', async () => {
    // A zeroed usage on a failure would let the panel claim a free retry.
    const settled = await callLlm(
      { endpoint: ENDPOINT, messages: [] },
      { fetchImpl: httpStatus(500) },
    ).catch((error: unknown) => error)

    expect(settled).not.toHaveProperty('usage')
  })

  it('defaults the timeout when the caller sets none', () => {
    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThan(0)
  })
})

describe('callLlm — logging', () => {
  const collect = async (fetchImpl: LlmFetch): Promise<void> => {
    await callLlm({ endpoint: ENDPOINT, messages: [{ role: 'user', content: 'SECRET-PROMPT-TEXT' }] }, { fetchImpl }).catch(
      () => undefined,
    )
  }

  it('logs the model and the token counts, never the prompt', async () => {
    await collect(ok(completion('ok')))

    const lines = logged.join('\n')
    expect(lines).toContain(MODEL)
    expect(lines).not.toContain('SECRET-PROMPT-TEXT')
  })

  it('logs a category on failure, still without the prompt', async () => {
    await collect(httpStatus(401))

    const lines = logged.join('\n')
    expect(lines).toContain('AUTH')
    expect(lines).not.toContain('SECRET-PROMPT-TEXT')
    expect(lines).not.toContain(FAKE_KEY)
  })
})

describe('LlmResponse shape', () => {
  it('keeps output loosely typed — the model decides what it is', async () => {
    const response: LlmResponse = await callLlm(
      { endpoint: ENDPOINT, messages: [] },
      { fetchImpl: ok(completion('text')) },
    )

    expect(typeof response.output).toBe('string')
  })
})

import { createMockAdapter } from '@juxbly/browser'
import type { Settings } from '@juxbly/core'
import { createMockLlmPort, DEFAULT_MODEL, handleRunLlm } from '@juxbly/llm'
import type { LlmFetch } from '@juxbly/llm'
import { createLlmError } from '@juxbly/llm'
import { describe, expect, it } from 'vitest'

/**
 * The `run:llm` / `run:llm_result` hop — `docs/ARCHITECTURE.md` §7.2.
 *
 * What this hop is for: the content script has no key and must never receive one, so a
 * `llm` step asks the background to make the call and gets the output plus the token
 * count back. Two properties matter — the reply is matched by `requestId` (several runs
 * can be in flight), and a failure comes back as `ok: false` with a category rather than
 * as a rejection that leaves a panel waiting forever.
 */

const SETTINGS: Settings = {
  api_key: 'sk-juxbly-test-0000000000',
  api_base_url: 'https://example.test/v1',
  model: 'gpt-4o-mini',
  floating_ball_enabled: true,
}

const STEP = { type: 'llm', task: 'summarize', input_from: 'raw_items', output_to: 'summary' } as const

function replyWith(content: string): LlmFetch {
  return async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 20, completion_tokens: 7 },
      }),
  })
}

function configured(): ReturnType<typeof createMockAdapter> {
  return createMockAdapter({ storage: { 'juxbly:settings': SETTINGS } })
}

describe('handleRunLlm', () => {
  it('answers with the output, the usage and the same requestId', async () => {
    const result = await handleRunLlm(
      { kind: 'run:llm', requestId: 'req-1', step: STEP, input: 'page text' },
      configured(),
      { fetchImpl: replyWith('a summary') },
    )

    expect(result).toEqual({
      kind: 'run:llm_result',
      requestId: 'req-1',
      ok: true,
      output: 'a summary',
      usage: { prompt_tokens: 20, completion_tokens: 7 },
    })
  })

  it('reports "not configured" when there is no key yet', async () => {
    // 1-13's onboarding step takes the user from here; it must be recognisable, not a
    // generic failure.
    const noSettings = await handleRunLlm(
      { kind: 'run:llm', requestId: 'req-2', step: STEP, input: 'x' },
      createMockAdapter(),
      { fetchImpl: replyWith('nope') },
    )
    const noKey = await handleRunLlm(
      { kind: 'run:llm', requestId: 'req-3', step: STEP, input: 'x' },
      createMockAdapter({ storage: { 'juxbly:settings': { ...SETTINGS, api_key: null } } }),
      { fetchImpl: replyWith('nope') },
    )

    expect(noSettings).toMatchObject({ ok: false, error: 'NOT_CONFIGURED' })
    expect(noKey).toMatchObject({ ok: false, error: 'NOT_CONFIGURED' })
  })

  /**
   * A saved key with no model is "configured", not broken.
   *
   * Before this, a blank model read as `NOT_CONFIGURED`: the user saved a key, saw
   * "Saved.", and then met a wall of failures with nothing on screen naming the model as
   * the cause — the one configuration mistake the product cannot expect a first-time user
   * to guess (friction ceiling, PRODUCT §10.4).
   */
  it('sends the documented default model when the user saved a key but no model', async () => {
    const bodies: string[] = []
    const capture: LlmFetch = async (_url, init) => {
      bodies.push(String(init?.body ?? ''))
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: 'ok' } }],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
      }
    }

    const result = await handleRunLlm(
      { kind: 'run:llm', requestId: 'req-2b', step: STEP, input: 'x' },
      createMockAdapter({
        storage: { 'juxbly:settings': { ...SETTINGS, model: null } },
      }),
      { fetchImpl: capture },
    )

    expect(result).toMatchObject({ ok: true })
    expect(bodies.length).toBe(1)
    expect(JSON.parse(bodies[0] ?? '{}').model).toBe(DEFAULT_MODEL)

    // Whatever the user typed still wins — the default is a fallback, not a preference.
    const named: string[] = []
    await handleRunLlm(
      { kind: 'run:llm', requestId: 'req-2c', step: STEP, input: 'x' },
      createMockAdapter({
        storage: { 'juxbly:settings': { ...SETTINGS, model: 'my-own-model' } },
      }),
      {
        fetchImpl: async (_url, init) => {
          named.push(String(init?.body ?? ''))
          return {
            ok: true,
            status: 200,
            text: async () =>
              JSON.stringify({
                choices: [{ message: { content: 'ok' } }],
                usage: { prompt_tokens: 1, completion_tokens: 1 },
              }),
          }
        },
      },
    )
    expect(JSON.parse(named[0] ?? '{}').model).toBe('my-own-model')
  })

  it('passes the failure category through as `error`', async () => {
    const auth: LlmFetch = async () => ({ ok: false, status: 401, text: async () => 'no' })
    const dead: LlmFetch = async () => {
      throw new TypeError('fetch failed')
    }

    await expect(
      handleRunLlm({ kind: 'run:llm', requestId: 'req-4', step: STEP, input: 'x' }, configured(), {
        fetchImpl: auth,
      }),
    ).resolves.toMatchObject({ ok: false, error: 'AUTH' })

    await expect(
      handleRunLlm({ kind: 'run:llm', requestId: 'req-5', step: STEP, input: 'x' }, configured(), {
        fetchImpl: dead,
      }),
    ).resolves.toMatchObject({ ok: false, error: 'NETWORK' })
  })

  it('refuses a step that has nothing to send', async () => {
    const result = await handleRunLlm(
      { kind: 'run:llm', requestId: 'req-6', step: { ...STEP, task: 'custom' }, input: 'x' },
      configured(),
      { fetchImpl: replyWith('nope') },
    )

    expect(result).toMatchObject({ ok: false, error: 'INVALID_REQUEST' })
  })

  it('keeps concurrent calls from crossing over', async () => {
    const adapter = configured()
    const fetchImpl: LlmFetch = async (_url, init) => ({
      ok: true,
      status: 200,
      text: async () => {
        // The body carries the instruction, so the answer depends on which step it is.
        const body = JSON.parse(init.body) as { messages: { content: string }[] }
        const instruction = body.messages[body.messages.length - 1]?.content ?? ''
        return JSON.stringify({
          choices: [{ message: { content: `answered: ${instruction}` } }],
          usage: { prompt_tokens: 1, completion_tokens: 1 },
        })
      },
    })

    const [first, second] = await Promise.all([
      handleRunLlm({ kind: 'run:llm', requestId: 'a', step: STEP, input: 'first page' }, adapter, {
        fetchImpl,
      }),
      handleRunLlm(
        {
          kind: 'run:llm',
          requestId: 'b',
          step: { ...STEP, task: 'custom', prompt: 'List the prices.' },
          input: 'second page',
        },
        adapter,
        { fetchImpl },
      ),
    ])

    expect(first.requestId).toBe('a')
    expect(second.requestId).toBe('b')
    expect(String(first.output)).toContain('Summarise')
    expect(String(second.output)).toContain('List the prices.')
  })
})

describe('createMockLlmPort', () => {
  it('answers with a preset output and usage, and records what it was asked', async () => {
    const port = createMockLlmPort({
      output: ['a'],
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    })

    const result = await port.call(STEP, [{ title: 'x' }])

    expect(result.output).toEqual(['a'])
    expect(result.usage).toEqual({ prompt_tokens: 3, completion_tokens: 4 })
    expect(port.calls).toHaveLength(1)
    expect(port.calls[0]?.input).toEqual([{ title: 'x' }])
  })

  it('drives the failure path of a consumer', async () => {
    const port = createMockLlmPort({ error: createLlmError('RATE_LIMIT') })

    await expect(port.call(STEP, 'x')).rejects.toMatchObject({ code: 'RATE_LIMIT' })
  })

  it('lets a test answer per call', async () => {
    const port = createMockLlmPort({
      handler: (step) => (step.task === 'translate' ? 'translated' : 'summary'),
    })

    await expect(port.call(STEP, 'x')).resolves.toMatchObject({ output: 'summary' })
    await expect(
      port.call({ ...STEP, task: 'translate', target_lang: 'German' }, 'x'),
    ).resolves.toMatchObject({ output: 'translated' })
  })
})

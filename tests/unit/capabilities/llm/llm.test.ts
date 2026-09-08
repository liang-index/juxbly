import { describe, expect, it } from 'vitest'
import { createMockLlmPort } from '@juxbly/llm'
import { llmCapability, runLlm } from '@juxbly/capabilities'
import type { LlmStep } from '@juxbly/dsl'
import { ctxWithLog } from '../ctx'

/**
 * The `llm` capability: it owns no endpoint and no key, it only knows how to ask.
 *
 * What it must guarantee is that the records go in untouched and that the output plus its
 * token cost come back out — the two things the engine needs to cache the one and account
 * for the other.
 */
const STEP: LlmStep = { type: 'llm', task: 'summarize', input_from: 'products', output_to: 'summary' }
const ROWS = [{ title: 'a' }, { title: 'b' }]

describe('llmCapability', () => {
  it('returns the model output and what it cost', async () => {
    const { ctx } = ctxWithLog()
    ctx.ports.llm = createMockLlmPort({
      output: 'two products',
      usage: { prompt_tokens: 12, completion_tokens: 5 },
    })

    const result = await llmCapability.execute({ step: STEP, items: ROWS }, ctx)

    expect(result).toEqual({ output: 'two products', usage: { prompt_tokens: 12, completion_tokens: 5 } })
  })

  it('passes the step and the records to the port untouched', async () => {
    const llm = createMockLlmPort({ output: 'ok' })
    const { ctx } = ctxWithLog()
    ctx.ports.llm = llm

    await runLlm({ step: STEP, items: ROWS }, llm)

    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]?.step).toEqual(STEP)
    expect(llm.calls[0]?.input).toEqual(ROWS)
  })

  it('logs the task and the token counts, never the prompt or the output', async () => {
    const { ctx, logged } = ctxWithLog()
    ctx.ports.llm = createMockLlmPort({
      output: 'secret-looking output',
      usage: { prompt_tokens: 3, completion_tokens: 4 },
    })

    await llmCapability.execute({ step: STEP, items: ROWS }, ctx)

    // `ctxWithLog` stringifies details, which is also why a value could never slip in
    // unnoticed: everything a log line carries is rendered as text in a test.
    expect(logged).toEqual([['CAPABILITY', 'llm', 'summarize', '3', '4']])
    expect(JSON.stringify(logged)).not.toContain('secret-looking output')
  })

  it('propagates a failing call with the engine tier the panel branches on', async () => {
    const { ctx } = ctxWithLog()
    ctx.ports.llm = createMockLlmPort({ error: new Error('endpoint refused') })

    // The panel can only map copy from the engine's codes (`ARCHITECTURE` §5.5); a port
    // error without one would land in the generic "did not finish" tier and hide the fix.
    await expect(llmCapability.execute({ step: STEP, items: ROWS }, ctx)).rejects.toMatchObject({
      code: 'LLM_FAILED',
    })
  })

  it('folds every port category except cancellation into LLM_FAILED', async () => {
    // `NOT_CONFIGURED` included: "check your key and endpoint" is the right next step for
    // an unconfigured user too, and 1-13 decides onboarding on flags, not run errors.
    for (const code of ['NOT_CONFIGURED', 'AUTH', 'RATE_LIMIT', 'NETWORK', 'HTTP_ERROR', 'TIMEOUT', 'INVALID_REQUEST']) {
      const { ctx } = ctxWithLog()
      ctx.ports.llm = createMockLlmPort({ error: Object.assign(new Error(code), { code }) })

      await expect(llmCapability.execute({ step: STEP, items: ROWS }, ctx)).rejects.toMatchObject({
        code: 'LLM_FAILED',
      })
    }
  })

  it('keeps a cancelled call a cancellation, not a failure', async () => {
    const { ctx } = ctxWithLog()
    ctx.ports.llm = createMockLlmPort({ error: Object.assign(new Error('cancelled'), { code: 'ABORTED' }) })

    await expect(llmCapability.execute({ step: STEP, items: ROWS }, ctx)).rejects.toMatchObject({
      code: 'ABORTED',
    })
  })
})

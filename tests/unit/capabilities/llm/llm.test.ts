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

  it('propagates a failing call so the engine can classify it', async () => {
    const { ctx } = ctxWithLog()
    ctx.ports.llm = createMockLlmPort({ error: new Error('endpoint refused') })

    await expect(llmCapability.execute({ step: STEP, items: ROWS }, ctx)).rejects.toThrow('endpoint refused')
  })
})

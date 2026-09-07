// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { addProduct, createHarness, makeTool, productExtractStep, runOnce, summarizeStep } from './harness'

/**
 * The llm cache decision — the acceptance criterion of stage 1-7 (`ARCHITECTURE.md` §9.2).
 *
 * The assertion that matters is the **call count on the mock port**: "the model was not
 * called" is the whole feature, and it can only be claimed if something counted.
 */
describe('the llm cache decision', () => {
  it('skips the model when the extracted data is unchanged', async () => {
    const harness = createHarness({ output: '4 products', usage: { prompt_tokens: 10, completion_tokens: 4 } })
    const tool = makeTool([productExtractStep(), summarizeStep()])

    const first = await runOnce(harness, { tool })
    const second = await runOnce(harness, { tool, runState: first.runState })

    expect(first.ok).toBe(true)
    expect(first.llmCached).toBe(false)
    expect(harness.llm.calls).toHaveLength(1)

    // The point of the stage: a second look at the same page costs nothing.
    expect(second.llmCached).toBe(true)
    expect(harness.llm.calls).toHaveLength(1)
    expect(second.usage).toEqual({ prompt_tokens: 0, completion_tokens: 0 })
    expect(second.outputs['summary']).toBe('4 products')
  })

  it('calls the model again when the extracted data changed', async () => {
    const harness = createHarness({ handler: (_step, input) => `${String((input as unknown[]).length)} rows` })
    const tool = makeTool([productExtractStep(), summarizeStep()])

    const first = await runOnce(harness, { tool })
    addProduct(harness.host, 'Mechanical keyboard')
    const second = await runOnce(harness, { tool, runState: first.runState })

    expect(harness.llm.calls).toHaveLength(2)
    expect(second.llmCached).toBe(false)
    expect(second.outputs['summary']).toBe('5 rows')
    expect(second.usage).toEqual({ prompt_tokens: 0, completion_tokens: 0 })
  })

  it('calls the model again on a forced refresh, even when nothing changed', async () => {
    const harness = createHarness({ output: 'cached answer' })
    const tool = makeTool([productExtractStep(), summarizeStep()])

    const first = await runOnce(harness, { tool })
    const forced = await runOnce(harness, { tool, runState: first.runState, force: true })

    expect(harness.llm.calls).toHaveLength(2)
    expect(forced.llmCached).toBe(false)
  })

  it('treats a state with no stored output as a first run', async () => {
    const harness = createHarness({ output: 'answer' })
    const tool = makeTool([productExtractStep(), summarizeStep()])

    // A hash with no matching output: the step has never run, so there is nothing to reuse.
    const withHashOnly = await runOnce(harness, {
      tool,
      runState: { last_extract_hash: 'not-the-hash-of-anything', last_llm_outputs: {} },
    })

    expect(withHashOnly.llmCached).toBe(false)
    expect(harness.llm.calls).toHaveLength(1)
  })

  it('hashes the data, not the page: a reload with identical rows still hits the cache', async () => {
    const harness = createHarness({ output: 'answer' })
    const tool = makeTool([productExtractStep(), summarizeStep()])

    const first = await runOnce(harness, { tool })
    // A fresh harness over a freshly parsed fixture: same rows, new Document instance.
    const reloaded = createHarness({ output: 'a different answer' })
    const second = await runOnce(reloaded, { tool, runState: first.runState })

    expect(second.llmCached).toBe(true)
    expect(reloaded.llm.calls).toHaveLength(0)
    expect(second.outputs['summary']).toBe('answer')
  })
})

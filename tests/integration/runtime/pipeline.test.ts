// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { validateToolDefinition } from '@juxbly/dsl'
import type { ToolStep } from '@juxbly/dsl'
import { createHarness, makeTool, productExtractStep, runOnce } from './harness'

/**
 * The full V1 pipeline: extract → transform → llm → render.
 *
 * V1 executes linearly and the variable bag is the only channel between steps, so what
 * this test protects is the handover: each step must receive exactly the records the
 * previous one produced, in the order it produced them.
 */
const PIPELINE: readonly ToolStep[] = [
  productExtractStep(),
  { type: 'transform', op: 'sort', field: 'title', order: 'asc', input_from: 'products', output_to: 'sorted' },
  { type: 'llm', task: 'summarize', input_from: 'sorted', output_to: 'summary' },
  { type: 'render', view: 'table', input_from: 'sorted' },
]

describe('the run pipeline', () => {
  it('carries records from extract through transform to llm and render', async () => {
    const harness = createHarness({ handler: (_step, input) => (input as unknown[]).length })
    const outcome = await runOnce(harness, { tool: makeTool(PIPELINE) })

    expect(outcome.ok).toBe(true)
    expect(outcome.error).toBeUndefined()

    const sorted = outcome.outputs['sorted'] as { title: string }[]
    expect(sorted.map((row) => row.title)).toEqual([
      'Laptop stand',
      'USB-C hub',
      'Wireless keyboard',
      'Wireless mouse',
    ])

    // The llm step reads the transformed variable, not the raw one — input_from is honoured.
    expect(harness.llm.calls[0]?.input).toEqual(sorted)
    expect(outcome.outputs['summary']).toBe(4)
    expect(outcome.render).toEqual({ view: 'table', itemCount: 4, truncated: false })

    // Rendered into Juxbly's own container, never into the host page (UI_SPEC §11).
    expect(harness.container.childElementCount).toBeGreaterThan(0)
  })

  it('reports a run summary in the §8.1 shape', async () => {
    const harness = createHarness({ output: 'ok' })
    const outcome = await runOnce(harness, { tool: makeTool(PIPELINE) })

    expect(outcome.summary.had_data).toBe(true)
    expect(outcome.summary.item_count).toBe(4)
    expect(outcome.summary.field_digest).toEqual({ title: 'text', price: 'text', rating: 'text' })
    expect(Date.parse(outcome.summary.at)).not.toBeNaN()
  })

  it('hands back the state the caller stores for the next run', async () => {
    const harness = createHarness({ output: 'summary text' })
    const outcome = await runOnce(harness, { tool: makeTool(PIPELINE) })

    expect(outcome.runState?.last_extract_hash).toMatch(/^[0-9a-f]{16}$/)
    expect(outcome.runState?.last_llm_outputs).toEqual({ summary: 'summary text' })
  })

  it('rejects an edited tool at run time, even though it was valid when saved', async () => {
    const harness = createHarness({ output: 'ok' })
    // The open-source build lets a user hand-edit a stored tool; the gate must be here.
    const editedExtract: ToolStep = {
      type: 'extract',
      mode: 'list',
      selector: '.results li.product',
      fields: { title: '.title' },
      output_to: '',
    }
    const tool = makeTool([editedExtract])

    const outcome = await runOnce(harness, { tool })

    expect(outcome.ok).toBe(false)
    expect(outcome.error?.code).toBe('VALIDATION_FAILED')
    expect(outcome.error?.errors?.length).toBeGreaterThan(0)
    expect(outcome.runState).toBeUndefined()
    expect(harness.llm.calls).toHaveLength(0)
  })

  it('reports an empty extract as a summary of zero rows, not as a failure', async () => {
    const harness = createHarness({ output: 'ok' })
    const tool = makeTool([
      { type: 'extract', mode: 'list', selector: '.nothing-here', fields: { title: '.title' }, output_to: 'rows' },
      { type: 'render', view: 'table', input_from: 'rows' },
    ])

    const outcome = await runOnce(harness, { tool })

    // "Nothing matched" is an answer a tool is allowed to give (UI_SPEC §7).
    expect(outcome.ok).toBe(true)
    expect(outcome.summary).toMatchObject({ had_data: false, item_count: 0 })
    expect(outcome.render?.itemCount).toBe(0)
  })

  it('refuses a step whose input variable no earlier step produced', async () => {
    const harness = createHarness({ output: 'ok' })
    // validateToolDefinition catches this first; the bag is the second fence.
    const tool = makeTool([{ type: 'render', view: 'table', input_from: 'missing' }])
    expect(validateToolDefinition(tool).ok).toBe(false)

    const outcome = await runOnce(harness, { tool })
    expect(outcome.ok).toBe(false)
    expect(outcome.error?.code).toBe('VALIDATION_FAILED')
  })
})

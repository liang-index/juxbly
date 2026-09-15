import type { RunStepTrace } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { describe, expect, it } from 'vitest'
import {
  MAX_PREVIEW_CHARS,
  MAX_PREVIEW_ROWS,
  preview,
  rowCount,
  stepViews,
} from '@juxbly/ui'

/**
 * The runtime inspector's data — `task/stage-1-16.md` Scope 3 / Tests.
 *
 * What the assertions protect:
 *
 * - **Steps the run never reached are still listed** — a list that stops at the failure
 *   reads as if the definition stopped there too (prototype RUN-INS-01: skipped steps
 *   are marked, not dropped);
 * - **no data is copied** — the trace names variables; the views resolve them from the
 *   variable bag at draw time, and the previews are cut by the two limits;
 * - **`extract` consumes nothing** — "the page" is the input, and `0 rows` is not the
 *   same answer as "nothing was handed over" (§5.2).
 */
const AT = '2026-09-09T00:00:00.000Z'

function definition(): ToolDefinition {
  return {
    tool_id: 'tool_a',
    name: 'Deals',
    category: 'data',
    url_pattern: 'https://example.com/*',
    version: 1,
    created_at: AT,
    updated_at: AT,
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector: '.deal',
        fields: { title: '.title' },
        output_to: 'raw_items',
      },
      { type: 'transform', op: 'filter', input_from: 'raw_items', output_to: 'deals' },
      { type: 'llm', task: 'summarize', input_from: 'deals', output_to: 'digest' },
      { type: 'render', view: 'table', input_from: 'deals' },
    ],
  }
}

function trace(failureAt?: number): RunStepTrace[] {
  const rows = (index: number): RunStepTrace => ({
    index,
    type: index === 0 ? 'extract' : index === 1 ? 'transform' : 'llm',
    inputCount: index === 0 ? null : 3,
    durationMs: 4 + index,
    ...(index === 0 ? {} : { outputTo: index === 1 ? 'deals' : 'digest' }),
    ...(failureAt === index
      ? { error: { code: 'LLM_FAILED', message: 'the endpoint refused the key' } }
      : {}),
  })
  return [rows(0), rows(1), rows(2)]
}

const OUTPUTS = {
  raw_items: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
  deals: [{ title: 'a' }],
  digest: 'three deals, one under $50',
}

describe('stepViews (runtime inspect)', () => {
  it('lists every step of the definition, in definition order', () => {
    const views = stepViews(definition(), trace(), OUTPUTS)

    expect(views.map((view) => view.type)).toEqual(['extract', 'transform', 'llm', 'render'])
  })

  it('reads extract as consuming the page, not a variable', () => {
    const [extract] = stepViews(definition(), trace(), OUTPUTS)

    expect(extract?.input).toBeNull()
    expect(extract?.inputCount).toBeNull()
    expect(extract?.output).toContain('"title"')
  })

  it('resolves a step’s input and output from the variable bag, by name', () => {
    const views = stepViews(definition(), trace(), OUTPUTS)
    const llm = views[2]

    expect(llm?.input).toContain('"title"')
    expect(llm?.output).toContain('three deals')
    expect(llm?.durationMs).toBe(6)
  })

  it('marks a failed step with its reason', () => {
    const views = stepViews(definition(), trace(2), OUTPUTS)

    expect(views[2]?.error).toBe('the endpoint refused the key')
    expect(views[0]?.error).toBeNull()
  })

  it('still lists steps the run never reached — unmarked, not dropped', () => {
    const views = stepViews(definition(), trace(2), OUTPUTS)
    const render = views[3]

    expect(render).toMatchObject({
      type: 'render',
      input: '[{"title":"a"}]',
      output: null,
      durationMs: 0,
      ran: false,
    })
  })

  it('answers the same when nothing has run yet — a list, not a blank area', () => {
    const views = stepViews(definition(), null, null)

    expect(views).toHaveLength(4)
    expect(views[0]).toMatchObject({ input: null, output: null, durationMs: 0, ran: false })
  })
})

describe('previews (edge case: large results)', () => {
  it('draws at most MAX_PREVIEW_ROWS of an array and reports the rest', () => {
    const rows = Array.from({ length: MAX_PREVIEW_ROWS + 7 }, (_, index) => ({ n: index }))

    expect(rowCount(rows)).toBe(MAX_PREVIEW_ROWS + 7)
    expect(preview(rows)).not.toContain('"n":9')
  })

  it('cuts a long value to MAX_PREVIEW_CHARS rather than freezing the panel', () => {
    const long = 'x'.repeat(MAX_PREVIEW_CHARS * 3)

    expect(preview(long).length).toBeLessThanOrEqual(MAX_PREVIEW_CHARS + 1)
  })

  it('says nothing for a variable that was never written', () => {
    expect(preview(undefined)).toBe('')
  })

  it('survives a value that will not serialise — a debug view must not throw', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic['self'] = cyclic

    expect(() => preview(cyclic)).not.toThrow()
  })
})

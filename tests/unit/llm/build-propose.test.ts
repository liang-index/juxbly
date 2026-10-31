import { describe, expect, it } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import type { PageAnalysis } from '@juxbly/core'
import { saveSettings } from '@juxbly/storage'
import type { LlmFetch } from '@juxbly/llm'
import { buildInstruction, handleBuildPropose } from '@juxbly/llm'

/**
 * `buildInstruction` — the model-facing rule list. What is tested here is not the exact
 * wording but the promises the build flow depends on: selectors must come from stable
 * anchors, and hashed classes are named as forbidden.
 */

/** `buildInstruction` never reads the analysis (it travels as the data section). */
const ANALYSIS: PageAnalysis = {
  url: 'https://example.com/products',
  title: 'Products',
  visibleText: '',
  containers: [],
  customElements: [],
  shadowHosts: [],
  scrollHint: 'none',
  truncated: false,
  analyzedAt: '2026-09-10T00:00:00Z',
}

function instructionOf(): string {
  return buildInstruction({
    conversation: [
      { role: 'user', content: 'extract the product list as a table', at: '2026-09-10T00:00:00Z' },
    ],
    pageAnalysis: ANALYSIS,
    conservative: false,
    noMoreQuestions: false,
  })
}

describe('buildInstruction — selector anchor rules', () => {
  it('tells the model to build selectors from stable anchors', () => {
    const instruction = instructionOf()
    expect(instruction).toContain('stable anchors')
    expect(instruction).toContain('aria-* and data-* attributes')
    expect(instruction).toContain(':nth-of-type')
  })

  it('forbids hashed class names with a concrete example', () => {
    const instruction = instructionOf()
    expect(instruction).toContain('Never use hashed or generated class names')
    expect(instruction).toContain('css-1x2y3z')
  })
})

describe('buildInstruction — the tool must run where it was built', () => {
  it('requires the url_pattern to match the page in the data section', () => {
    // A pattern that obeys every syntax rule but points at other pages saves fine and
    // then never runs — the model is shown the page URL, so it is told to use it.
    const instruction = instructionOf()
    expect(instruction).toContain('must match the page URL in the data section')
  })
})

describe('buildInstruction — field_transforms (§5.4 rule 11)', () => {
  it('teaches the capture op with a concrete wrapper-text example', () => {
    const instruction = instructionOf()
    expect(instruction).toContain('field_transforms')
    expect(instruction).toContain('"capture"')
    expect(instruction).toContain('star-rating Three')
  })

  it('states the safety rules and the image-field exception', () => {
    const instruction = instructionOf()
    expect(instruction).toContain('no nested quantifiers, 256 characters max')
    expect(instruction).toContain('Never put a transform on an "image" field')
  })
})

describe('buildInstruction — category enum compliance', () => {
  it('pins the category to the four schema values after the live reading showed synonym drift', () => {
    // The 2026-10-31 gate reading: 9 of 56 cases died to a category the model invented
    // although the schema line already listed the enum. The rule says it twice, in words.
    const instruction = instructionOf()
    expect(instruction).toContain('exactly one of the four values')
    expect(instruction).toContain('Never a synonym')
  })
})

describe('buildInstruction — the 2026-10-31 robustness rules', () => {
  it('shows field_transforms as an array of ops and names the bare-object mistake', () => {
    // The prompt's own example previously showed the bare op object the model then wrote
    // — 4 builds lost to it across the two runs.
    const instruction = instructionOf()
    expect(instruction).toContain('array of ops')
    expect(instruction).toContain('without the array brackets is rejected')
  })

  it('states the consequence of an attr field with no field_attrs entry', () => {
    // r1 case A-01 typed a field "attr" and omitted field_attrs; the rule now names the
    // rejection, the same wording pattern that fixed the category drift.
    const instruction = instructionOf()
    expect(instruction).toContain('no matching "field_attrs" entry is rejected')
  })

  it('keeps output_to unique and sends alternative strategies to separate candidates', () => {
    // r2 case C-06 returned two extract strategies in one candidate, both writing
    // "raw_items" — a duplicate the DSL rejects.
    const instruction = instructionOf()
    expect(instruction).toContain('only one step may declare a given "output_to"')
    expect(instruction).toContain('separate candidate')
  })
})

describe('handleBuildPropose — live-reply robustness', () => {
  const SETTINGS = {
    api_key: 'sk-juxbly-test-0000000000',
    api_base_url: 'https://api.openai.com/v1',
    model: '',
    floating_ball_enabled: true,
  }

  function envelope(content: string): { ok: true; status: number; text: () => Promise<string> } {
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) }
  }

  async function proposeWith(fetchImpl: LlmFetch): Promise<{
    ok: boolean
    error?: string
    reply?: { content: string }
    candidates?: Array<{ steps: Array<Record<string, unknown>> }>
  }> {
    const adapter = createMockAdapter()
    await saveSettings(adapter, SETTINGS)
    return handleBuildPropose(
      {
        kind: 'build:propose',
        requestId: 'req-test',
        conversation: [
          { role: 'user', content: 'extract the products', at: '2026-10-31T00:00:00Z' },
        ],
        pageAnalysis: ANALYSIS,
      },
      adapter,
      { fetchImpl },
    ) as unknown as Promise<{
      ok: boolean
      error?: string
      reply?: { content: string }
      candidates?: Array<{ steps: Array<Record<string, unknown>> }>
    }>
  }

  it('retries on a reply that parsed to no object, and uses the next answer', async () => {
    // `""` is valid JSON that parses to a string — the shape the live runs actually died
    // to. The retry is the difference between a broken build and a built tool.
    let calls = 0
    const fetchImpl: LlmFetch = async () => {
      calls += 1
      return calls === 1 ? envelope('""') : envelope('{"clarification":"which columns?"}')
    }

    const result = await proposeWith(fetchImpl)
    expect(calls).toBe(2)
    expect(result.ok).toBe(true)
    expect(result.reply?.content).toBe('which columns?')
  })

  it('retries a second time when the first retry also comes back empty', async () => {
    // The 2026-10-31 gate reading still lost 5 cases to an empty reply even after the
    // one retry — two retries is what the failure count bought.
    let calls = 0
    const fetchImpl: LlmFetch = async () => {
      calls += 1
      return calls <= 2 ? envelope('""') : envelope('{"clarification":"which columns?"}')
    }

    const result = await proposeWith(fetchImpl)
    expect(calls).toBe(3)
    expect(result.ok).toBe(true)
    expect(result.reply?.content).toBe('which columns?')
  })

  it('gives up after two retries when the endpoint keeps returning nothing usable', async () => {
    let calls = 0
    const fetchImpl: LlmFetch = async () => {
      calls += 1
      return envelope('""')
    }

    const result = await proposeWith(fetchImpl)
    expect(calls).toBe(3)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('EMPTY_REPLY')
  })

  it('does not retry a parsed answer with no candidates — that is the model deciding', async () => {
    let calls = 0
    const fetchImpl: LlmFetch = async () => {
      calls += 1
      return envelope('{"candidates": []}')
    }

    const result = await proposeWith(fetchImpl)
    expect(calls).toBe(1)
    expect(result.ok).toBe(false)
    expect(result.error).toBe('EMPTY_REPLY')
  })

  it('wraps a transform pipeline written as a bare op object into a one-op list', async () => {
    // The 2026-10-31 gate reading lost 4 builds to exactly this shape: one op written
    // where the DSL declares an array of ops. Same meaning, repaired at the boundary.
    const candidate = {
      tool_id: 'tool_test01',
      name: 'Books',
      description: 'Extracts books.',
      category: 'data',
      url_pattern: 'https://example.com/products',
      version: 1,
      steps: [
        {
          type: 'extract',
          mode: 'list',
          selector: '.product',
          fields: { rating: '.stars', price: '.price' },
          field_types: { rating: 'text', price: 'text' },
          field_transforms: {
            rating: { op: 'capture', pattern: '\\w+$', group: 0 },
            price: [{ op: 'capture', pattern: '[\\d.]+', group: 0 }],
          },
          output_to: 'raw_items',
        },
        { type: 'render', view: 'table', input_from: 'raw_items' },
      ],
    }
    const fetchImpl: LlmFetch = async () => envelope(JSON.stringify({ candidates: [candidate] }))

    const result = await proposeWith(fetchImpl)
    expect(result.ok).toBe(true)
    const transforms = result.candidates?.[0]?.steps[0]?.field_transforms as Record<string, unknown>
    expect(transforms.rating).toEqual([{ op: 'capture', pattern: '\\w+$', group: 0 }])
    expect(transforms.price).toEqual([{ op: 'capture', pattern: '[\\d.]+', group: 0 }])
  })

  it('leaves transform values that are not a bare op object for the validator to report', async () => {
    const candidate = {
      tool_id: 'tool_test02',
      name: 'Books',
      description: 'Extracts books.',
      category: 'data',
      url_pattern: 'https://example.com/products',
      version: 1,
      steps: [
        {
          type: 'extract',
          mode: 'list',
          selector: '.product',
          fields: { rating: '.stars' },
          field_types: { rating: 'text' },
          field_transforms: { rating: 'star-rating (\\w+)' },
          output_to: 'raw_items',
        },
        { type: 'render', view: 'table', input_from: 'raw_items' },
      ],
    }
    const fetchImpl: LlmFetch = async () => envelope(JSON.stringify({ candidates: [candidate] }))

    const result = await proposeWith(fetchImpl)
    expect(result.ok).toBe(true)
    const transforms = result.candidates?.[0]?.steps[0]?.field_transforms as Record<string, unknown>
    expect(transforms.rating).toBe('star-rating (\\w+)')
  })
})

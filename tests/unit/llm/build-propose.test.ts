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

describe('handleBuildPropose — the empty-reply retry', () => {
  const SETTINGS = {
    api_key: 'sk-juxbly-test-0000000000',
    api_base_url: 'https://api.openai.com/v1',
    model: '',
    floating_ball_enabled: true,
  }

  function envelope(content: string): { ok: true; status: number; text: () => Promise<string> } {
    return { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content } }] }) }
  }

  async function proposeWith(fetchImpl: LlmFetch): Promise<{ ok: boolean; error?: string; reply?: { content: string } }> {
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
    ) as Promise<{ ok: boolean; error?: string; reply?: { content: string } }>
  }

  it('retries once on a reply that parsed to no object, and uses the second answer', async () => {
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

  it('gives up after exactly one retry when the endpoint keeps returning nothing usable', async () => {
    let calls = 0
    const fetchImpl: LlmFetch = async () => {
      calls += 1
      return envelope('""')
    }

    const result = await proposeWith(fetchImpl)
    expect(calls).toBe(2)
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
})

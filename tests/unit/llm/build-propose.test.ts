import { describe, expect, it } from 'vitest'
import type { PageAnalysis } from '@juxbly/core'
import { buildInstruction } from '@juxbly/llm'

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

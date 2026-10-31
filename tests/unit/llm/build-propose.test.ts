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

import { describe, expect, it } from 'vitest'
import { capSample, SEMANTIC_SAMPLE_SIZE } from '@juxbly/health'

/**
 * `SEMANTIC_SAMPLE_SIZE` is a privacy bound, so this test is not about arithmetic — it is
 * about the bound having exactly one enforcer that every caller goes through. The previous
 * version of this assertion did `sample.slice(0, N)` in the test itself and therefore passed
 * no matter what the product code did.
 */
describe('capSample', () => {
  it('caps at SEMANTIC_SAMPLE_SIZE records', () => {
    const sample = Array.from({ length: 50 }, (_, i) => ({ title: `row ${String(i)}` }))

    expect(capSample(sample)).toHaveLength(SEMANTIC_SAMPLE_SIZE)
  })

  it('keeps the first records, in order, so a verdict is reproducible', () => {
    const sample = [1, 2, 3, 4, 5, 6, 7]

    expect(capSample(sample)).toEqual([1, 2, 3, 4, 5])
  })

  it('is idempotent: an already-capped sample passes through unchanged', () => {
    const once = capSample([1, 2, 3, 4, 5, 6, 7])

    expect(capSample(once)).toEqual(once)
  })

  it('leaves a short sample alone and handles the empty case', () => {
    expect(capSample([1, 2])).toEqual([1, 2])
    expect(capSample([])).toEqual([])
  })
})

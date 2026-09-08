import { describe, expect, it } from 'vitest'
import { capSample, SEMANTIC_SAMPLE_SIZE } from '@juxbly/health'
import type { RunOutcome } from '@juxbly/core'
import { healthInputs } from './run-session'

/**
 * Where the automatic health path's sample is built — and therefore where the privacy cap
 * has to hold. `healthInputs` is package-internal, so it is tested from inside the package
 * rather than exported for the test's convenience.
 *
 * The point: 50 rows on the page must not become 50 rows in a prompt (§10). An assertion on
 * `slice(0, N)` written in a test would have passed no matter what the product code did.
 */
const OUTCOME: RunOutcome = {
  ok: true,
  outputs: {},
  usage: { prompt_tokens: 120, completion_tokens: 40 },
  llmCached: false,
  summary: { at: '2026-09-07T00:00:00.000Z', had_data: true, item_count: 50, field_digest: { title: 'text' } },
}

describe('healthInputs', () => {
  it('caps the sample at SEMANTIC_SAMPLE_SIZE records', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ title: `row ${String(i)}` }))

    expect(healthInputs(OUTCOME, rows).sample).toHaveLength(SEMANTIC_SAMPLE_SIZE)
  })

  it('caps through the shared enforcer, so every caller agrees on what leaves the page', () => {
    const rows = Array.from({ length: 50 }, (_, i) => ({ title: `row ${String(i)}` }))

    expect(healthInputs(OUTCOME, rows).sample).toEqual(capSample(rows))
  })

  it('sends no sample when there is nothing to sample', () => {
    expect(healthInputs(OUTCOME, null).sample).toBeUndefined()
    expect(healthInputs(OUTCOME, []).sample).toBeUndefined()
  })
})

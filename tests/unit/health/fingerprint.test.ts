import { describe, expect, it } from 'vitest'
import { captureFingerprint, judgeStructure } from '@juxbly/health'
import type { StructureFingerprint } from '@juxbly/core'

/**
 * The structure layer's thresholds, at their boundaries (`task/stage-1-11.md`):
 * drift is judged on `container_count` and `field_presence` only — `tag_path` is
 * recorded but deliberately never judged (C4, 2026-09-02), and "no baseline" is a
 * capture, not a verdict.
 */

const AT = '2026-09-08T00:00:00.000Z'

function fingerprint(overrides: Partial<StructureFingerprint> = {}): StructureFingerprint {
  return {
    captured_at: AT,
    container_count: 20,
    tag_path: 'div>ul>li',
    field_presence: { title: 1, price: 0.9 },
    ...overrides,
  }
}

describe('captureFingerprint', () => {
  it('keeps statistics only — the records themselves never enter the fingerprint', () => {
    const captured = captureFingerprint(
      { hitCount: 12, fieldPresence: { title: 0.8 } },
      { tagPath: 'div>ul>li', at: AT },
    )
    expect(captured).toEqual({
      captured_at: AT,
      container_count: 12,
      tag_path: 'div>ul>li',
      field_presence: { title: 0.8 },
    })
  })
})

describe('judgeStructure', () => {
  it('no baseline is not drift — the first run captures, it does not judge', () => {
    expect(judgeStructure(null, fingerprint())).toEqual({
      layer: 'no-baseline',
      reason: expect.any(String),
    })
  })

  it('an identical fingerprint is ok', () => {
    expect(judgeStructure(fingerprint(), fingerprint()).layer).toBe('ok')
  })

  it('container count dropping to exactly the floor is ok; below it is drift', () => {
    const baseline = fingerprint({ container_count: 20 })
    // Floor = 20 × (1 − 0.5) = 10: at the threshold is still "not drifted".
    expect(judgeStructure(baseline, fingerprint({ container_count: 10 })).layer).toBe('ok')
    expect(judgeStructure(baseline, fingerprint({ container_count: 9 })).layer).toBe('drifted')
  })

  it('a zero-container baseline never counts as a drop', () => {
    const baseline = fingerprint({ container_count: 0 })
    expect(judgeStructure(baseline, fingerprint({ container_count: 0 })).layer).toBe('ok')
  })

  it('field presence dropping by the threshold is drift; less is ok', () => {
    const baseline = fingerprint({ field_presence: { title: 1 } })
    // A drop of FINGERPRINT_PRESENCE_DROP (0.4) or more is drift — the threshold is
    // inclusive, so 1 → 0.6 crosses it and 1 → 0.61 does not.
    expect(
      judgeStructure(baseline, fingerprint({ field_presence: { title: 0.61 } })).layer,
    ).toBe('ok')
    expect(
      judgeStructure(baseline, fingerprint({ field_presence: { title: 0.6 } })).layer,
    ).toBe('drifted')
  })

  it('a field the baseline knew but the run lost entirely is drift', () => {
    const baseline = fingerprint({ field_presence: { price: 0.9 } })
    expect(
      judgeStructure(baseline, fingerprint({ field_presence: {} })).layer,
    ).toBe('drifted')
  })

  it('tag_path changes are recorded but never judged (C4)', () => {
    const baseline = fingerprint({ tag_path: 'div>ul>li' })
    expect(
      judgeStructure(baseline, fingerprint({ tag_path: 'section>div>article' })).layer,
    ).toBe('ok')
  })
})

/**
 * Field-level scoring: the arithmetic the second gate is written against.
 *
 * These tests exist because the definitions are easy to get quietly wrong in a
 * flattering direction — counting a truncated value as a miss, or ignoring columns
 * nobody asked for, both move the number without changing the product.
 */
import { describe, expect, it } from 'vitest'
import { fieldMetrics, matches, scoreCase, type GroundTruth } from '../../apps/playground/src/bench/scoring'
import { DIGEST_SCHEMA, toDigest } from '../../apps/playground/src/bench/digest'
import type { CaseResult } from '../../apps/playground/src/bench/types'

const GT: GroundTruth = {
  case_id: 'A-01',
  bucket: 'A',
  expected_fields: ['title', 'price'],
  item_count_range: [2, 2],
  sample: [
    { title: 'A Light in the Attic', price: '£51.77' },
    { title: 'Tipping the Velvet', price: '£53.74' },
  ],
}

function result(overrides: Partial<CaseResult> & { caseId: string }): CaseResult {
  const { caseId, ...rest } = overrides
  return {
    caseId,
    bucket: 'A',
    generatedJson: null,
    generationSucceeded: true,
    actualExtractionResult: null,
    latencyMs: 100,
    repairResult: 'not-attempted',
    ...rest,
  }
}

/** The runner's variable bag: an extract step parks its records under `output_to`. */
function output(items: Record<string, unknown>[]): unknown {
  return { products: { items } }
}

describe('matches', () => {
  it('treats a capped value as the value it was truncated from', () => {
    expect(matches('a light in the', 'A Light in the Attic')).toBe(true)
  })

  it('refuses a prefix too short to be evidence', () => {
    // "£" is a prefix of "£63.00" and is not the price.
    expect(matches('£', '£63.00')).toBe(false)
  })

  it('ignores case, whitespace and trailing punctuation', () => {
    expect(matches('In stock.', 'in stock')).toBe(true)
  })

  it('does not call an empty value a match', () => {
    expect(matches('', 'In stock')).toBe(false)
    expect(matches('In stock', '')).toBe(false)
  })
})

describe('scoreCase', () => {
  it('matches a field by content, under any column name', () => {
    const score = scoreCase(
      result({
        caseId: 'A-01',
        itemCount: 2,
        actualExtractionResult: output([
          { name: 'A Light in the Attic', stock: '£51.77' },
          { name: 'Tipping the Velvet', stock: '£53.74' },
        ]),
      }),
      GT,
    )
    expect(score.fields.map((field) => field.status)).toEqual(['matched', 'matched'])
    expect(score.fields[0]?.via).toBe('name')
  })

  it('counts a column nobody asked for as invented', () => {
    const score = scoreCase(
      result({
        caseId: 'A-01',
        itemCount: 2,
        actualExtractionResult: output([
          { title: 'A Light in the Attic', price: '£51.77', rating: 'Three' },
          { title: 'Tipping the Velvet', price: '£53.74', rating: 'One' },
        ]),
      }),
      GT,
    )
    expect(score.extraFields).toEqual(['rating'])
  })

  it('reports missing fields when the output carries none of the expected values', () => {
    const score = scoreCase(result({ caseId: 'A-01', itemCount: 2, actualExtractionResult: output([{ title: 'Unrelated' }]) }), GT)
    expect(score.fields.map((field) => field.status)).toEqual(['missing', 'missing'])
    expect(score.inRange).toBe(true)
  })

  it('keeps the item count out of range visible instead of folding it into fields', () => {
    const score = scoreCase(result({ caseId: 'A-01', itemCount: 232, actualExtractionResult: output([]) }), GT)
    expect(score.inRange).toBe(false)
    expect(score.itemCount).toBe(232)
  })
})

describe('fieldMetrics', () => {
  it('counts invented columns against precision', () => {
    const metrics = fieldMetrics([
      scoreCase(result({ caseId: 'A-01', itemCount: 2, actualExtractionResult: output([{ title: 'A Light in the Attic', price: '£51.77' }, { title: 'Tipping the Velvet', price: '£53.74' }]) }), GT),
      // Asked for two fields, produced neither — but invented a third.
      scoreCase(result({ caseId: 'A-02', itemCount: 2, actualExtractionResult: output([{ rating: 'One' }]) }), GT),
    ])
    // 4 expected instances: 2 matched, 2 missing. One invented column.
    expect(metrics.instances).toBe(4)
    expect(metrics.matched).toBe(2)
    expect(metrics.extra).toBe(1)
    expect(metrics.recall).toBeCloseTo(0.5, 5)
    expect(metrics.precision).toBeCloseTo(2 / 3, 5)
    expect(metrics.f1).toBeCloseTo(0.5714, 3)
  })

  it('returns null rather than zero when nothing was produced', () => {
    const metrics = fieldMetrics([])
    expect(metrics.instances).toBe(0)
    expect(metrics.precision).toBeNull()
    expect(metrics.recall).toBeNull()
    expect(metrics.f1).toBeNull()
  })
})

describe('toDigest', () => {
  it('keeps the proposal and drops the output, which replay recomputes', () => {
    const run = {
      runId: 'run-1',
      startedAt: '2026-09-19T00:00:00.000Z',
      finishedAt: '2026-09-19T00:01:00.000Z',
      corpusRevision: '2026-09-10T16:28:04.724Z',
      model: 'deepseek/deepseek-chat',
      cases: [
        result({
          caseId: 'A-01',
          itemCount: 2,
          generatedJson: { name: 't', steps: [] },
          actualExtractionResult: output([{ title: 'A Light in the Attic' }]),
          tokenUsage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      ],
    }
    const digest = toDigest(run)
    expect(digest.schema).toBe(DIGEST_SCHEMA)
    // The pool is the record now: the winner alone cannot be re-selected on replay.
    expect(digest.cases[0]?.candidates).toEqual([{ name: 't', steps: [] }])
    expect(digest.cases[0]?.recordedItemCount).toBe(2)
    expect(JSON.stringify(digest)).not.toContain('A Light in the Attic')
  })
})

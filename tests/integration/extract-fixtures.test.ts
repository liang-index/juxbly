// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { runExtract } from '@juxbly/capabilities'
import type { ExtractStep } from '@juxbly/dsl'
import { createFixtureHost } from '../fixtures/page-host'
import lazyList from '../fixtures/ground-truth/lazy-list.json'
import listPage from '../fixtures/ground-truth/list-page.json'
import mixedFields from '../fixtures/ground-truth/mixed-fields.json'
import shadowList from '../fixtures/ground-truth/shadow-list.json'
import singleRecord from '../fixtures/ground-truth/single-record.json'

/**
 * The acceptance test for `extract`: every fixture is compared against a ground-truth
 * file, not against whatever the implementation happens to produce.
 *
 * The ground truth is written in the shape `docs/contributing/BENCHMARK_GUIDE.md`
 * defines (`id` / `bucket` / `task_description` / `expected_fields` / `ground_truth` /
 * `notes`), plus `fixture` and `extract` — the two a static corpus case does not need
 * because the runner supplies them. That is what lets Phase 2 lift these files into the
 * web corpus instead of rewriting them.
 */
interface GroundTruthCase {
  id: string
  bucket: string
  fixture: string
  extract: ExtractStep
  expected_fields: string[]
  ground_truth: {
    item_count_range: [number, number]
    sample: Record<string, unknown>[]
  }
  expected_missing_fields: string[]
}

// The JSON carries `mode: "list"` as a string, which cannot narrow to the DSL union on
// its own; the cast is the one narrowing step, and the fixtures are what prove it right.
const CASES = [listPage, shadowList, singleRecord, mixedFields, lazyList] as unknown as GroundTruthCase[]

describe('extract against the fixture corpus', () => {
  for (const testCase of CASES) {
    it(`${testCase.id} (${testCase.bucket}) ${testCase.fixture}: matches ground truth`, async () => {
      const host = createFixtureHost(testCase.fixture)

      const result = await runExtract({ step: testCase.extract, items: [] }, host.dom)

      const [min, max] = testCase.ground_truth.item_count_range
      expect(result.hitCount).toBeGreaterThanOrEqual(min)
      expect(result.hitCount).toBeLessThanOrEqual(max)
      expect(result.items).toEqual(testCase.ground_truth.sample)
      expect(result.missingFields).toEqual(testCase.expected_missing_fields)
      expect(Object.keys(result.fieldPresence)).toEqual(testCase.expected_fields)
      expect(result.truncated).toBe(false)
    })
  }

  it('covers every difficulty bucket the four listed fixtures require', () => {
    // A: regular, C: shadow DOM, D: infinite scroll. Bucket coverage is what the guide
    // asks a corpus to report, so it is asserted rather than assumed.
    expect(CASES.map((testCase) => testCase.bucket).sort()).toEqual(['A', 'A', 'A', 'C', 'D'])
  })
})

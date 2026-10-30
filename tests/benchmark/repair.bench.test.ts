/**
 * Round B — the closed-loop repair round's own tests.
 *
 * Same discipline as `runner.bench.test.ts`: a real corpus snapshot, a real engine, only
 * the model call replaced. What is under test is the adoption rule (repaired replaces
 * original only when it validates and runs cleanly with at least one item) and the
 * bookkeeping (`repairResult`, `repairedCandidates`, merged token usage) a digest
 * replay later re-applies.
 */
import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '@juxbly/dsl'
import { runBenchmark } from '../../apps/playground/src/bench/runner'
import { sampleRowsFromOutputs } from '../../apps/playground/src/bench/repair'
import type { ProposeFn, Proposal, ProposeRequest } from '../../apps/playground/src/bench/propose'
import type { CaseResult, RunResult } from '../../apps/playground/src/bench/types'

const MODEL = 'test-model'

/** A tool that works on the A-01 snapshot: 20 books in `article.product_pod`. */
const BOOKS_TOOL: ToolDefinition = {
  tool_id: 'tool_bench_repair',
  name: 'Book list',
  category: 'data',
  url_pattern: 'books.toscrape.com/*',
  version: 1,
  steps: [
    {
      type: 'extract',
      mode: 'list',
      selector: 'article.product_pod',
      fields: { title: 'h3 a', price: '.price_color' },
      output_to: 'raw_items',
    },
  ],
  created_at: '2026-09-15T00:00:00.000Z',
  updated_at: '2026-09-15T00:00:00.000Z',
}

/** A repaired candidate: different tool id, valid §5.4, and it runs on this page. */
const REPAIRED_TOOL: ToolDefinition = {
  ...BOOKS_TOOL,
  tool_id: 'tool_bench_repaired',
  steps: [
    {
      type: 'extract',
      mode: 'list',
      selector: 'article.product_pod',
      fields: { title: 'h3 a', price: '.price_color', stars: 'p.star-rating' },
      output_to: 'raw_items',
    },
  ],
}

/** A candidate that validates but matches nothing — the repair that helped nobody. */
const EMPTY_REPAIR: ToolDefinition = {
  ...REPAIRED_TOOL,
  tool_id: 'tool_bench_repair_empty',
  steps: [{ type: 'extract', mode: 'list', selector: 'table.does-not-exist', fields: { title: ':self' }, output_to: 'raw_items' }],
}

function proposalOf(tool: ToolDefinition | null, askedQuestion = false): Proposal {
  return { tool, candidates: tool === null ? [] : [tool], askedQuestion }
}

/** The first call proposes the draft; the repair call (request.repair present) answers per script. */
function scriptedProposer(repairReply: Proposal): ProposeFn {
  return async (request: ProposeRequest) => (request.repair === undefined ? proposalOf(BOOKS_TOOL) : repairReply)
}

function only(run: RunResult): CaseResult {
  const [first] = run.cases
  if (first === undefined) throw new Error('expected exactly one case result')
  return first
}

describe('repair round (variant `repair`)', () => {
  it('adopts a repaired tool that validates and runs, and records the pool', async () => {
    const run = await runBenchmark({
      model: MODEL,
      settings: { apiKey: 'not-used' },
      caseId: 'A-01',
      variant: 'repair',
      propose: scriptedProposer(proposalOf(REPAIRED_TOOL)),
    })

    const result = only(run)
    expect(result.repairResult).toBe('success')
    expect(result.generatedJson).toEqual(REPAIRED_TOOL)
    expect(result.repairedCandidates).toEqual([REPAIRED_TOOL])
    expect(result.itemCount).toBe(20)
    expect(result.generationSucceeded).toBe(true)
    // The draft call, the dry-run execution and the repair call are all real cost.
    expect(result.tokenUsage?.prompt_tokens ?? 0).toBeGreaterThanOrEqual(0)
  })

  it('keeps the original when the repaired pool is empty (model asked a question)', async () => {
    const run = await runBenchmark({
      model: MODEL,
      settings: { apiKey: 'not-used' },
      caseId: 'A-01',
      variant: 'repair',
      propose: scriptedProposer({ tool: null, candidates: [], askedQuestion: true }),
    })

    const result = only(run)
    expect(result.repairResult).toBe('failed')
    expect(result.generatedJson).toEqual(BOOKS_TOOL)
    expect(result.itemCount).toBe(20)
    expect(result.repairedCandidates).toEqual([])
    expect(result.neededClarification).toBeUndefined()
  })

  it('keeps the original when the repaired tool matches nothing', async () => {
    const run = await runBenchmark({
      model: MODEL,
      settings: { apiKey: 'not-used' },
      caseId: 'A-01',
      variant: 'repair',
      propose: scriptedProposer(proposalOf(EMPTY_REPAIR)),
    })

    const result = only(run)
    expect(result.repairResult).toBe('failed')
    expect(result.generatedJson).toEqual(BOOKS_TOOL)
    expect(result.itemCount).toBe(20)
  })

  it('control runs never repair', async () => {
    const run = await runBenchmark({
      model: MODEL,
      settings: { apiKey: 'not-used' },
      caseId: 'A-01',
      propose: scriptedProposer(proposalOf(REPAIRED_TOOL)),
    })

    const result = only(run)
    expect(result.repairResult).toBe('not-attempted')
    expect(result.repairedCandidates).toBeUndefined()
    expect(result.itemCount).toBe(20)
  })
})

describe('sampleRowsFromOutputs', () => {
  it('finds the extract output by shape and truncates long cells', () => {
    const long = 'x'.repeat(500)
    const rows = sampleRowsFromOutputs({
      raw_items: {
        items: [{ title: long, price: '£51.77' }, { title: 'b', price: '£2' }],
        hitCount: 20,
        fieldPresence: { title: 1, price: 1 },
      },
    })

    expect(rows).toHaveLength(2)
    expect(rows[0]?.title).toBe(`${'x'.repeat(200)}…`)
    expect(rows[0]?.price).toBe('£51.77')
    expect(rows[1]?.title).toBe('b')
  })

  it('returns nothing when the bag holds no extract-shaped value', () => {
    expect(sampleRowsFromOutputs({ raw_items: { items: 'not-an-array' } })).toEqual([])
    expect(sampleRowsFromOutputs({})).toEqual([])
  })
})

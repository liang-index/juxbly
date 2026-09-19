/**
 * Stage 2-3 — the runner's own tests.
 *
 * They run against a real corpus snapshot with an injected proposer: the page, the
 * traversal and the engine are production code, only the model call is replaced. A
 * benchmark runner tested against a stubbed engine would be testing nothing.
 */
import { mkdir, readFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { ToolDefinition } from '@juxbly/dsl'
import { mountDeclarativeShadowRoots } from '../../apps/playground/src/bench/corpus-host'
import { readCase, runBenchmark, writeRunResult } from '../../apps/playground/src/bench/runner'
import type { Proposal } from '../../apps/playground/src/bench/propose'
import type { CaseResult, RunResult } from '../../apps/playground/src/bench/types'

/** Every case here runs exactly one case; the index is checked rather than assumed. */
function only(run: RunResult): CaseResult {
  const [first] = run.cases
  if (first === undefined) throw new Error('expected exactly one case result')
  return first
}

const BENCHMARK_DIR = resolve(process.cwd(), 'tests', 'benchmark')
const MODEL = 'test-model'

/** A tool that works on the A-01 snapshot: 20 books in `article.product_pod`. */
const BOOKS_TOOL: ToolDefinition = {
  tool_id: 'tool_bench_test',
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

describe('benchmark runner', () => {
  it('runs one case and reports what happened', async () => {
    const run = await runBenchmark({
      model: MODEL,
      settings: { apiKey: 'not-used' },
      caseId: 'A-01',
      propose: async () => ({ tool: BOOKS_TOOL, askedQuestion: false }),
    })

    expect(run.cases).toHaveLength(1)
    const result = only(run)
    expect(result.caseId).toBe('A-01')
    expect(result.bucket).toBe('A')
    expect(result.generationSucceeded).toBe(true)
    expect(result.itemCount).toBe(20)
    expect(result.healthStatus).toBe('healthy')
    expect(result.repairResult).toBe('not-attempted')
    expect(result.latencyMs).toBeGreaterThanOrEqual(0)
    expect(run.corpusRevision).not.toBe('unknown')
  })

  it('records a generation failure instead of scoring it', async () => {
    const run = await runBenchmark({
      model: MODEL,
      settings: { apiKey: 'not-used' },
      caseId: 'A-01',
      propose: async () => ({ tool: null, error: 'EMPTY_REPLY', askedQuestion: false }),
    })

    const result = only(run)
    expect(result.generationSucceeded).toBe(false)
    expect(result.generationError).toBe('EMPTY_REPLY')
    expect(result.actualExtractionResult).toBeNull()
    expect(result.healthStatus).toBeUndefined()
  })

  it('re-asks once when the model answers with a question', async () => {
    const attempts: boolean[] = []
    const propose: (request: { noMoreQuestions: boolean }) => Promise<Proposal> = async (request) => {
      attempts.push(request.noMoreQuestions)
      if (request.noMoreQuestions) return { tool: BOOKS_TOOL, askedQuestion: false }
      return { tool: null, askedQuestion: true }
    }

    const run = await runBenchmark({
      model: MODEL,
      settings: { apiKey: 'not-used' },
      caseId: 'A-01',
      propose,
    })

    expect(attempts).toEqual([false, true])
    const result = only(run)
    expect(result.neededClarification).toBe(true)
    expect(result.generationSucceeded).toBe(true)
  })

  it('names the missing case when a case id does not exist', async () => {
    await expect(readCase('Z-99')).rejects.toThrow(/Z-99/)
  })

  it('refuses to overwrite a recorded run', async () => {
    const directory = join(BENCHMARK_DIR, 'results', '.tmp-test')
    const path = join(directory, 'run.json')
    await rm(directory, { recursive: true, force: true })
    await mkdir(directory, { recursive: true })

    const run = await runBenchmark({
      model: MODEL,
      settings: { apiKey: 'not-used' },
      caseId: 'A-01',
      propose: async () => ({ tool: BOOKS_TOOL, askedQuestion: false }),
      now: () => new Date('2026-09-15T00:00:00.000Z'),
    })

    await writeRunResult({ ...run, runId: 'run' }, directory)
    await expect(writeRunResult({ ...run, runId: 'run' }, directory)).rejects.toThrow()
    expect(JSON.parse(await readFile(path, 'utf8')).runId).toBe('run')
    await rm(directory, { recursive: true, force: true })
  })
})

describe('corpus host', () => {
  it('mounts declarative shadow roots so a bucket-C snapshot keeps its content', () => {
    const document = new DOMParser().parseFromString(
      '<div id="host"><template shadowrootmode="open"><span class="title">inside</span></template></div>',
      'text/html',
    )
    mountDeclarativeShadowRoots(document)

    const host = document.getElementById('host')
    expect(host?.shadowRoot?.textContent).toBe('inside')
    expect(document.querySelector('template[shadowrootmode]')).toBeNull()
  })
})

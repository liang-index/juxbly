/**
 * Aggregation and reporting: the part of the benchmark that turns recorded facts into
 * published numbers, so it is also the part where a dishonest default would hide.
 */
import { describe, expect, it } from 'vitest'
import { aggregate } from '../../apps/playground/src/bench/metrics'
import { renderReport } from '../../apps/playground/src/bench/report'
import type { CaseResult, LabeledResult, MetricsReport, RunResult } from '../../apps/playground/src/bench/types'

function result(overrides: Partial<CaseResult> & { caseId: string; bucket: CaseResult['bucket'] }): CaseResult {
  return {
    generatedJson: null,
    generationSucceeded: true,
    actualExtractionResult: null,
    latencyMs: 100,
    repairResult: 'not-attempted',
    ...overrides,
  }
}

const RUN: RunResult = {
  runId: 'run-1',
  startedAt: '2026-09-15T00:00:00.000Z',
  finishedAt: '2026-09-15T00:01:00.000Z',
  corpusRevision: '2026-09-10T16:28:04.724Z',
  model: 'gpt-4o-mini',
  cases: [
    result({ caseId: 'A-01', bucket: 'A', itemCount: 20, healthStatus: 'healthy', latencyMs: 100 }),
    result({ caseId: 'A-02', bucket: 'A', itemCount: 10, healthStatus: 'degraded', neededClarification: true, latencyMs: 300 }),
    result({ caseId: 'C-01', bucket: 'C', itemCount: 0, healthStatus: 'broken', latencyMs: 200 }),
    result({ caseId: 'C-02', bucket: 'C', generationSucceeded: false, generationError: 'EMPTY_REPLY', latencyMs: 50 }),
  ],
}

const LABELED: LabeledResult[] = [
  { caseId: 'A-01', label: 'correct', notes: 'all fields right', judgedAt: '2026-09-15', judge: 'zan' },
  { caseId: 'A-02', label: 'partial', notes: 'one field wrong', judgedAt: '2026-09-15', judge: 'zan' },
]

describe('aggregate', () => {
  it('counts a case as usable only when it built, ran and returned items', () => {
    const report = aggregate(RUN, LABELED)
    expect(report.total).toBe(4)
    // A-01 and A-02 built and returned items; C-01 returned none, C-02 never built.
    expect(report.buildSuccessRate).toBe(0.5)
  })

  it('reports unjudged cases as pending instead of counting them as wrong', () => {
    const report = aggregate(RUN, LABELED)
    expect(report.labelCounts).toEqual({ correct: 1, partial: 1, wrong: 0, pending: 2 })
    expect(report.pendingCases).toEqual(['C-01', 'C-02'])
  })

  it('measures correction rate and first-run health false positives', () => {
    const report = aggregate(RUN, LABELED)
    expect(report.correctionRate).toBe(0.25)
    // Of the three cases that ran, two were flagged on a page that had never broken.
    expect(report.healthFalsePositiveRate).toBeCloseTo(2 / 3)
  })

  it('leaves repair success unmeasured rather than reporting a flattering zero', () => {
    expect(aggregate(RUN, LABELED).repairSuccessRate).toBeNull()
  })

  it('splits every rate by bucket', () => {
    const report = aggregate(RUN, LABELED)
    expect(report.byBucket.A).toMatchObject({ cases: 2, buildSuccessRate: 1, correctionRate: 0.5 })
    expect(report.byBucket.C).toMatchObject({ cases: 2, buildSuccessRate: 0 })
    expect(report.byBucket.E.buildSuccessRate).toBeNull()
  })

  it('names the one error that stopped every case, so an outage is not read as 0%', () => {
    const outage: RunResult = {
      ...RUN,
      cases: [
        result({ caseId: 'A-01', bucket: 'A', generationSucceeded: false, generationError: 'NETWORK' }),
        result({ caseId: 'B-01', bucket: 'B', generationSucceeded: false, generationError: 'NETWORK' }),
      ],
    }
    expect(aggregate(outage).environmentFailure).toBe('NETWORK')
  })

  it('reports no environment failure once a single case reaches the model', () => {
    const mixed: RunResult = {
      ...RUN,
      cases: [
        result({ caseId: 'A-01', bucket: 'A', itemCount: 5 }),
        result({ caseId: 'B-01', bucket: 'B', generationSucceeded: false, generationError: 'NETWORK' }),
      ],
    }
    expect(aggregate(mixed).environmentFailure).toBeNull()
  })

  it('gives every failure a reason, not just a count', () => {
    const failures = aggregate(RUN, LABELED).failedCases
    // In case order: C-01 ran and found nothing, C-02 never produced a tool.
    expect(failures).toEqual([
      { caseId: 'C-01', bucket: 'C', stage: 'execution', detail: 'ran but extracted 0 items' },
      { caseId: 'C-02', bucket: 'C', stage: 'generation', detail: 'EMPTY_REPLY' },
    ])
  })
})

describe('renderReport', () => {
  it('always states the corpus revision, the model and the date', () => {
    const markdown = renderReport(aggregate(RUN, LABELED))
    expect(markdown).toContain(RUN.corpusRevision)
    expect(markdown).toContain('gpt-4o-mini')
    expect(markdown).toContain('C-02')
  })

  it('prints the delta against the previous run', () => {
    const now = aggregate(RUN, LABELED)
    const before: MetricsReport = { ...now, runId: 'run-0', buildSuccessRate: 0.25 }
    const markdown = renderReport(now, before)
    expect(markdown).toContain('+25.0 pp')
    expect(markdown).toContain('Previous')
  })

  it('says when nothing failed rather than leaving the section empty', () => {
    const [firstCase] = RUN.cases
    const clean = aggregate({ ...RUN, cases: firstCase === undefined ? [] : [firstCase] })
    expect(renderReport(clean)).toContain('None.')
  })

  it('leads with the outage banner so the numbers cannot be read first', () => {
    const outage = aggregate({
      ...RUN,
      cases: [
        result({ caseId: 'A-01', bucket: 'A', generationSucceeded: false, generationError: 'NETWORK' }),
        result({ caseId: 'A-02', bucket: 'A', generationSucceeded: false, generationError: 'NETWORK' }),
      ],
    })
    const markdown = renderReport(outage)
    expect(markdown).toContain('Not a benchmark result')
    expect(markdown).toContain('NETWORK')
    // The warning has to precede the first number, not follow it.
    expect(markdown.indexOf('Not a benchmark result')).toBeLessThan(markdown.indexOf('Headline'))
  })
})

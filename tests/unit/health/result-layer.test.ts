import { describe, expect, it } from 'vitest'
import { judgeResult } from '@juxbly/health'
import type { RunSummary } from '@juxbly/core'

/**
 * Result layer — `docs/ARCHITECTURE.md` §10, `task/stage-1-11.md` Tests.
 *
 * Two "no opinion" cases carry most of the value here: a young tool and an always-empty
 * tool. Both would otherwise be reported as broken on their first runs, which is the
 * fastest way to teach a user that the health badge is noise.
 */
const AT = '2026-09-08T00:00:00.000Z'

function run(itemCount: number, digest: Record<string, string> = {}): RunSummary {
  return { at: AT, had_data: itemCount > 0, item_count: itemCount, field_digest: digest }
}

const HISTORY = [run(12, { price: 'numeric' }), run(10, { price: 'numeric' }), run(11, { price: 'numeric' })]

describe('result layer', () => {
  it('has no opinion before there is a pattern to deviate from', () => {
    expect(judgeResult([run(5), run(5)], run(0)).layer).toBe('no-baseline')
  })

  it('does not call a tool broken when it has never returned rows', () => {
    // "Always empty" is a fact about the page, not evidence of breakage — a tool that has
    // never worked cannot have stopped working.
    const alwaysEmpty = [run(0), run(0), run(0), run(0)]
    expect(judgeResult(alwaysEmpty, run(0)).layer).toBe('no-baseline')
  })

  it('reports a collapse to nothing', () => {
    expect(judgeResult(HISTORY, run(0)).layer).toBe('deviated')
  })

  it('reports a field that changed shape', () => {
    // The price column turning into prose is the classic silent breakage: the run
    // "succeeds", the table fills, and every number in it is now a sentence.
    const current = run(11, { price: 'text' })
    expect(judgeResult(HISTORY, current).layer).toBe('deviated')
  })

  it('stays quiet when the run looks like the runs before it', () => {
    expect(judgeResult(HISTORY, run(11, { price: 'numeric' })).layer).toBe('ok')
  })

  it('has no opinion about a field whose history disagrees with itself', () => {
    // A baseline that flickers between shapes is no baseline; judging against it would
    // make the tool flap between healthy and degraded on every run.
    const flickering = [run(5, { a: 'text' }), run(5, { a: 'numeric' }), run(5, { a: 'text' })]
    expect(judgeResult(flickering, run(5, { a: 'numeric' })).layer).toBe('ok')
  })

  it('explains itself without quoting the page', () => {
    const result = judgeResult(HISTORY, run(0))
    expect(result.reason).toContain('found nothing')
    expect(result.reason).not.toContain('price')
  })
})

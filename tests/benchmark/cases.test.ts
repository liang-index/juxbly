/**
 * Task Corpus guards — `task/stage-2-2.md` Tests 1/2, AC 3/4.
 *
 * These exist because ground truth is the thing Phase 2 measures against, and it is the one
 * artefact nobody can regenerate: it was read off a page by a person on a day. The failure
 * mode they guard against is not a bug — it is a case quietly losing its sample, a range
 * being widened until it can no longer be wrong, or a task being reworded into a selector
 * hint so that the number goes up.
 *
 * The health check lives in `scripts/check-cases.mjs` and is invoked rather than reimplemented:
 * the maintainer and CI must be running the same code.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const BENCH = join(ROOT, 'tests/benchmark')

/** Buckets the stage requires end to end, and the floor for the rest. */
const FULL_COVERAGE_BUCKETS = ['A', 'C']
const MIN_CASES_PER_BUCKET = 3

interface CaseFile {
  id: string
  bucket: string
  url: string
  task_description: string
  expected_fields: string[]
}

interface GroundTruthFile {
  case_id: string
  item_count_range: [number, number]
  sample: Record<string, unknown>[]
}

interface CasesReport {
  ok: boolean
  count: number
  coverage: Record<string, number>
  corpus: Record<string, number>
  problems: string[]
  cases: CaseFile[]
}

function runCli(script: string, args: string[] = []): string {
  return execFileSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: 'utf8' })
}

let cached: CasesReport | null = null

/** Invoked once and memoised: see corpus.test.ts — a per-test run makes the timeout a function of machine load. */
function healthCheck(): CasesReport {
  cached ??= JSON.parse(runCli('scripts/check-cases.mjs', ['--json'])) as CasesReport
  return cached
}

function cases(): CaseFile[] {
  return readdirSync(join(BENCH, 'cases'))
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(BENCH, 'cases', f), 'utf8')) as CaseFile)
}

function groundTruth(id: string): GroundTruthFile {
  return JSON.parse(readFileSync(join(BENCH, 'ground-truth', `${id}.json`), 'utf8')) as GroundTruthFile
}

describe('task corpus', { timeout: 30_000 }, () => {
  it('passes the health check', () => {
    const report = healthCheck()
    expect(report.problems).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('covers A and C end to end and every other bucket at least three times', () => {
    const { coverage, corpus } = healthCheck()
    for (const bucket of FULL_COVERAGE_BUCKETS) {
      expect(coverage[bucket], `bucket ${bucket}`).toBe(corpus[bucket])
    }
    for (const bucket of Object.keys(corpus)) {
      if (FULL_COVERAGE_BUCKETS.includes(bucket)) continue
      expect(coverage[bucket], `bucket ${bucket}`).toBeGreaterThanOrEqual(MIN_CASES_PER_BUCKET)
    }
  })

  it('writes every task the way a user would say it, not the way an engineer would', () => {
    for (const c of cases()) {
      expect(c.task_description.length, c.id).toBeGreaterThan(20)
      expect(c.task_description.trim(), c.id).toMatch(/[.?!]$/)
      // The one thing a task must not smuggle in: the selector that answers it.
      expect(c.task_description, c.id).not.toMatch(/querySelector|getElementsBy|document\./i)
      expect(c.task_description, c.id).not.toMatch(/(^|\s)[.#][a-z][\w-]*(\s|,|$)/i)
    }
  })

  it('gives every case a range that can still be wrong and a sample that carries every field', () => {
    for (const c of cases()) {
      const gt = groundTruth(c.id)
      expect(gt.case_id, c.id).toBe(c.id)
      const [min, max] = gt.item_count_range
      expect(min, c.id).toBeGreaterThan(0)
      expect(max, c.id).toBeGreaterThanOrEqual(min)
      // A range wide enough to hold anything is not ground truth, it is an alibi.
      expect(max, c.id).toBeLessThanOrEqual(min * 3 + 10)

      expect(gt.sample.length, c.id).toBeGreaterThan(0)
      for (const item of gt.sample) {
        for (const field of c.expected_fields) {
          const value = item[field]
          expect(value, `${c.id}.${field}`).not.toBeUndefined()
          expect(value, `${c.id}.${field}`).not.toBeNull()
          if (typeof value === 'string') expect(value.trim(), `${c.id}.${field}`).not.toBe('')
        }
      }
    }
  })
})

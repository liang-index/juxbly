/**
 * Web Corpus guards — `task/stage-2-1.md` Tests 1/2/3, AC 1/2/4/5.
 *
 * These tests exist because a corpus is only a benchmark while it stays still. The failure
 * mode they guard against is not a bug in the code — it is someone quietly removing the
 * three hard cases that make a number look bad, or admitting a page into bucket `C` that has
 * no shadow roots, and the corpus gradually becoming a list of pages Juxbly is good at.
 *
 * The health check itself lives in `scripts/check-corpus.mjs`, and it is invoked rather than
 * reimplemented: the maintainer and CI must be running the same code.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const CORPUS = join(ROOT, 'tests/benchmark/corpus')
const FIXTURES = join(ROOT, 'tests/benchmark/fixtures')

/** Mirrors `BUCKET_RANGE` in the corpus library; restated so a failure names the shape. */
const BUCKET_RANGE: Record<string, [number, number]> = {
  A: [10, 12],
  B: [8, 10],
  C: [8, 10],
  D: [6, 8],
  E: [8, 10],
}

const MIN_SNAPSHOTS = 45

/** The shape `check-corpus.mjs --json` prints, narrowed to what these guards read. */
interface SnapshotMeta {
  id: string
  url: string
  bucket: string
  capturedAt: string
  sizeBytes: number
  verifiedOn: string
  bucketEvidence?: { verdict?: string }
}

interface CorpusReport {
  ok: boolean
  count: number
  distribution: Record<string, number>
  problems: unknown[]
  metas: SnapshotMeta[]
  http: { loaded: unknown[]; failures: unknown[] } | null
}

const META_FIELDS: readonly (keyof SnapshotMeta)[] = [
  'id',
  'url',
  'bucket',
  'capturedAt',
  'sizeBytes',
  'verifiedOn',
]

/**
 * Tests 1 — the capture pipeline, run once per bucket it can be proven against offline.
 *
 * The stage asks for three different buckets. These are the three whose defining property a
 * local page can genuinely have: a repeated structure (`A`), an open shadow root built by a
 * real script (`C`), and generated class names (`E`). Buckets `B` and `D` are not here
 * because they are *behaviour* — client-side routing that survives a click, content that
 * only exists after a scroll — and faking that in a fixture would test the fixture. They are
 * covered live: `probe-sources` verifies every listed source against the real web, and the
 * bucket verdict is recorded in each snapshot's `meta.json`.
 *
 * The fixtures live in `tests/benchmark/fixtures/`, deliberately not in
 * `tests/fixtures/pages/` — those belong to the analyzer tests and change with them. Reusing
 * one is how this test first broke: `list-page.html` lost a sibling and stopped being a
 * bucket-`A` page, taking an unrelated test down with it.
 */
const PIPELINE_CASES: { bucket: string; fixture: string; marker: string }[] = [
  { bucket: 'A', fixture: 'regular-list.html', marker: 'li class="product"' },
  { bucket: 'C', fixture: 'shadow-product-grid.html', marker: 'template shadowrootmode="open"' },
  { bucket: 'E', fixture: 'hashed-cards.html', marker: 'sc-3f7a91c2' },
]

function runCli(script: string, args: string[] = []): string {
  return execFileSync(process.execPath, [script, ...args], { cwd: ROOT, encoding: 'utf8' })
}

/**
 * One health-check run per suite. It spawns the CLI (about 2.5 s) and every guard reads the
 * same report; running it once per test spent six runs on identical output and made the first
 * test's timeout a function of machine load rather than of the corpus.
 */
let cachedReport: CorpusReport | null = null

function healthCheck(): CorpusReport {
  cachedReport ??= JSON.parse(runCli('scripts/check-corpus.mjs', ['--json'])) as CorpusReport
  return cachedReport
}

/**
 * The snapshot pipeline needs Chromium. CI runs `pnpm test` without downloading a browser,
 * so those cases are skipped there rather than made to install 170MB. They are named so the
 * skip is visible in the report — see the stage 2-1 note in `docs/testing/TESTING.md`.
 */
function hasChromium(): boolean {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? join(homedir(), '.cache/ms-playwright')
  if (!existsSync(root)) return false
  return existsSync(join(root, 'chromium-1243')) || existsSync(join(root, 'chromium-1208'))
}

function fixtureUrl(name: string): string {
  return pathToFileURL(join(FIXTURES, name)).href
}

// The health check spawns a CLI (about 2.5 s); the default 5 s per-test budget turns into a
// flaky guard as soon as the machine is busy, and a flaky guard is an ignored guard.
describe('web corpus', { timeout: 30_000 }, () => {
  it('passes the health check', () => {
    const report = healthCheck()
    expect(report.problems).toEqual([])
    expect(report.ok).toBe(true)
  })

  it('holds at least 45 snapshots spread across all five buckets', () => {
    const report = healthCheck()
    expect(report.count).toBeGreaterThanOrEqual(MIN_SNAPSHOTS)
    for (const [bucket, [min, max]] of Object.entries(BUCKET_RANGE)) {
      const count = report.distribution[bucket] ?? 0
      expect(count, `bucket ${bucket}`).toBeGreaterThanOrEqual(min)
      expect(count, `bucket ${bucket}`).toBeLessThanOrEqual(max)
    }
  })

  it('gives every snapshot a complete SnapshotMeta with a unique id and url', () => {
    const report = healthCheck()
    const ids = new Set<string>()
    const urls = new Set<string>()
    for (const meta of report.metas) {
      expect(ids.has(meta.id), `duplicate id ${meta.id}`).toBe(false)
      expect(urls.has(meta.url), `duplicate url ${meta.url}`).toBe(false)
      ids.add(meta.id)
      urls.add(meta.url)
      for (const field of META_FIELDS) {
        expect(meta[field], `${meta.id}.${field}`).toBeTruthy()
      }
      expect(meta.id).toMatch(/^[A-E]-\d{2}$/)
      expect(meta.id.startsWith(meta.bucket)).toBe(true)
    }
  })

  it('records the measurement that put each snapshot in its bucket', () => {
    // A bucket is a fact, not a label, so the evidence is part of the artefact.
    const report = healthCheck()
    for (const meta of report.metas) {
      expect(meta.bucketEvidence, `${meta.id} bucketEvidence`).toBeTruthy()
      expect(typeof meta.bucketEvidence?.verdict).toBe('string')
    }
  })

  it('serves every snapshot offline from the playground', () => {
    const report = healthCheck()
    const { http } = report
    expect(http).toBeTruthy()
    expect(http?.failures).toEqual([])
    expect(http?.loaded.length).toBe(report.count)
  })

  it('publishes an index that agrees with the corpus', () => {
    healthCheck()
    const index = JSON.parse(readFileSync(join(CORPUS, 'index.json'), 'utf8'))
    expect(index.count).toBeGreaterThanOrEqual(MIN_SNAPSHOTS)
    expect(Object.keys(index.buckets).sort()).toEqual(['A', 'B', 'C', 'D', 'E'])
    expect(index.snapshots.length).toBe(index.count)
  })
})

describe.runIf(hasChromium())('snapshot pipeline (needs chromium)', { timeout: 60_000 }, () => {
  it.each(PIPELINE_CASES)(
    'captures a bucket-$bucket page into a loadable snapshot with complete meta',
    async ({ bucket, fixture, marker }) => {
      const out = await mkdtemp(join(tmpdir(), 'juxbly-corpus-'))
      try {
        const stdout = runCli('scripts/snapshot-site.mjs', [
          'capture',
          `TMP-${bucket}`,
          '--url',
          fixtureUrl(fixture),
          '--bucket',
          bucket,
          '--out',
          out,
        ])
        expect(JSON.parse(stdout).ok).toBe(true)

        const dir = join(out, `TMP-${bucket}`)
        const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'))
        for (const field of META_FIELDS) expect(meta[field], field).toBeTruthy()
        expect(meta.id).toBe(`TMP-${bucket}`)
        expect(meta.bucket).toBe(bucket)
        expect(meta.sizeBytes).toBeGreaterThan(0)
        expect(meta.bucketEvidence.verdict).toBeTruthy()

        const html = readFileSync(join(dir, 'index.html'), 'utf8')
        // The bucket property survived the round trip: a snapshot that lost it is a page
        // wearing a harder label, and every future number for that bucket would be a lie.
        expect(html).toContain(marker)
        // Snapshots are structure, not behaviour: no script survives the capture.
        expect(html.toLowerCase()).not.toContain('<script')
        // And nothing in it reaches for the network, which is what "offline-loadable" means.
        // (That the playground can then serve it over HTTP with a non-empty DOM is asserted
        // for all fifty real snapshots by the health-check case above.)
        expect(html).not.toMatch(/(?:src|href)=["']https?:\/\//)

        if (bucket === 'C') {
          // Guards the serializer bug that shipped ten bucket-`C` snapshots with empty
          // `<template>` elements: shadow children belong in `template.content`, which is
          // what the HTML serializer emits, not on the template element itself.
          const template = /<template\s+shadowrootmode="open"\s*>([\s\S]*?)<\/template>/i.exec(html)
          expect(template?.[1]?.trim().length ?? 0).toBeGreaterThan(0)
          expect(html).toContain('card__action')
        }
      } finally {
        await rm(out, { recursive: true, force: true })
      }
    },
  )

  it('refuses a page that does not have the bucket property it claims', async () => {
    // The corpus's central rule, asserted rather than trusted: a page with no shadow root
    // cannot be filed under `C`, however convenient that would be.
    const out = await mkdtemp(join(tmpdir(), 'juxbly-corpus-'))
    try {
      let thrown: unknown = null
      try {
        runCli('scripts/snapshot-site.mjs', [
          'capture',
          'TMP-C',
          '--url',
          fixtureUrl('regular-list.html'),
          '--bucket',
          'C',
          '--out',
          out,
        ])
      } catch (error) {
        thrown = error
      }
      expect(thrown).not.toBeNull()
      expect(existsSync(join(out, 'TMP-C', 'index.html'))).toBe(false)
    } finally {
      await rm(out, { recursive: true, force: true })
    }
  })
})

#!/usr/bin/env node
/**
 * Snapshot the Web Corpus — `task/stage-2-1.md` Files `scripts/snapshot-site.ts`.
 *
 *   node scripts/snapshot-site.mjs list                     the corpus as a table
 *   node scripts/snapshot-site.mjs probe <url...>           measure pages, decide nothing
 *   node scripts/snapshot-site.mjs probe-sources [--only A] measure every candidate
 *   node scripts/snapshot-site.mjs capture <id>             capture one corpus entry
 *   node scripts/snapshot-site.mjs capture <id> --url U --bucket B --out DIR
 *                                                           capture a page that is not listed
 *   node scripts/snapshot-site.mjs capture-sources [--only A] [--skip-existing]
 *                                                           capture every candidate that verifies
 *
 * `probe` exists because a bucket is a fact about a page, not a filing decision. Before a
 * site enters the corpus, this script measures whether it actually has the property — a real
 * `#shadow-root`, a client-side navigation, content that only appears after scrolling. When
 * it does not, the script says so and writes nothing; the answer is to pick another site, not
 * to relabel the page.
 *
 * Capture is deliberately the only write path into `tests/benchmark/corpus/`. Snapshots are a
 * regression baseline; a directory anyone can hand-edit is not one.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { launchBrowser, probeSite, snapshotSite } from '../apps/playground/lib/snapshot.mjs'
import { SNAPSHOT_FILE, snapshotDir, verifyBucket } from '../apps/playground/lib/corpus.mjs'
import { CORPUS_SOURCES, findSource } from './corpus-sources.mjs'

const CONCURRENCY = Number(process.env.JUXBLY_CORPUS_JOBS ?? 4)

async function pool(items, worker, limit) {
  const results = new Array(items.length)
  let cursor = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

async function cmdProbe(urls, options = {}) {
  const browser = await launchBrowser()
  const interaction = options.lazy ? [{ type: 'lazy' }] : []
  const results = await pool(urls, async (url) => probeSite(url, { browser, interaction }), CONCURRENCY)
  await browser.close()
  for (const result of results) reportProbe(result)
  if (results.some((result) => !result.ok)) process.exitCode = 1
}

function reportProbe(result) {
  if (!result.ok) {
    console.log(
      `FAIL  ${result.url}\n      ${String(result.error).split('\n')[0]}`,
    )
    return
  }
  const f = result.features
  console.log(`OK ${result.status}  ${result.url}`)
  console.log(
    `   shadow=${f.shadowRootCount} (with content ${f.shadowRootWithContentCount}, closed ${f.closedShadowRootCount}) custom=${f.customElementCount}` +
      ` repeat=${f.maxRepeatingCount} [${f.maxRepeatingSelector}]` +
      ` hashed=${f.hashedClassTokens}/${f.classTokenCount} (${(f.hashedClassRatio ?? 0).toFixed(2)})`,
  )
  console.log(
    `   spa=${f.spaNavigation} grown=${f.grownGroups} nodes=${f.nodesBeforeScroll}->${f.nodesAfterScroll} title=${JSON.stringify(f.documentTitle)}`,
  )
  for (const bucket of ['A', 'B', 'C', 'D', 'E']) {
    const verdict = verifyBucket(bucket, f)
    console.log(`   ${bucket}: ${verdict.ok ? 'PASS' : '----'}  ${verdict.reason}`)
  }
}

async function cmdProbeSources(only) {
  const sources = CORPUS_SOURCES.filter((source) => !only || source.bucket === only)
  const browser = await launchBrowser()
  const results = await pool(
    sources,
    async (source) => {
      const result = await probeSite(source.url, { browser, interaction: source.interaction })
      return { source, result }
    },
    CONCURRENCY,
  )
  await browser.close()

  for (const { source, result } of results) {
    if (!result.ok) {
      console.log(`${source.id}\tERR\t${result.error}`)
      continue
    }
    const f = result.features
    const verdict = verifyBucket(source.bucket, f)
    console.log(
      [
        source.id,
        verdict.ok ? 'PASS' : 'FAIL',
        source.url,
        `shadow=${f.shadowRootCount}`,
        `custom=${f.customElementCount}`,
        `repeat=${f.maxRepeatingCount}`,
        `hashed=${f.hashedClassTokens}/${f.classTokenCount}`,
        `spa=${f.spaNavigation}`,
        `grow=${f.nodesBeforeScroll}->${f.nodesAfterScroll}`,
        verdict.ok ? '' : verdict.reason,
      ].join('\t'),
    )
  }
}

/**
 * Capture a page that is not in the source list — a `file://` fixture in CI, or a site a
 * maintainer is evaluating before proposing it. The id is required because the corpus is
 * keyed by it, but nothing is added to `corpus-sources.mjs` by this path: admitting a site
 * is a reviewed edit, not a side effect of running a command.
 */
async function cmdCaptureUrl(id, options = {}) {
  const result = await snapshotSite(options.url, options.bucket, {
    id,
    corpusRoot: options.out,
  })
  if (!result.ok) {
    console.log(JSON.stringify({ ok: false, reason: result.reason }))
    process.exitCode = 1
    return
  }
  console.log(JSON.stringify({ ok: true, meta: result.meta, verdict: result.verdict.reason }))
}

async function cmdCapture(id) {
  const source = findSource(id)
  if (!source) {
    console.error(`no source with id ${id}`)
    process.exitCode = 1
    return
  }
  const result = await snapshotSite(source.url, source.bucket, {
    id: source.id,
    interaction: source.interaction,
    rights: source.rights,
    notes: source.notes,
  })
  if (!result.ok) {
    console.error(`${id} REJECTED: ${result.reason}`)
    process.exitCode = 1
    return
  }
  console.log(`${id} captured: ${result.meta.sizeBytes} bytes — ${result.verdict.reason}`)
}

/**
 * Failures that are worth another attempt. A site that timed out or whose client-side
 * navigation lost a race will often pass unchanged, and a corpus that silently loses its
 * hardest pages to a flaky probe is a corpus that flatters the product.
 */
const RETRYABLE = /navigation failed|reloaded the document|grew no repeated structure|Timeout|ERR_CONNECTION/

const ATTEMPTS = 3

async function cmdCaptureSources(only, options = {}) {
  const all = CORPUS_SOURCES.filter((source) => !only || source.bucket === only)
  const sources = options.skipExisting
    ? all.filter((source) => !existsSync(join(snapshotDir(source.id), SNAPSHOT_FILE)))
    : all
  console.log(`${sources.length} of ${all.length} sources to capture`)
  const browser = await launchBrowser()
  const results = await pool(
    sources,
    async (source) => {
      let result = { ok: false, reason: 'not attempted' }
      for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
        try {
          result = await snapshotSite(source.url, source.bucket, {
            id: source.id,
            browser,
            interaction: source.interaction,
            rights: source.rights,
            notes: source.notes,
          })
        } catch (error) {
          result = { ok: false, reason: String(error?.message ?? error) }
        }
        if (result.ok || !RETRYABLE.test(String(result.reason))) break
        if (attempt < ATTEMPTS) console.log(`${source.id}\tretry ${attempt}\t${result.reason}`)
      }
      return { source, result }
    },
    CONCURRENCY,
  )
  await browser.close()

  const captured = []
  for (const { source, result } of results) {
    if (result.ok) {
      captured.push(result.meta)
      console.log(`${source.id}\tOK\t${result.meta.sizeBytes}\t${result.verdict.reason}`)
    } else {
      console.log(`${source.id}\tREJECT\t${result.reason}`)
    }
  }
  console.log(`\n${captured.length}/${sources.length} captured`)
}

async function main() {
  const [command, ...rest] = process.argv.slice(2)
  const flag = (name) => {
    const index = rest.indexOf(`--${name}`)
    return index === -1 ? undefined : rest[index + 1]
  }
  const has = (name) => rest.includes(`--${name}`)

  if (command === 'probe') {
    return cmdProbe(
      rest.filter((arg) => !arg.startsWith('--')),
      { lazy: has('lazy') },
    )
  }
  if (command === 'probe-sources') return cmdProbeSources(flag('only'))
  if (command === 'capture') {
    if (has('url')) {
      return cmdCaptureUrl(rest[0], {
        url: flag('url'),
        bucket: flag('bucket'),
        out: flag('out'),
      })
    }
    return cmdCapture(rest[0])
  }
  if (command === 'capture-sources') {
    return cmdCaptureSources(flag('only'), { skipExisting: has('skip-existing') })
  }
  if (command === 'list') {
    for (const source of CORPUS_SOURCES) {
      console.log(`${source.id}\t${source.bucket}\t${source.url}\t${source.rights?.basis ?? ''}`)
    }
    return
  }

  console.error('usage: snapshot-site.mjs <probe|probe-sources|capture|capture-sources|list> [args]')
  process.exitCode = 1
}

await main()

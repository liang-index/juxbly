#!/usr/bin/env node
/**
 * Cut a set of recorded runs by something other than the whole corpus.
 *
 *   node scripts/bench-breakdown.mjs tests/benchmark/digests/2026-09-19-control-r1.json ...
 *
 * The headline F1 is one number over 50 cases, and one number cannot say *where* the loss
 * is. Twice now the answer to "where" has been a claim about a slice — that two-field
 * cases score zero, that one bucket carries the failure. Both were computed once, by hand,
 * in a scratch file that was then deleted, which leaves a published number that nobody can
 * check. This script is the fix: the slices are computed from the committed digests, on
 * demand, so the table in a report can be reproduced by anyone with the repository.
 *
 * It replays the digests it is given and pools them. Pooling is the caller's decision —
 * pass one reading to describe that reading, or several to describe all of them together —
 * because two variants pooled into one table would average away the difference the table
 * exists to show.
 *
 * No API key, no model calls, no spend: this only re-runs proposals that were recorded.
 */
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import { createViteServer } from 'vitest/node'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * The DOM globals the replay needs. `DOMParser` has to exist before the bench module is
 * loaded: the runner parses corpus snapshots at import time.
 */
const DOM_GLOBALS = [
  'DOMParser',
  'Element',
  'HTMLElement',
  'HTMLTemplateElement',
  'DocumentFragment',
  'ShadowRoot',
  'Node',
  'NodeFilter',
]

function installDom() {
  const { window } = new JSDOM('<!doctype html><html><body></body></html>')
  for (const name of DOM_GLOBALS) {
    globalThis[name] = window[name]
  }
}

/** One row per case-run: which reading it came from, and what it scored. */
async function collect(paths, modules) {
  const { digest: digestModule, cli, scoring } = modules
  const groundTruths = await cli.readGroundTruths()
  const rows = []

  for (const path of paths) {
    const digest = JSON.parse(await readFile(path, 'utf8'))
    const { run, drift } = await digestModule.replayDigest(digest, {
      apiKey: '',
      model: digest.model,
    })
    const variant = digest.variant ?? 'control'

    if (drift.length > 0) {
      process.stderr.write(
        `[JUXBLY] bench-breakdown: ${path} replayed with ${drift.length} drift(s) — its numbers are not comparable.\n`,
      )
      process.exitCode = 1
    }

    for (const entry of run.cases) {
      const groundTruth = groundTruths.get(entry.caseId)
      if (groundTruth === undefined) continue
      rows.push({
        reading: digest.runId,
        variant,
        caseId: entry.caseId,
        asked: groundTruth.expected_fields.length,
        score: scoring.scoreCase(entry, groundTruth),
      })
    }
  }

  return rows
}

const percent = (value) => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`)

/** A metrics table over whatever rows are handed in, keyed by one property. */
function table(title, rows, keyOf, keyOrder, scoring) {
  const lines = [`## ${title}`, '', '| Key | Case-runs | Field F1 | Precision | Recall |', '|---|---|---|---|---|']
  for (const key of keyOrder) {
    const group = rows.filter((row) => keyOf(row) === key)
    if (group.length === 0) continue
    const metrics = scoring.fieldMetrics(group.map((row) => row.score))
    lines.push(
      `| ${key} | ${group.length} | ${percent(metrics.f1)} | ${percent(metrics.precision)} | ${percent(metrics.recall)} |`,
    )
  }
  return lines.join('\n')
}

async function main() {
  const paths = process.argv.slice(2)
  if (paths.length === 0) {
    process.stderr.write('[JUXBLY] bench-breakdown: usage: node scripts/bench-breakdown.mjs <digest.json> ...\n')
    process.exitCode = 1
    return
  }

  installDom()

  const server = await createViteServer({
    root: ROOT,
    configFile: resolve(ROOT, 'vitest.config.ts'),
    logLevel: 'error',
    server: { middlewareMode: true, hmr: false },
  })

  try {
    const modules = {
      digest: await server.ssrLoadModule('/apps/playground/src/bench/digest.ts'),
      cli: await server.ssrLoadModule('/apps/playground/src/bench/cli.ts'),
      scoring: await server.ssrLoadModule('/apps/playground/src/bench/scoring.ts'),
    }

    const rows = await collect(paths, modules)
    const readings = [...new Set(rows.map((row) => row.reading))]
    const variants = [...new Set(rows.map((row) => row.variant))]

    process.stdout.write(`\nReadings pooled: ${readings.length} (${variants.join(', ')}) — ${rows.length} case-runs\n\n`)
    for (const reading of readings) {
      const count = rows.filter((row) => row.reading === reading).length
      const variant = rows.find((row) => row.reading === reading)?.variant
      process.stdout.write(`  ${reading}  [${variant}]  ${count} cases\n`)
    }
    process.stdout.write('\n')

    const asked = [...new Set(rows.map((row) => row.asked))].sort((a, b) => a - b)
    process.stdout.write(`${table('By fields asked for', rows, (row) => row.asked, asked, modules.scoring)}\n\n`)

    const buckets = [...new Set(rows.map((row) => row.score.bucket))].sort()
    process.stdout.write(
      `${table('By bucket', rows, (row) => row.score.bucket, buckets, modules.scoring)}\n\n`,
    )

    // The two slices are not independent — a corpus where one bucket also happens to hold
    // most of the two-field tasks cannot be explained by either alone. This table is what
    // tells the two apart, so a report may not argue one from the other without it.
    const header = ['Bucket', ...asked.map((count) => `${count} field(s)`), 'Total']
    const lines = ['## Cases by bucket and fields asked', '', `| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`]
    for (const bucket of buckets) {
      const cells = asked.map(
        (count) => rows.filter((row) => row.score.bucket === bucket && row.asked === count).length,
      )
      const total = cells.reduce((sum, value) => sum + value, 0)
      lines.push(`| ${bucket} | ${[...cells, total].join(' | ')} |`)
    }
    process.stdout.write(`${lines.join('\n')}\n`)
  } finally {
    await server.close()
  }
}

await main()

#!/usr/bin/env node
/**
 * Corpus health check — `task/stage-2-1.md` Tests 2/3, AC 4/5.
 *
 *   node scripts/check-corpus.mjs [--json] [--no-http]
 *
 * The corpus is a regression baseline, so it needs a guard that fails loudly when someone
 * changes it. This is that guard, and it answers four questions:
 *
 * 1. **Distribution** — is the corpus still spread across `A`–`E` in the ranges stage 2-1
 *    requires, and is it still at least 45 snapshots? An aggregate number only means
 *    something while the underlying mix is held still.
 * 2. **Completeness** — does every snapshot carry a full `SnapshotMeta`, with no duplicate
 *    ids or urls?
 * 3. **Cleanliness** — did any credential survive into a snapshot? (Checked again here, not
 *    only at capture time: the corpus is a directory people can edit.)
 * 4. **Loadability** — can the playground serve every snapshot offline, and is the DOM that
 *    comes back actually a document?
 *
 * Everything except the HTTP pass runs against disk; the HTTP pass starts the playground on
 * an ephemeral loopback port, so it needs no network.
 */
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { JSDOM, VirtualConsole } from 'jsdom'
import { startPlaygroundServer } from '../apps/playground/server.mjs'
import {
  ASSETS_DIR,
  BUCKETS,
  BUCKET_RANGE,
  CORPUS_ROOT,
  ID_PATTERN,
  META_FILE,
  SNAPSHOT_FILE,
  checkCorpus,
  containsCjk,
  countShadowTemplates,
  credentialAttributesIn,
  scanForSecrets,
  writeCorpusIndex,
} from '../apps/playground/lib/corpus.mjs'

const MIN_DOM_NODES = 20
const MIN_TEXT_CHARS = 50

async function listIds() {
  const entries = await readdir(CORPUS_ROOT, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((entry) => entry.isDirectory() && ID_PATTERN.test(entry.name))
    .map((entry) => entry.name)
    .sort()
}

/**
 * AC 5 — nothing admitted into the corpus may carry a credential.
 *
 * This runs on disk *and* at capture time on purpose. Capture refuses a snapshot whose text
 * matches a credential pattern; this pass catches what arrives by another route, because the
 * corpus is a directory a person can edit. Two shapes are checked:
 *
 * - a credential in the text (`SECRET_FOUND`);
 * - an attribute named like a credential slot (`CREDENTIAL_ATTRIBUTE`) — the capture path
 *   strips these, and CI's own scanner is the reason: measured, `data-algolia-search-key` and
 *   `data-token-hash` produced nine `generic-api-key` findings in two snapshots before the
 *   rule existed.
 *
 * The same pass also checks the CJK rule, and here it is a *verification* rather than a
 * rejection: capture encodes CJK as numeric character references and escapes the meta JSON,
 * so a snapshot that still contains CJK means the normalization did not run or someone edited
 * a snapshot by hand. The public tree has to stay CJK-free
 * (`tests/unit/architecture/doc-visibility.test.ts`), and this is where the corpus proves it
 * does.
 */
async function scanSecrets(ids) {
  const problems = []
  for (const id of ids) {
    const files = [join(CORPUS_ROOT, id, SNAPSHOT_FILE), join(CORPUS_ROOT, id, META_FILE)]
    const assets = join(CORPUS_ROOT, id, ASSETS_DIR)
    if (existsSync(assets)) {
      for (const name of await readdir(assets)) files.push(join(assets, name))
    }
    for (const file of files) {
      let text
      try {
        text = await readFile(file, 'utf8')
      } catch {
        continue
      }
      const name = file.split('/').pop()
      for (const hit of scanForSecrets(text)) {
        problems.push({ id, code: 'SECRET_FOUND', detail: `${hit.rule} in ${name}` })
      }
      if (containsCjk(text)) {
        problems.push({ id, code: 'CJK_IN_PUBLIC_TREE', detail: `${name} (see DOC_VISIBILITY.md)` })
      }
      for (const attribute of credentialAttributesIn(text)) {
        problems.push({ id, code: 'CREDENTIAL_ATTRIBUTE', detail: `${attribute} in ${name}` })
      }
    }
  }
  return problems
}

/**
 * A snapshot that references a stylesheet it does not contain is not offline-loadable in any
 * useful sense. Cheap to check on disk, so it is checked here rather than discovered later.
 */
async function checkAssets(ids) {
  const problems = []
  for (const id of ids) {
    const html = await readFile(join(CORPUS_ROOT, id, SNAPSHOT_FILE), 'utf8').catch(() => '')
    const references = html.match(/href="assets\/[^"]+"/g) ?? []
    for (const reference of new Set(references)) {
      const name = reference.slice('href="'.length, -1).replace(`${ASSETS_DIR}/`, '')
      if (!existsSync(join(CORPUS_ROOT, id, ASSETS_DIR, name))) {
        problems.push({ id, code: 'MISSING_ASSET', detail: name })
      }
    }
  }
  return problems
}

/**
 * Tests 2 — the property that earned a snapshot its bucket has to still be in the file.
 *
 * Only bucket `C` can be checked offline: a real shadow root is markup, while `B` (client-side
 * navigation), `D` (growth on scroll) and `E` (generated class names) need a live browser to
 * re-derive. `E` is approximated here through the hashed-class ratio already in `metrics`.
 *
 * The point is not to re-verify the site — it is to catch the artefact losing the thing it
 * exists to have. A bucket-`C` snapshot whose shadow roots are empty is a bucket-`A` page
 * wearing a harder label, and it would quietly make every future `C` number a lie.
 */
async function checkBucketEvidence(ids) {
  const problems = []
  for (const id of ids) {
    const meta = JSON.parse(await readFile(join(CORPUS_ROOT, id, META_FILE), 'utf8').catch(() => '{}'))
    const metrics = meta.metrics ?? {}
    const html = await readFile(join(CORPUS_ROOT, id, SNAPSHOT_FILE), 'utf8').catch(() => '')

    const claimed = metrics.shadowRootWithContentCount ?? 0
    if (claimed > 0) {
      const { total, nonEmpty } = countShadowTemplates(html)
      if (nonEmpty === 0) {
        problems.push({
          id,
          code: 'BUCKET_EVIDENCE_LOST',
          detail: `claims ${claimed} content-bearing shadow root(s) but all ${total} templates are empty`,
        })
      }
    }

    if (meta.bucket === 'E') {
      const tokens = metrics.classTokenCount ?? 0
      const hashed = metrics.hashedClassTokens ?? 0
      if (tokens > 0 && hashed / tokens < 0.2) {
        problems.push({
          id,
          code: 'BUCKET_EVIDENCE_LOST',
          detail: `hashed class ratio ${(hashed / tokens).toFixed(2)} below the 0.20 floor`,
        })
      }
    }
  }
  return problems
}

/**
 * Tests 3 — start the playground, load every snapshot over HTTP, and parse what comes back.
 * "Status 200" alone would pass on an empty file; the point is that the DOM survived.
 */
/**
 * Size of the document jsdom can see, **including declarative shadow DOM, at every depth**.
 *
 * The `<template>` children are parsed into `template.content`, not into the element's child
 * tree, so `querySelectorAll('*')` alone never sees them — which is exactly how eight of the
 * ten empty bucket-`C` snapshots stayed invisible to this check. jsdom does not *upgrade*
 * declarative shadow roots (no `attachShadow` happens), so the light-DOM counts and the
 * template counts are added rather than nested.
 *
 * The walk has to recurse. A shadow root inside a shadow root has its `<template>` inside the
 * *content* of the outer one, and `querySelectorAll` does not descend into a template's
 * content — so a one-level walk sees a two-level page as almost empty. Measured on `C-01`
 * (chromestatus.com, nested open shadow roots three levels deep): one level reports 51 nodes /
 * 0 chars, which fails the gate below; recursing reports 891 nodes / 5279 chars, which is the
 * page. The check exists to catch an empty artefact, not to punish depth.
 */
function measureDocument(document) {
  let nodes = document.querySelectorAll('*').length
  let text = document.body?.textContent?.trim().length ?? 0

  const descend = (fragment) => {
    for (const template of fragment.querySelectorAll('template[shadowrootmode]')) {
      nodes += template.content.querySelectorAll('*').length
      text += template.content.textContent?.trim().length ?? 0
      descend(template.content)
    }
  }
  descend(document)

  return { nodes, text }
}

async function probeHttp(ids) {
  const { origin, close } = await startPlaygroundServer({ port: 0 })
  const failures = []
  const loaded = []
  try {
    for (const id of ids) {
      const url = `${origin}/corpus/${id}/${SNAPSHOT_FILE}`
      try {
        const response = await fetch(url)
        const body = await response.text()
        if (response.status !== 200) {
          failures.push({ id, detail: `HTTP ${response.status}` })
          continue
        }
        // jsdom cannot parse modern CSS (`@layer`, `:where()`), and its default virtual
        // console prints the offending stylesheet plus a stack trace for every failure — 6 KB
        // of stderr on a healthy corpus. What this check asks is whether the DOM arrived, so
        // the stylesheet parser is not consulted.
        const dom = new JSDOM(body, { virtualConsole: new VirtualConsole() })
        const { nodes, text } = measureDocument(dom.window.document)
        dom.window.close()
        if (nodes < MIN_DOM_NODES || text < MIN_TEXT_CHARS) {
          failures.push({ id, detail: `DOM too small: ${nodes} nodes / ${text} chars` })
          continue
        }
        loaded.push({ id, nodes, text })
      } catch (error) {
        failures.push({ id, detail: String(error?.message ?? error) })
      }
    }
  } finally {
    await close()
  }
  return { origin, loaded, failures }
}

async function main() {
  const asJson = process.argv.includes('--json')
  const withHttp = !process.argv.includes('--no-http')
  const ids = await listIds()

  const extraProblems = [
    ...(await scanSecrets(ids)),
    ...(await checkAssets(ids)),
    ...(await checkBucketEvidence(ids)),
  ]
  const http = withHttp ? await probeHttp(ids) : null
  // `checkCorpus` folds `http.failures` into the report itself; adding them here as well
  // printed every unloadable snapshot twice.

  const report = await checkCorpus({ extraProblems, http })

  if (asJson) {
    console.log(JSON.stringify(report, null, 2))
  } else {
    console.log(`Web Corpus: ${report.count} snapshots, ${(report.totalBytes / 1024 / 1024).toFixed(2)} MB`)
    for (const bucket of BUCKETS) {
      const [min, max] = BUCKET_RANGE[bucket]
      const count = report.distribution[bucket] ?? 0
      console.log(`  ${bucket}: ${String(count).padStart(2)}  (allowed ${min}-${max})`)
    }
    if (http) {
      console.log(`  offline load: ${http.loaded.length}/${ids.length} served by the playground`)
    }
    if (report.problems.length === 0) {
      console.log('\nOK — no problems found')
    } else {
      console.log(`\n${report.problems.length} problem(s):`)
      for (const problem of report.problems) {
        console.log(`  [${problem.code}] ${problem.id ?? '-'} ${problem.detail}`)
      }
    }
  }

  if (report.ok) await writeCorpusIndex(report.metas)
  process.exitCode = report.ok ? 0 : 1
}

await main()

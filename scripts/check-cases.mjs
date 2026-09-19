#!/usr/bin/env node
/**
 * Task Corpus health check — `task/stage-2-2.md` Tests 1/2/3, AC 1/3/4/6.
 *
 *   node scripts/check-cases.mjs [--json]
 *
 * The Web Corpus is only half a benchmark: it says *where* a task runs, not *what* the task
 * is or *what* the right answer looks like. This guard protects the other half, and it asks
 * five questions:
 *
 * 1. **Shape** — does every case carry the fields the guide defines, with an id that matches
 *    its filename and its bucket?
 * 2. **Anchoring** — does every case still point at the snapshot it claims? A case whose url
 *    has drifted from `corpus/<id>/meta.json` is a task measured against the wrong page.
 * 3. **Ground truth** — is there one per case, is the item-count range a real range, and does
 *    every sample item use only the fields the case declares (and between them, all of them)?
 * 4. **Coverage** — `A` and `C` fully covered, every other bucket at least three cases. The
 *    stage sets that floor so the first run cannot quietly be an all-easy-site run.
 * 5. **Voice and cleanliness** — is the task written the way a user would say it rather than
 *    as a selector hint, and is there no credential or obvious personal data in any sample?
 *
 * It is invoked by `tests/benchmark/cases.test.ts` rather than reimplemented there: the
 * maintainer and CI must be running the same code.
 */
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { BENCHMARK_ROOT, CORPUS_ROOT as CORPUS_DIR, ID_PATTERN } from '../apps/playground/lib/corpus.mjs'

const CASES_DIR = join(BENCHMARK_ROOT, 'cases')
const GT_DIR = join(BENCHMARK_ROOT, 'ground-truth')

/** Buckets that must be covered end to end, and the floor for the rest. */
const FULL_COVERAGE_BUCKETS = ['A', 'C']
const MIN_CASES_PER_BUCKET = 3

/**
 * How far a range may stretch before it stops being a claim. `max <= min * SPREAD + SLACK`:
 * a range that admits any plausible count cannot be failed, and a benchmark that cannot be
 * failed is decoration. Same constants as the guard test — the two must not drift apart.
 */
const MAX_RANGE_SPREAD = 3
const MAX_RANGE_SLACK = 10

const CASE_FIELDS = [
  'id',
  'bucket',
  'url',
  'corpus',
  'task_description',
  'expected_fields',
  'notes',
  'verified_on',
]

const GT_FIELDS = ['case_id', 'expected_fields', 'item_count_range', 'sample', 'verified_on']

/**
 * A task description is the one thing that must not smuggle the answer in. These are the
 * shapes that turn a benchmark case into a prompt-engineering test: a selector, a CSS
 * fragment, or a DOM API name. Kept as a token list rather than a clever regex so a failure
 * says which word was objectionable.
 */
const SELECTOR_HINT_PATTERNS = [
  { re: /querySelector|getElementsBy|document\./i, why: 'names a DOM API' },
  { re: /\bdiv\b\.|\bspan\b\.|\bul\b\.|\bli\b\.|\btable\b\./i, why: 'names an element with a class' },
  { re: /\bclass\s*[=:]|classList|getAttribute/i, why: 'refers to a class attribute' },
  { re: /:nth-(child|of-type)|\[href|\bdata-[a-z]+\b/i, why: 'contains a selector fragment' },
  { re: /#shadow|\bshadow root\b|shadowRoot/i, why: 'names the shadow DOM' },
  { re: /(^|\s)[.#][a-z][\w-]*(\s|,|$)/i, why: 'looks like a bare selector' },
]

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i
const SECRET_RE = /(sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{12,}|Bearer\s+[A-Za-z0-9._-]{12,})/
/**
 * Ground truth ships to the public repository, and the public tree is CJK-free
 * (`tests/unit/architecture/doc-visibility.test.ts`). Written as escapes, not as literal
 * characters: this file is itself scanned by that assertion.
 */
const CJK_RE =
  /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3000-\u303F\uFF01-\uFF60]/

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function looksLikeDate(v) {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
}

function scanText(value, path, problems, label) {
  if (typeof value !== 'string') return
  if (EMAIL_RE.test(value)) problems.push(`${path}: ${label} contains an email-shaped string`)
  if (SECRET_RE.test(value)) problems.push(`${path}: ${label} contains a credential-shaped string`)
  if (CJK_RE.test(value)) problems.push(`${path}: ${label} contains CJK characters`)
}

function walkStrings(value, fn) {
  if (typeof value === 'string') {
    fn(value)
    return
  }
  if (Array.isArray(value)) {
    for (const v of value) walkStrings(v, fn)
    return
  }
  if (isPlainObject(value)) {
    for (const v of Object.values(value)) walkStrings(v, fn)
  }
}

async function readJson(dir, file, problems) {
  const full = join(dir, file)
  try {
    return JSON.parse(await readFile(full, 'utf8'))
  } catch (err) {
    problems.push(`${full}: not valid JSON (${err.message})`)
    return null
  }
}

async function listJson(dir) {
  if (!existsSync(dir)) return []
  return (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()
}

export async function checkCases() {
  const problems = []
  const caseFiles = await listJson(CASES_DIR)
  const gtFiles = new Set(await listJson(GT_DIR))
  const corpusIds = new Set(
    (await readdir(CORPUS_DIR, { withFileTypes: true }))
      .filter((d) => d.isDirectory() && ID_PATTERN.test(d.name))
      .map((d) => d.name),
  )

  const corpusIdsByBucket = {}
  for (const id of corpusIds) {
    const bucket = id.split('-')[0]
    corpusIdsByBucket[bucket] = (corpusIdsByBucket[bucket] ?? 0) + 1
  }

  const seenIds = new Set()
  const seenUrls = new Map()
  const cases = []
  const coverage = {}

  for (const file of caseFiles) {
    const path = `cases/${file}`
    const expectedId = file.replace(/\.json$/, '')
    const c = await readJson(CASES_DIR, file, problems)
    if (!c) continue

    if (!ID_PATTERN.test(expectedId)) problems.push(`${path}: filename is not a <bucket>-<NN> id`)
    if (c.id !== expectedId) problems.push(`${path}: id "${c.id}" does not match its filename`)
    if (seenIds.has(c.id)) problems.push(`${path}: duplicate case id`)
    seenIds.add(c.id)

    for (const field of CASE_FIELDS) {
      if (c[field] === undefined || c[field] === null || c[field] === '') {
        problems.push(`${path}: missing ${field}`)
      }
    }

    const bucket = expectedId.split('-')[0]
    if (c.bucket !== bucket) problems.push(`${path}: bucket "${c.bucket}" does not match its id`)
    coverage[bucket] = (coverage[bucket] ?? 0) + 1

    if (!Array.isArray(c.expected_fields) || c.expected_fields.length === 0) {
      problems.push(`${path}: expected_fields must be a non-empty array`)
    } else if (new Set(c.expected_fields).size !== c.expected_fields.length) {
      problems.push(`${path}: expected_fields has duplicates`)
    } else if (c.expected_fields.some((f) => typeof f !== 'string' || !f.trim())) {
      problems.push(`${path}: expected_fields must all be non-empty strings`)
    }

    if (!looksLikeDate(c.verified_on)) problems.push(`${path}: verified_on is not a YYYY-MM-DD date`)

    if (typeof c.task_description === 'string') {
      if (c.task_description.trim().length < 15) {
        problems.push(`${path}: task_description is too short to be a task`)
      }
      for (const { re, why } of SELECTOR_HINT_PATTERNS) {
        if (re.test(c.task_description)) {
          problems.push(`${path}: task_description ${why} — it must read like something a user would type`)
        }
      }
    }

    // 2 — still anchored to the snapshot it claims.
    if (corpusIds.has(expectedId)) {
      const meta = await readJson(join(CORPUS_DIR, expectedId), 'meta.json', problems)
      if (meta) {
        if (meta.bucket !== bucket) problems.push(`${path}: corpus snapshot is in bucket ${meta.bucket}`)
        if (meta.url !== c.url) problems.push(`${path}: url "${c.url}" no longer matches the snapshot (${meta.url})`)
      }
      if (!existsSync(join(CORPUS_DIR, expectedId, 'index.html'))) {
        problems.push(`${path}: corpus snapshot index.html is missing`)
      }
    } else {
      problems.push(`${path}: no corpus snapshot for this id`)
    }

    if (typeof c.url === 'string') {
      const other = seenUrls.get(c.url)
      if (other) problems.push(`${path}: url already used by ${other}`)
      seenUrls.set(c.url, path)
    }

    // 3 — ground truth.
    const gtFile = `${expectedId}.json`
    if (!gtFiles.has(gtFile)) {
      problems.push(`${path}: no ground-truth/${gtFile}`)
    } else {
      const g = await readJson(GT_DIR, gtFile, problems)
      if (g) {
        const gpath = `ground-truth/${gtFile}`
        for (const field of GT_FIELDS) {
          if (g[field] === undefined || g[field] === null) problems.push(`${gpath}: missing ${field}`)
        }
        if (g.case_id !== expectedId) problems.push(`${gpath}: case_id "${g.case_id}" does not match`)
        if (g.bucket && g.bucket !== bucket) problems.push(`${gpath}: bucket does not match the case`)
        if (!looksLikeDate(g.verified_on)) problems.push(`${gpath}: verified_on is not a YYYY-MM-DD date`)
        if (g.amendments !== undefined && !Array.isArray(g.amendments)) {
          problems.push(`${gpath}: amendments must be an array`)
        }

        const range = g.item_count_range
        if (!Array.isArray(range) || range.length !== 2) {
          problems.push(`${gpath}: item_count_range must be [min, max]`)
        } else if (!Number.isInteger(range[0]) || !Number.isInteger(range[1]) || range[0] < 0 || range[1] < range[0]) {
          problems.push(`${gpath}: item_count_range [${range}] is not a non-negative, ordered range`)
        } else if (range[0] === 0) {
          problems.push(`${gpath}: item_count_range starts at 0 — a case that can pass with no items measures nothing`)
        } else if (range[1] > range[0] * MAX_RANGE_SPREAD + MAX_RANGE_SLACK) {
          // A range wide enough to hold any answer is not ground truth, it is an alibi. The
          // point of the range is that a tool can fall outside it.
          problems.push(
            `${gpath}: item_count_range [${range}] is too wide to be falsifiable ` +
              `(max must be <= min*${MAX_RANGE_SPREAD}+${MAX_RANGE_SLACK})`,
          )
        }

        const declared = Array.isArray(c.expected_fields) ? c.expected_fields : []
        if (!Array.isArray(g.sample) || g.sample.length === 0) {
          problems.push(`${gpath}: sample must hold at least one representative item`)
        } else {
          const used = new Set()
          g.sample.forEach((item, i) => {
            if (!isPlainObject(item)) {
              problems.push(`${gpath}: sample[${i}] is not an object`)
              return
            }
            for (const k of Object.keys(item)) {
              if (!declared.includes(k)) {
                problems.push(`${gpath}: sample[${i}].${k} is not in expected_fields`)
              }
              used.add(k)
            }
          })
          for (const f of declared) {
            if (!used.has(f)) problems.push(`${gpath}: no sample item provides "${f}"`)
          }
        }

        // 5 — cleanliness of the recorded answer.
        walkStrings(g.sample, (s) => scanText(s, gpath, problems, 'sample'))
      }
    }

    cases.push({ id: expectedId, bucket, url: c.url, task: c.task_description, fields: c.expected_fields })
  }

  // Cases with no snapshot, snapshots with no case.
  for (const id of corpusIds) {
    if (!seenIds.has(id)) problems.push(`corpus/${id}: snapshot has no case`)
  }

  // 4 — coverage.
  for (const bucket of FULL_COVERAGE_BUCKETS) {
    const want = corpusIdsByBucket[bucket] ?? 0
    const have = coverage[bucket] ?? 0
    if (have !== want) {
      problems.push(`coverage: bucket ${bucket} has ${have} of ${want} cases — the stage requires full coverage`)
    }
  }
  for (const bucket of Object.keys(corpusIdsByBucket)) {
    if (FULL_COVERAGE_BUCKETS.includes(bucket)) continue
    const have = coverage[bucket] ?? 0
    if (have < MIN_CASES_PER_BUCKET) {
      problems.push(`coverage: bucket ${bucket} has ${have} cases — at least ${MIN_CASES_PER_BUCKET} required`)
    }
  }

  return {
    ok: problems.length === 0,
    count: cases.length,
    coverage,
    corpus: Object.fromEntries(Object.entries(corpusIdsByBucket).sort()),
    problems,
    cases,
  }
}

function main() {
  const json = process.argv.includes('--json')
  return checkCases().then((report) => {
    if (json) {
      console.log(JSON.stringify(report))
    } else {
      const cov = Object.keys(report.corpus)
        .sort()
        .map((b) => `  ${b}  ${String(report.coverage[b] ?? 0).padStart(2)} of ${report.corpus[b]}`)
        .join('\n')
      console.log(`Task Corpus: ${report.count} cases`)
      console.log(cov)
      if (report.problems.length === 0) {
        console.log('\n0 problems')
      } else {
        console.log(`\n${report.problems.length} problem(s):`)
        for (const p of report.problems) console.log('  - ' + p)
      }
    }
    process.exitCode = report.ok ? 0 : 1
  })
}

await main()

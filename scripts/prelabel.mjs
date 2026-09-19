/**
 * Mechanical pre-labelling of one benchmark run — stage 2-4, AC 1.
 *
 * AC 1 asks for every wrong/partial case to be attributed to a kind, and the attribution
 * cannot be done while all 50 cases read `pending`. Judgement itself stays human
 * (`docs/benchmark/README.md`, "Judgement criteria"): this script does not decide, it
 * proposes, and it attaches the evidence that lets a person overrule it in one look.
 *
 * What it actually compares — all of it from the ground truth in
 * `tests/benchmark/ground-truth/<case>.json`:
 *
 * - `item_count_range` against the run's `itemCount`.
 * - every `sample` value against the values the tool produced. Fields are matched by
 *   content, not by name: a tool that calls the column `stock` where the ground truth
 *   says `availability` is not wrong, and a name-only comparison would call it missing.
 *
 * Two things it refuses to do:
 *
 * - **It never labels an infrastructure failure.** A case that died on RATE_LIMIT or AUTH
 *   says nothing about the product, so it comes back `pending` with the reason attached.
 *   Labelling it `wrong` would be the same lie as recording an environment failure as 0%.
 * - **It never calls anything `correct` without evidence.** `correct` needs the item count
 *   in range *and* every expected field found in the output. Everything else lands on
 *   `partial`, which is where the criteria say a tie goes.
 *
 * Usage:  node scripts/prelabel.mjs <results/xxx.json> [--out <dir>]
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const BENCHMARK_ROOT = 'tests/benchmark'
const GT_DIR = join(BENCHMARK_ROOT, 'ground-truth')

/** Error codes that say something about the world, not about the tool. */
const INFRASTRUCTURE_CODES = new Set([
  'NETWORK',
  'AUTH',
  'RATE_LIMIT',
  'HTTP_ERROR',
  'TIMEOUT',
  'ABORTED',
  'NOT_CONFIGURED',
])

const norm = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/…+$|\.+$/, '')
    .replace(/[.,;:!?'"`“”()[\]]/g, '')

/**
 * Does a produced value carry the expected one?
 *
 * Prefix, because the runner caps every sampled value (`capSample`, stage 1-11) — a long
 * title arrives truncated, "a light in the" against "A Light in the Attic".
 *
 * But a prefix is only evidence when there is enough of one: a produced price of `"£"`
 * is a prefix of `"£63.00"` and is not the price. Hence the two guards — the shorter
 * side has to be at least six characters and at least half the longer one. Anything
 * shorter than that has to match exactly, which is what "the value is right" means.
 */
function matches(produced, expected) {
  const a = norm(produced)
  const b = norm(expected)
  if (a === '' || b === '') return false
  if (a === b) return true

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  if (shorter.length < 6 || shorter.length < longer.length / 2) return false
  return longer.startsWith(shorter)
}

/** The records a case produced, whichever name the model gave `output_to`. */
function producedItems(result) {
  if (result === null || typeof result !== 'object') return []
  for (const value of Object.values(result)) {
    if (value !== null && typeof value === 'object' && Array.isArray(value.items)) return value.items
  }
  return []
}

function producedKeys(items) {
  const keys = new Set()
  for (const item of items) {
    if (item !== null && typeof item === 'object') for (const key of Object.keys(item)) keys.add(key)
  }
  return [...keys]
}

/** How much of one expected field's ground-truth sample shows up in the output. */
function fieldVerdict(sampleValues, items, keys) {
  const expected = sampleValues.map(norm).filter((value) => value !== '')
  if (expected.length === 0) return { status: 'unknown', ratio: null, via: null }

  let best = { ratio: 0, via: null }
  for (const key of keys) {
    const produced = items.map((item) => norm(item?.[key]))
    // Order-independent: the row a value came from is not what this comparison is about.
    const hit = expected.filter((value) => produced.some((p) => matches(p, value))).length
    const ratio = hit / expected.length
    if (ratio > best.ratio) best = { ratio, via: key }
  }

  if (best.ratio === 0) return { status: 'missing', ratio: 0, via: null }
  if (best.ratio >= 0.8) return { status: 'matched', ratio: best.ratio, via: best.via }
  return { status: 'weak', ratio: best.ratio, via: best.via }
}

function prelabel({
  generationSucceeded,
  generationError,
  executionError,
  itemCount,
  fields,
  inRange,
  neededClarification,
}) {
  const reasons = []

  if (generationSucceeded === false) {
    const code = String(generationError ?? '')
    if (INFRASTRUCTURE_CODES.has(code)) {
      return { label: 'pending', confidence: 'n/a', why: `infrastructure: generation failed with ${code}` }
    }
    if (neededClarification === true) {
      return {
        label: 'wrong',
        confidence: 'high',
        why: 'asked a clarifying question instead of building; offline nobody can answer it',
      }
    }
    return {
      label: 'wrong',
      confidence: 'high',
      why: `no usable tool: ${code === '' ? 'generation produced nothing and recorded no error code' : `generation failed (${code})`}`,
    }
  }

  if (executionError !== undefined && executionError !== null) {
    const code = String(executionError)
    if (INFRASTRUCTURE_CODES.has(code)) {
      return { label: 'pending', confidence: 'n/a', why: `infrastructure: execution stopped with ${code}` }
    }
    if ((itemCount ?? 0) === 0) {
      return { label: 'wrong', confidence: 'high', why: `produced nothing: ${code}` }
    }
    reasons.push(`execution error ${code}, ${itemCount} items`)
  }

  const count = itemCount ?? 0
  if (count === 0) return { label: 'wrong', confidence: 'high', why: 'produced no items' }

  const statuses = fields.map((field) => field.status)
  const matched = statuses.filter((s) => s === 'matched').length
  const missing = statuses.filter((s) => s === 'missing').length
  const total = fields.length

  if (missing === total) {
    return { label: 'wrong', confidence: 'medium', why: `no expected field found in the output (${count} items)` }
  }

  const inRangeNow = inRange
  if (matched === total && inRangeNow) {
    return { label: 'correct', confidence: 'high', why: `${count} items in range, every field found` }
  }
  if (matched === total && !inRangeNow) {
    reasons.push(`${count} items outside the expected range, but every field found`)
    return { label: 'partial', confidence: 'medium', why: reasons.join('; ') }
  }

  reasons.push(`${matched}/${total} fields found`)
  if (missing > 0) {
    reasons.push(`missing: ${fields.filter((f) => f.status === 'missing').map((f) => f.name).join(', ')}`)
  }
  const weak = fields.filter((f) => f.status === 'weak')
  if (weak.length > 0) reasons.push(`partial values: ${weak.map((f) => f.name).join(', ')}`)
  if (!inRangeNow) reasons.push(`${count} items outside the expected range`)
  return { label: 'partial', confidence: 'low', why: reasons.join('; ') }
}

async function main() {
  const runPath = process.argv[2]
  if (runPath === undefined) {
    console.error('usage: node scripts/prelabel.mjs <results/<run-id>.json>')
    process.exit(1)
  }

  const run = JSON.parse(await readFile(runPath, 'utf8'))
  const outDir = join(BENCHMARK_ROOT, 'reports', run.runId)
  await mkdir(outDir, { recursive: true })

  const entries = []
  for (const entry of run.cases) {
    const gt = JSON.parse(await readFile(join(GT_DIR, `${entry.caseId}.json`), 'utf8'))
    const items = producedItems(entry.actualExtractionResult)
    const keys = producedKeys(items)
    const range = gt.item_count_range ?? [0, 0]
    const count = entry.itemCount ?? 0
    const inRange = count >= range[0] && count <= range[1]

    const fields = gt.expected_fields.map((name) => {
      const sampleValues = (gt.sample ?? []).map((item) => item?.[name])
      const verdict = fieldVerdict(sampleValues, items, keys)
      return { name, ...verdict }
    })

    const verdict = prelabel({
      generationSucceeded: entry.generationSucceeded,
      generationError: entry.generationError,
      executionError: entry.executionError,
      itemCount: entry.itemCount,
      fields,
      inRange,
    })

    const renamed = fields.filter((f) => f.via !== null && f.via !== f.name).map((f) => `${f.name}→${f.via}`)

    entries.push({
      caseId: entry.caseId,
      bucket: entry.bucket,
      expectedRange: range,
      itemCount: count,
      inRange,
      producedKeys: keys,
      fields,
      renamed,
      healthStatus: entry.healthStatus ?? null,
      latencyMs: entry.latencyMs ?? null,
      sample: gt.sample ?? [],
      produced: items.slice(0, 3),
      generationSucceeded: entry.generationSucceeded,
      executionError: entry.executionError ?? null,
      neededClarification: entry.neededClarification === true,
      ...verdict,
      why: renamed.length > 0 ? `${verdict.why} (renamed: ${renamed.join(', ')})` : verdict.why,
    })
  }

  for (const entry of entries) entry.kind = attributeKind(entry)

  await writeFile(join(outDir, 'prelabel.json'), `${JSON.stringify({ runId: run.runId, entries }, null, 2)}\n`)
  await writeFile(join(outDir, 'prelabel.md'), reviewSheet(run, entries))

  const counts = { correct: 0, partial: 0, wrong: 0, pending: 0 }
  for (const entry of entries) counts[entry.label] += 1
  console.log(`run ${run.runId}: ${JSON.stringify(counts)}`)
  console.log(`written: ${outDir}/prelabel.md, prelabel.json`)
}

/**
 * The stage 2-4 attribution kind (`task/stage-2-4.md`, `FailureKind`).
 *
 * `structure-changed` is never assigned: deciding it needs two snapshots of the same site
 * at different times, and the corpus is one snapshot per site. Saying "the page changed"
 * about a single capture would be a guess dressed as a finding, so the honest output is
 * the one kind this script cannot propose.
 */
function attributeKind(entry) {
  if (entry.label === 'pending') return 'infrastructure'
  if (entry.generationSucceeded === false) return 'invalid-output'

  const code = String(entry.executionError ?? '')
  if (code !== '') {
    return code === 'SELECTOR_SYNTAX' || code === 'CAPABILITY_FAILED' ? 'invalid-output' : 'field-semantics'
  }

  if (entry.itemCount === 0) return 'zero-match'

  const statuses = entry.fields.map((f) => f.status)
  if (statuses.every((s) => s === 'missing')) return 'wrong-element'

  const [min, max] = entry.expectedRange
  const count = entry.itemCount
  const outside = count < min * 0.75 || count > max * 1.25
  if (outside) return 'wrong-element'

  return 'field-semantics'
}

function reviewSheet(run, entries) {
  const counts = { correct: 0, partial: 0, wrong: 0, pending: 0 }
  for (const entry of entries) counts[entry.label] += 1

  const rows = entries
    .map((entry) => {
      const fields = entry.fields
        .map((f) => `${f.name}:${f.status === 'matched' ? 'ok' : f.status === 'weak' ? 'weak' : 'miss'}`)
        .join(' ')
      return `| \`${entry.caseId}\` | ${entry.bucket} | ${entry.expectedRange[0]}–${entry.expectedRange[1]} → **${entry.itemCount}** | ${fields} | **${entry.label}** | ${entry.kind} | ${entry.confidence} | ${entry.why} |`
    })
    .join('\n')

  const detail = entries
    .map((entry) => {
      const gtRows = entry.sample
        .slice(0, 2)
        .map((item) => `| ${Object.keys(item).map((k) => `${k}=${item[k]}`).join(' · ')} |`)
        .join('\n')
      return [
        `### \`${entry.caseId}\` — ${entry.label} (${entry.confidence})`,
        '',
        `- items: expected ${entry.expectedRange[0]}–${entry.expectedRange[1]}, produced ${entry.itemCount}`,
        `- produced columns: ${entry.producedKeys.join(', ') || '—'}`,
        `- ground-truth sample: ${gtRows}`,
        `- produced sample: ${entry.produced.length === 0 ? '—' : JSON.stringify(entry.produced[0])}`,
        `- why: ${entry.why}`,
        '',
      ].join('\n')
    })
    .join('\n')

  return [
    `# Pre-labelling review — ${run.runId}`,
    '',
    `Model \`${run.model}\`. Generated by \`scripts/prelabel.mjs\`; every row is a **proposal**, not`,
    `a judgement. Overrule it where the evidence says otherwise — the label that lands in`,
    `\`results/labels.json\` is the one you confirm.`,
    '',
    `| label | count |`,
    `|---|---|`,
    `| correct | ${counts.correct} |`,
    `| partial | ${counts.partial} |`,
    `| wrong | ${counts.wrong} |`,
    `| pending (infrastructure) | ${counts.pending} |`,
    '',
    'How to read the field column: `ok` = the ground-truth values for that field were found',
    'in the output (under any column name), `weak` = some of them, `miss` = none. The kind',
    'column is the stage 2-4 attribution; `structure-changed` is never proposed, because',
    'deciding it would need two captures of the same site and the corpus holds one.',
    '',
    'To review: read the `why` column, open the per-case evidence below for anything that',
    'looks off, and reply with the differences — `A-02 correct`, `D-06 partial`, and so on.',
    'Only the confirmed labels go into `results/labels.json`; the rest stay `pending`,',
    'because a label nobody stood behind is worse than no label.',
    '',
    '| case | bucket | items expected → produced | fields | pre-label | kind | confidence | why |',
    '|---|---|---|---|---|---|---|---|',
    rows,
    '',
    '## Per-case evidence',
    '',
    detail,
  ].join('\n')
}

await main()

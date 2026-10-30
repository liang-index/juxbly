/**
 * Ground-truth audit — Step 2 of `docs/PHASE3_PLAN.md`.
 *
 * The ground truth has never been checked against the snapshots it describes: it was
 * written by an agent from the snapshot, and `B-04` already shows three numbers that
 * disagree (the label says 70-85 items, the analyser's largest repeating group is 168,
 * the model's selector hit 232). Before any threshold is written against these numbers,
 * they have to be measured.
 *
 * This test does not assert a new product number. It asserts the one thing that must be
 * true of a ground truth regardless of how good Juxbly is: **the values it claims are on
 * the page have to be on the page.** A stale ground truth is not a hard case, it is a
 * broken ruler.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { analyzePage } from '@juxbly/analyzer'
import { createSnapshotHost } from '../../apps/playground/src/bench/corpus-host'
import type { GroundTruth } from '../../apps/playground/src/bench/scoring'

const ROOT = resolve(process.cwd())
const GT_DIR = join(ROOT, 'tests/benchmark/ground-truth')
const CASES_DIR = join(ROOT, 'tests/benchmark/cases')

/**
 * Everything a reader would see, shadow roots included.
 *
 * `body.textContent` stops at a shadow boundary — by design, in the DOM and in jsdom
 * alike. For a snapshot whose content lives in declarative shadow roots it returns
 * `" "`, which is how `C-02` was first reported as "the snapshot holds none of the
 * values". It holds all of them; the audit was looking in the wrong place. Walking
 * into `shadowRoot` is the same traversal the runtime uses to read a page.
 *
 * Text is concatenated the way `textContent` does — no separator invented at an element
 * boundary. Adding one is its own bug: `C-09` is `...update logic</strong>, and more.`,
 * and a space inserted before the comma makes a real value look absent.
 */
function deepText(node: Node): string {
  let out = ''
  const walk = (current: Node): void => {
    if (current.nodeType === 3) out += current.textContent ?? ''
    for (const child of Array.from((current as Element).childNodes ?? [])) walk(child)
    const root = (current as Element).shadowRoot ?? null
    if (root) walk(root)
  }
  walk(node)
  return out
}

interface BenchCaseFile {
  id: string
  corpus: string
  expected_fields: string[]
}

/**
 * One pass over every case, cached: 50 snapshots through jsdom costs seconds, and the
 * audit is read-only so the parse result is good for the whole file.
 */
const AUDIT = readdirSync(GT_DIR)
  .filter((name) => name.endsWith('.json'))
  .sort()
  .map((name) => {
    const gt = JSON.parse(readFileSync(join(GT_DIR, name), 'utf8')) as GroundTruth
    const benchCase = JSON.parse(readFileSync(join(CASES_DIR, `${gt.case_id}.json`), 'utf8')) as BenchCaseFile
    const html = readFileSync(join(ROOT, 'tests/benchmark', benchCase.corpus), 'utf8')
    const host = createSnapshotHost(html, 'https://example.invalid/')
    const analysis = analyzePage(host.document)
    /**
     * Text **and** markup: a ground truth that asks for `url` is asking for an `href`,
     * which lives in an attribute and appears in no text node. Searching only the
     * visible text would report every link field as missing.
     */
    const haystack = `${html} ${deepText(host.document.body)}`.replace(/\s+/g, ' ')

    const presentPerField = gt.expected_fields.map((field) => {
      // A field may be multi-valued (`tags`, `links`): each value is checked on its own,
      // because the joined string is not something the page ever contains.
      const values = (gt.sample ?? [])
        .flatMap((item) => (Array.isArray(item?.[field]) ? item[field] : [item?.[field]]))
        .map((value) => String(value ?? ''))
        .filter((value) => value !== '')
      const found = values.filter((value) => haystack.includes(value.replace(/\s+/g, ' ')))
      return { field, expected: values.length, found: found.length }
    })

    const groups = analysis.containers
      .map((group) => ({ count: group.hitCount, selector: group.tagPath }))
      .sort((a, b) => b.count - a.count)

    return { caseId: gt.case_id, range: gt.item_count_range, presentPerField, top: groups.slice(0, 3), largest: groups[0]?.count ?? 0 }
  })

/**
 * Known-bad ground truths, with the reason they are exempt.
 *
 * An exemption is not a fix: it is a public, dated record that the ruler is broken for
 * this case, so nobody later mistakes its numbers for a measurement.
 *
 * Empty as of 2026-09-19. `C-02` was here for one commit, and was wrong: the snapshot
 * does contain every value the ground truth names, all of them inside declarative
 * shadow roots. The audit read `body.textContent`, which stops at a shadow boundary and
 * returned `" "` — the third finding in a row that turned out to be the audit's own bug
 * rather than the corpus's. Kept as the reason `deepText` exists above.
 *
 * Both directions were checked by hand: `C-02` moved from exempt to clean once the walk
 * crossed shadow boundaries, and injecting a value no page contains
 * (`"A sentence no page ever contained 42-zebra"`) into a sample makes this test fail.
 */
const KNOWN_STALE = new Set<string>()

describe('ground truth', () => {
  /**
   * Suite-level timeout: this walks every snapshot once. A per-test timeout of the
   * default 5 s would fail on the parse, not on the finding.
   */
  it('claims only values the snapshot actually contains', { timeout: 120_000 }, () => {
    const broken = AUDIT.filter(
      (entry) => !KNOWN_STALE.has(entry.caseId) && entry.presentPerField.some((field) => field.found < field.expected),
    )
    const summary = broken.map(
      (entry) =>
        `${entry.caseId}: ${entry.presentPerField
          .filter((field) => field.found < field.expected)
          .map((field) => `${field.field} ${field.found}/${field.expected}`)
          .join(', ')}`,
    )
    expect(summary).toEqual([])
  })

  it('records the largest container the analyser proposes beside the expected range', { timeout: 120_000 }, () => {
    // Not an assertion, and deliberately so: the analyser dedupes nested containers, so
    // its largest group is a lower bound, not the page's true count. `B-04` is the
    // illustration — the analyser says 51, a raw tag-path count says 232 (`div>div>a`),
    // and the ground truth asks for 70-85 (the sidebar subset). A range narrower than the
    // page is legitimate: these tasks ask for a subset, which is exactly why item count
    // measures subset selection and not counting.
    const rows = AUDIT.map(
      (entry) =>
        `${entry.caseId} range ${entry.range[0]}-${entry.range[1]} largest-group ${entry.largest} top ${entry.top.map((g) => g.count).join('/')}`,
    )
    console.log(rows.join('\n'))
    expect(AUDIT.length).toBeGreaterThan(0)
  })
})

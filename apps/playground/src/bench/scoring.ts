/**
 * Field-level scoring: what a run produced, measured against the ground truth.
 *
 * This is the second gate's arithmetic, and it exists because build success cannot
 * tell "built" from "built the wrong thing". Everything here is mechanical — no
 * model, no judgement, no thresholds — because a gate that needs a person to read it
 * is not a gate.
 *
 * Three rules keep it honest:
 *
 * 1. **Fields are matched by content, not by name.** A tool that calls the column
 *    `stock` where the ground truth says `availability` is not wrong; a name-only
 *    comparison would call it missing.
 * 2. **Truncation counts as a match, but only when there is enough of one.** The
 *    runner caps sampled values, so "a light in the" against "A Light in the Attic"
 *    is the same value. A produced `"£"` is not `"£63.00"` — hence the length guards.
 * 3. **A field nobody asked for is counted, not ignored.** Extra columns are the
 *    hallucination class: they are why precision is below 100% even when every asked
 *    field was found.
 *
 * Vocabulary (aligned with the extraction-eval literature, see
 * `docs/benchmark/README.md`): `matched` ~ correct, `weak` ~ wrong value,
 * `missing` ~ not extracted, `extra` ~ invented.
 */
import type { Bucket, CaseResult, FieldMetrics } from './types'

export interface GroundTruth {
  case_id: string
  bucket: Bucket
  expected_fields: string[]
  item_count_range: [number, number]
  sample: Record<string, unknown>[]
}

export type FieldStatus = 'matched' | 'weak' | 'missing'

export interface FieldVerdict {
  /** The ground-truth field name — the name the user asked for. */
  name: string
  status: FieldStatus
  /** Share of the ground-truth sample values found in the output, 0..1. */
  ratio: number
  /** The produced column the values were found under; `null` when none carried them. */
  via: string | null
}

export interface CaseScore {
  caseId: string
  bucket: Bucket
  expectedRange: [number, number]
  itemCount: number
  inRange: boolean
  fields: FieldVerdict[]
  /** Produced columns that carry no expected field: fields nobody asked for. */
  extraFields: string[]
}

const normalize = (value: unknown): string =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/…+$|\.+$/, '')
    .replace(/[.,;:!?'"`“”()[\]]/g, '')

/**
 * Does a produced value carry the expected one?
 *
 * Prefix matching, because the runner caps every sampled value — a long title arrives
 * truncated. A prefix is only evidence when there is enough of one: `"£"` is a prefix
 * of `"£63.00"` and is not the price. So the shorter side has to be at least six
 * characters and at least half the longer one; anything shorter must match exactly.
 */
export function matches(produced: unknown, expected: unknown): boolean {
  const a = normalize(produced)
  const b = normalize(expected)
  if (a === '' || b === '') return false
  if (a === b) return true

  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a]
  if (shorter.length < 6 || shorter.length < longer.length / 2) return false
  return longer.startsWith(shorter)
}

/**
 * The records a case produced, whichever name the model gave `output_to` — recognised
 * by shape (`{ items: [...] }`) because the DSL does not fix the variable name.
 */
export function producedItems(result: unknown): Record<string, unknown>[] {
  if (result === null || typeof result !== 'object') return []
  for (const value of Object.values(result as Record<string, unknown>)) {
    if (value !== null && typeof value === 'object' && Array.isArray((value as { items?: unknown }).items)) {
      return (value as { items: Record<string, unknown>[] }).items
    }
  }
  return []
}

function producedKeys(items: readonly Record<string, unknown>[]): string[] {
  const keys = new Set<string>()
  for (const item of items) {
    if (item === null || typeof item === 'object') {
      for (const key of Object.keys(item ?? {})) keys.add(key)
    }
  }
  return [...keys]
}

function verdictFor(sampleValues: readonly unknown[], items: readonly Record<string, unknown>[], keys: readonly string[]): Omit<FieldVerdict, 'name'> {
  const expected = sampleValues.map(normalize).filter((value) => value !== '')
  if (expected.length === 0) return { status: 'missing', ratio: 0, via: null }

  let best: { ratio: number; via: string | null } = { ratio: 0, via: null }
  for (const key of keys) {
    const produced = items.map((item) => normalize(item?.[key]))
    // Order-independent: which row a value came from is not what this measures.
    const hit = expected.filter((value) => produced.some((p) => matches(p, value))).length
    const ratio = hit / expected.length
    if (ratio > best.ratio) best = { ratio, via: key }
  }

  if (best.ratio === 0) return { status: 'missing', ratio: 0, via: null }
  if (best.ratio >= 0.8) return { status: 'matched', ratio: best.ratio, via: best.via }
  return { status: 'weak', ratio: best.ratio, via: best.via }
}

/** One case, scored against its ground truth. */
export function scoreCase(result: CaseResult, gt: GroundTruth): CaseScore {
  const items = producedItems(result.actualExtractionResult)
  const keys = producedKeys(items)
  const range = gt.item_count_range ?? [0, 0]
  const itemCount = result.itemCount ?? 0
  const inRange = itemCount >= range[0] && itemCount <= range[1]

  const fields: FieldVerdict[] = gt.expected_fields.map((name) => {
    const sampleValues = (gt.sample ?? []).map((item) => item?.[name])
    return { name, ...verdictFor(sampleValues, items, keys) }
  })

  const consumed = new Set(fields.map((field) => field.via).filter((via): via is string => via !== null))
  const extraFields = keys.filter((key) => !consumed.has(key))

  return { caseId: result.caseId, bucket: result.bucket, expectedRange: range, itemCount, inRange, fields, extraFields }
}

/** The corpus-level field metrics — the number the second gate is written against. */
export function fieldMetrics(scores: readonly CaseScore[]): FieldMetrics {
  let instances = 0
  let matched = 0
  let weak = 0
  let missing = 0
  let extra = 0
  let inRange = 0

  for (const score of scores) {
    if (score.inRange) inRange += 1
    instances += score.fields.length
    extra += score.extraFields.length
    for (const field of score.fields) {
      if (field.status === 'matched') matched += 1
      else if (field.status === 'weak') weak += 1
      else missing += 1
    }
  }

  const predicted = matched + weak + extra
  const precision = predicted === 0 ? null : matched / predicted
  const recall = instances === 0 ? null : matched / instances
  const f1 = precision === null || recall === null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall)

  const countAccuracy = scores.length === 0 ? null : inRange / scores.length

  return { instances, matched, weak, missing, extra, precision, recall, f1, countAccuracy }
}

/**
 * The run summary — `docs/ARCHITECTURE.md` §8.1 (`RunSummary`).
 *
 * Deliberately minimal: whether there was data, how much, and a one-word shape digest per
 * field. No page content and no values, because this is what health keeps in a 10-run
 * rolling window and what 1-11 reads to tell "the tool broke" from "the page changed".
 *
 * A digest, not a sample: "the price column used to be numeric" is enough to detect drift
 * and not enough to reconstruct anything.
 */
import type { RunSummary } from '@juxbly/core'
import type { VariableBag } from './variable-bag'
import { asRecords } from './variable-bag'

export type FieldDigest = 'empty' | 'numeric' | 'text' | 'mixed'

export function emptySummary(): RunSummary {
  return { at: now(), had_data: false, item_count: 0, field_digest: {} }
}

/**
 * Summarises the last variable that carried data.
 *
 * `name` is `null` when no step produced any — an extract that matched nothing is a
 * summary of zero rows, not an error (`docs/UI_SPEC.md` §7: nothing matched is an answer
 * a tool is allowed to give).
 */
export function buildSummary(bag: VariableBag, name: string | null): RunSummary {
  if (name === null) return emptySummary()

  // A summary is a statistic: it must never be the reason a run fails, so an unreadable
  // variable reads as "no data" rather than throwing after the work is already done.
  const rows = bag.has(name) ? (asRecords(bag.get(name)) ?? []) : []

  return {
    at: now(),
    had_data: rows.length > 0,
    item_count: rows.length,
    field_digest: digestFields(rows),
  }
}

function digestFields(rows: readonly Record<string, unknown>[]): Record<string, string> {
  const names = [...new Set(rows.flatMap((row) => Object.keys(row)))].sort()
  const digest: Record<string, string> = {}

  for (const name of names) {
    digest[name] = digestField(rows.map((row) => row[name]))
  }

  return digest
}

function digestField(values: readonly unknown[]): FieldDigest {
  const present = values.filter((value) => value !== undefined && value !== null && value !== '')
  if (present.length === 0) return 'empty'
  if (present.every((value) => typeof value === 'number')) return 'numeric'
  if (present.every((value) => typeof value === 'string')) return 'text'
  return 'mixed'
}

function now(): string {
  return new Date().toISOString()
}

/**
 * The two `extract` modes — `docs/ARCHITECTURE.md` §5.2.
 *
 * Everything here goes through `DomPort` and nothing else: no `document`, no
 * `querySelector` on a global, no platform API (§6.1). That is what lets the same code
 * run against a real page, a fixture, and the §5.6 candidate dry-run without a branch.
 *
 * A mode returns records plus the two counts health reads. It never decides whether the
 * result is good — "3 of 2000 rows missing a field" and "0 rows" are both answers this
 * layer reports faithfully (§10).
 */
import type { DomPort } from '@juxbly/core'
import type { ExtractStep, FieldType } from '@juxbly/dsl'
import { CapabilityError } from '../errors'
import type { FieldValue } from './field-value'
import { emptyFieldValue, hasValue, readFieldValue } from './field-value'
import { classifyQueryError } from './query'

/**
 * Hard cap on records from one extract. A page with tens of thousands of rows is a
 * denial-of-service vector against the host page's own responsiveness (§11), and a tool
 * that returns 40k rows is not a tool a user can act on anyway. `truncated` records that
 * the cap fired; `hitCount` still reports the real match count.
 */
export const MAX_ITEMS = 1000

export interface ModeOutcome {
  records: Record<string, unknown>[]
  /** Container hit count: the full match count in list mode, 0 or 1 in single mode. */
  hitCount: number
  truncated: boolean
}

/**
 * `list` mode: one record per container.
 *
 * Field selectors are resolved **inside** each container, which is what makes a repeated
 * `.title` yield one value per row instead of the same first title N times.
 */
export function extractList(dom: DomPort, step: ExtractStep): ModeOutcome {
  const containerSelector = step.selector
  // §5.4 rule 4 already rejects list mode without a selector. This is the second point on
  // the same fence: a capability is callable directly by a contributor's test, and a step
  // object can be built in TypeScript without going through validation.
  if (typeof containerSelector !== 'string' || containerSelector === '') {
    throw new CapabilityError('EXTRACT_SELECTOR_REQUIRED', 'list mode requires a container selector')
  }

  const containers = query(dom, containerSelector)
  const capped = containers.slice(0, MAX_ITEMS)

  return {
    records: capped.map((container) => readRecord(dom, step, container)),
    hitCount: containers.length,
    truncated: containers.length > capped.length,
  }
}

/**
 * `single` mode: one record. The container selector is optional — without it the fields
 * are resolved against the document root (§5.2).
 */
export function extractSingle(dom: DomPort, step: ExtractStep): ModeOutcome {
  if (step.selector === undefined) {
    return { records: [readRecord(dom, step)], hitCount: 1, truncated: false }
  }

  const [container] = query(dom, step.selector)
  // A container that matched nothing is an answer, not an error (§5.2 Edge Cases) — the
  // difference from a broken selector is that the query did not throw.
  if (container === undefined) return { records: [], hitCount: 0, truncated: false }

  return { records: [readRecord(dom, step, container)], hitCount: 1, truncated: false }
}

/**
 * `fieldPresence` and `missingFields` — the two signals the result-layer health check and
 * the structure fingerprint read (§5.5).
 *
 * Presence is a share of the records **that were produced**. With zero records every
 * field is 0 and therefore missing: a selector that hit nothing has no fields that hit,
 * which is exactly the signal execution-layer health needs.
 */
export function summarizeFields(
  records: readonly Record<string, unknown>[],
  fieldNames: readonly string[],
): { fieldPresence: Record<string, number>; missingFields: string[] } {
  const fieldPresence: Record<string, number> = {}
  const missingFields: string[] = []

  for (const name of fieldNames) {
    const filled = records.filter((record) => hasValue(record[name] as FieldValue)).length
    const share = records.length === 0 ? 0 : filled / records.length
    fieldPresence[name] = share
    if (share === 0) missingFields.push(name)
  }

  return { fieldPresence, missingFields }
}

function readRecord(dom: DomPort, step: ExtractStep, scope?: Element): Record<string, unknown> {
  const record: Record<string, unknown> = {}

  for (const [name, selector] of Object.entries(step.fields)) {
    const type: FieldType = step.field_types?.[name] ?? 'text'
    const [element] = query(dom, selector, scope)
    record[name] = element === undefined ? emptyFieldValue(type) : readFieldValue(element, type)
  }

  return record
}

/** Every DOM read goes through here, so every one of them is classified the same way. */
function query(dom: DomPort, selector: string, scope?: Element): Element[] {
  try {
    return dom.query(selector, scope)
  } catch (error) {
    throw classifyQueryError(error)
  }
}

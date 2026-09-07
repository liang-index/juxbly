/**
 * Shared value handling for the three result views.
 *
 * Everything here exists because the values come from a page Juxbly does not control
 * (`docs/ARCHITECTURE.md` §12: page content is untrusted input). Two rules follow:
 *
 * 1. **A value is text, never markup.** It is rendered through React text nodes only — no
 *    `innerHTML`, no `dangerouslySetInnerHTML`.
 * 2. **Only `http(s)` links become links.** Anything else — `javascript:`, `data:`, a
 *    protocol-relative URL — is rendered as plain text, which is what stops a page from
 *    smuggling an executable href into a result row.
 */
/** A page must stay responsive even when a tool matched thousands of rows. */
export const MAX_ROWS = 500
/** Long values are trimmed so one field cannot push the rest off the panel. */
export const MAX_VALUE_CHARS = 160

export function formatValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  // Objects and arrays arrive when an llm step returned structured output; a stable,
  // readable rendering beats "[object Object]".
  return JSON.stringify(value)
}

export function truncateValue(value: unknown): string {
  const text = formatValue(value)
  return text.length <= MAX_VALUE_CHARS ? text : `${text.slice(0, MAX_VALUE_CHARS)}...`
}

/**
 * Returns the value only when it is an `http(s)` URL, otherwise `null`.
 *
 * Deliberately narrow: the result area is not a browser, and a link is a convenience, not
 * a feature. Anything that is not clearly a web address is shown as text.
 */
export function safeHref(value: unknown): string | null {
  if (typeof value !== 'string') return null
  return /^https?:\/\/\S+$/i.test(value) ? value : null
}

/** Row cap, applied by the views so a huge result cannot freeze the host page. */
export function limitRows<T>(rows: readonly T[]): { rows: readonly T[]; truncated: boolean } {
  return { rows: rows.slice(0, MAX_ROWS), truncated: rows.length > MAX_ROWS }
}

/**
 * Field names in first-seen order across all records.
 *
 * Union rather than "the keys of the first record": extracted rows are allowed to differ,
 * and a column disappearing because row 0 happened to lack it is a bug the user cannot
 * explain.
 */
export function collectFields(items: readonly Record<string, unknown>[]): string[] {
  const fields: string[] = []
  for (const item of items) {
    for (const key of Object.keys(item)) {
      if (!fields.includes(key)) fields.push(key)
    }
  }
  return fields
}

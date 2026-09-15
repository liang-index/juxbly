/**
 * Clipboard serialization — `packages/capabilities/src/export/copy.ts`,
 * `task/stage-1-15.md` Scope 1.
 *
 * Copy is a paste-into-the-thing-you-are-working-in format, so it is human text, not a
 * data exchange format: one `key: value` per line, records separated by a blank line.
 * A nested value is stringified so a pasted record still contains everything, and it is
 * never the raw CSV/JSON of the other two exports — a paste is meant to be read and kept,
 * not re-parsed.
 */
export function toCopyText(rows: readonly Record<string, unknown>[]): string {
  if (!Array.isArray(rows)) {
    throw new TypeError(`copy export expected an array of records, got ${typeof rows}`)
  }

  const blocks = rows.map((row) =>
    Object.entries(row)
      .map(([key, value]) => `${key}: ${valueToText(value)}`)
      .join('\n'),
  )
  return blocks.join('\n\n')
}

/** An image's useful form in text is its alt plus its URL; anything else is stringified. */
function valueToText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (typeof value === 'object' && value !== null) {
    const candidate = value as { src?: unknown; alt?: unknown }
    if (
      'src' in candidate &&
      typeof candidate.src === 'string' &&
      'alt' in candidate &&
      typeof candidate.alt === 'string'
    ) {
      return candidate.alt === '' ? candidate.src : `${candidate.alt} (${candidate.src})`
    }
  }
  return JSON.stringify(value)
}
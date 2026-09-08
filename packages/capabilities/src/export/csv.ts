/**
 * CSV serialization — `task/stage-1-15.md` Tests / Security, `docs/ARCHITECTURE.md` §7.1.
 *
 * The rows a tool collected come from an **untrusted page**, and a CSV that a page can
 * influence is a live attack surface: opening it in a spreadsheet can turn a cell into a
 * command. Formula injection is handled here, at the one place every cell passes through,
 * because a prefix on `=`/`+`/`-`/`@`/tab/CR is the same treatment whether the value is a
 * number, a URL or prose.
 */

/**
 * Serializes an array of records to a CSV **string** (no U+FEFF BOM yet; the BOM is
 * prepended by `toCsv` so the same escape rules apply to the header).
 *
 * Escaping is the RFC-4180 baseline: a field that contains a comma, a quote, a CR or an
 * LF is quoted, and internal quotes are doubled. Whitespace-sensitive values are quoted
 * too, because a leading tab is *also* injection — the quoting keeps it a visible cell
 * rather than an invisible formula trigger.
 *
 * Rows need not share fields (stage 1-15 edge case): the header is the union of every
 * field seen, in first-appearance order, and a row that lacks a column leaves it empty.
 */
export function serializeCsv(rows: readonly Record<string, unknown>[]): string {
  if (!Array.isArray(rows)) {
    throw new TypeError(`csv export expected an array of records, got ${typeof rows}`)
  }

  const headers = collectFieldNames(rows)
  const lines: string[] = [headers.map(escapeCell).join(',')]

  for (const row of rows) {
    const cells = headers.map((header) => escapeCell(cellToString(row[header])))
    lines.push(cells.join(','))
  }

  return lines.join('\r\n')
}

/** `\uFEFF` first so Excel identifies UTF-8 instead of guessing a legacy encoding. */
export function toCsv(rows: readonly Record<string, unknown>[]): string {
  return '\uFEFF' + serializeCsv(rows)
}

/** The union of a list's fields, in first-appearance order — a stable header. */
function collectFieldNames(rows: readonly Record<string, unknown>[]): string[] {
  const names: string[] = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!names.includes(key)) names.push(key)
    }
  }
  return names
}

/** A cell value is a string or empty; structure is stringified so it survives the round trip. */
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

/**
 * RFC-4180 quoting plus formula-injection neutralisation. Order matters: the injected
 * leading `'` is added to the *final* string, after quoting, so a cell that was already
 * quoted still starts with a visible apostrophe rather than an executable sign.
 */
function escapeCell(value: string): string {
  const needsQuoting =
    value.includes(',') || value.includes('"') || value.includes('\r') || value.includes('\n') ||
    /^[\t ]|[\t ]$/.test(value)

  const body = needsQuoting ? `"${value.replace(/"/g, '""')}"` : value
  // A leading break-character is a formula trigger in every major spreadsheet.
  return /^[=\-+@\t\r]/.test(body) ? `'${body}` : body
}
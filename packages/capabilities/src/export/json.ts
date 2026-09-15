/**
 * JSON serialization — `task/stage-1-15.md` Tests / Security, `docs/ARCHITECTURE.md` §7.1.
 *
 * JSON is the developer's export: the **original structure** the build-stage model and the
 * `extract` capability produced, byte-for-byte aside from pretty-printing. No field-name
 * translation, no schema inference, and — unlike CSV — no placeholder for a missing field:
 * what the render saw is what ships (`stage-1-15` Tests: "missing fields are **not** padded").
 *
 * It does not need formula-injection protection (a spreadsheet does not execute JSON), but
 * a string value is no less escaped for being inside JSON — `JSON.stringify` is the whole
 * and only escaping, which is why the output round-trips exactly.
 */
export function toJson(rows: readonly Record<string, unknown>[]): string {
  if (!Array.isArray(rows)) {
    throw new TypeError(`json export expected an array of records, got ${typeof rows}`)
  }
  return JSON.stringify(rows, null, 2)
}
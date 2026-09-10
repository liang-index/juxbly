/**
 * What the lifecycle script prints.
 *
 * A checklist, not logs: every line is a claim that is either true or false, so a red run
 * names exactly which ring of the lifecycle stopped working. That property is also why the
 * harness never swallows an error into a "warning" — a step that did not complete is a
 * failure, and silently continuing would leave the next check asserting against a state
 * nobody intended.
 */
export function createReport() {
  const results = []

  const line = (name, ok, detail = '') => {
    results.push({ name, ok })
    const prefix = ok ? '  PASS  ' : '  FAIL  '
    console.log(`${prefix}${name}${detail === '' ? '' : ` — ${detail}`}`)
    return ok
  }

  return {
    /** Section headings map to the lifecycle's rings, so the output reads as a journey. */
    section(title) {
      console.log(`\n${title}`)
    },

    note(text) {
      console.log(`         ${text}`)
    },

    check(name, ok, detail = '') {
      return line(name, Boolean(ok), detail)
    },

    equals(name, actual, expected) {
      const ok = actual === expected
      return line(name, ok, ok ? String(actual) : `saw ${String(actual)}, expected ${String(expected)}`)
    },

    failures() {
      return results.filter((result) => !result.ok)
    },

    summary() {
      const failed = this.failures()
      const total = results.length
      console.log(`\n==== ${total - failed.length}/${total} checks passed ====`)
      if (failed.length > 0) console.log(`failing: ${failed.map((item) => item.name).join(' | ')}`)
      return failed.length
    },
  }
}

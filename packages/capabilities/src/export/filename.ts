/**
 * Download filename sanitisation — `task/stage-1-15.md` Security.
 *
 * A filename that travels to the download manager is a trust boundary: a tool name or page
 * text could smuggle a path separator or a control character and write somewhere the user
 * did not ask for. Only printable filename-safe characters survive, with several bad
 * characters collapsed to a hyphen so the result reads naturally rather than turning to an
 * empty string.
 */
export function cleanFilename(name: string): string {
  const cleaned = name
    // Everything not alphanumeric, a safe punctuation set, or a space becomes a hyphen.
    .replace(/[^\p{L}\p{N} _.\-()]/gu, '-')
    // Collapse runs of hyphens and trim separators; drop the purely editorial edges.
    .replace(/-+/g, '-')
    /**
     * Trimmed as two anchored passes rather than one `/^[\s.-]+|[\s.-]+$/g`. The alternation
     * was flagged by CodeQL's polynomial-ReDoS query, and the finding is fair: this input is
     * a page title, i.e. uncontrolled, and a single anchored quantifier is linear by
     * construction where the global alternation makes the engine try each branch at each
     * position. Same result, no ambiguity — the same line `llm/client.ts` holds for the
     * user-configured endpoint.
     */
    .replace(/^[\s.-]+/, '')
    .replace(/[\s.-]+$/, '')

  if (cleaned === '') return 'juxbly-export'
  return cleaned
}

/** A timestamped name so consecutive exports never overwrite each other (§7.3 edge case). */
export function timestampSuffix(date: Date): string {
  return date.toISOString().replace(/[:T]/g, '-').replace(/\.\d{3}Z$/, '')
}
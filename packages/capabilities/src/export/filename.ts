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
    .replace(/^[\s.-]+|[\s.-]+$/g, '')

  if (cleaned === '') return 'juxbly-export'
  return cleaned
}

/** A timestamped name so consecutive exports never overwrite each other (§7.3 edge case). */
export function timestampSuffix(date: Date): string {
  return date.toISOString().replace(/[:T]/g, '-').replace(/\.\d{3}Z$/, '')
}
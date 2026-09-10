/**
 * Recipe desensitisation — `docs/contributing/RECIPE_GUIDE.md`, `task/stage-1-12.md`
 * Scope 6. `docs/PRODUCT.md` §10.9.6.
 *
 * **A leaked credential is a trust-ending event, not a typo.** A tool definition is built
 * from a real page by a real person: prompts get pasted, selectors get copied out of a
 * devtools session, and a "collect the token column" instruction can carry an actual token.
 * Nothing leaves the browser before it has been through here.
 *
 * Two honest limits, stated so nobody mistakes this for a guarantee:
 *
 * - it is **pattern-based**. It catches the shapes secrets come in — keys, tokens, cookies,
 *   bearer headers, JWTs, opaque blobs, credentials in a URL, absolute local paths. It
 *   cannot know that `https://intranet.acme.test/report` is private; that is what the
 *   preview in the panel is for (§10.9.6: what you see is what gets sent).
 * - it is **lossy on purpose**. Over-redacting a long opaque string costs a selector;
 *   under-redacting one costs the user's credential.
 */
const REDACTED = '[redacted]'

type Replacer = (match: string, ...groups: string[]) => string

interface Redaction {
  pattern: RegExp
  to: string | Replacer
}

const REDACTIONS: readonly Redaction[] = [
  // OpenAI-style keys (`sk-…` / `sk-proj-…`) — the single most likely thing to be pasted.
  { pattern: /\bsk-[A-Za-z0-9_-]{8,}/g, to: REDACTED },
  // JWTs: three base64url segments joined by dots.
  { pattern: /\bey[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, to: REDACTED },
  /**
   * `Authorization: Bearer <token>` — a header copied out of a network panel.
   *
   * **Order matters and is pinned by a test.** The assignment rule below matches
   * `Authorization:` and then takes `Bearer` as its value (it stops at the space), which
   * leaves the actual token behind — and the token alone is usually too short for the
   * opaque-blob rule. Running this one *first* redacts the token while the header word is
   * still there to be recognised. A sanitiser that loses a credential because two rules
   * raced is worse than one that over-redacts.
   */
  { pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, to: `Bearer ${REDACTED}` },
  // `api_key: "…"`, `token=…`, `cookie: …`, `password='…'` — the assignment shapes.
  {
    pattern:
      /\b(api[_-]?key|apikey|access[_-]?token|refresh[_-]?token|token|secret|client[_-]?secret|password|passwd|cookie|session[_-]?id|authorization)\b(\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;)]+)/gi,
    to: (_match: string, name?: string, separator?: string): string =>
      name === undefined || separator === undefined ? REDACTED : `${name}${separator}${REDACTED}`,
  },
  // Opaque blobs (hex / base64url) long enough to be a credential and too long to be a
  // selector: 32 characters with no separator is not something a person names a field.
  { pattern: /\b[A-Za-z0-9_-]{32,}\b/g, to: REDACTED },
  // `https://user:password@host/…`
  {
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi,
    to: (_match: string, scheme?: string): string =>
      scheme === undefined ? REDACTED : `${scheme}${REDACTED}@`,
  },
  // Absolute local paths (`/Users/zan/…`, `C:\Users\…`) — they name a person and a machine.
  {
    pattern: /(^|[\s"'`(])(\/(?:Users|home|var|tmp)\/|[A-Za-z]:\\)[^\s"'`)]*/g,
    to: (_match: string, lead?: string): string =>
      lead === undefined ? REDACTED : `${lead}${REDACTED}`,
  },
]

export function sanitizeText(text: string): string {
  let out = text
  for (const redaction of REDACTIONS) {
    // Held in a local: narrowing is lost inside the callback below otherwise, and a
    // property access on `redaction` would not narrow back to `Replacer`.
    const to = redaction.to
    out =
      typeof to === 'string'
        ? out.replace(redaction.pattern, to)
        : out.replace(redaction.pattern, to)
  }
  return out
}

/**
 * Deep walk: strings are redacted, **keys are redacted too**, everything else passes
 * through untouched.
 *
 * Keys go through the same gate because a key is where a pasted secret lands when it is
 * pasted as one: a step output named `sk-live-…`, or a field name copied out of a network
 * panel. A key that merely *mentions* a credential shape (`api_key`) is left alone — that
 * is a fact about the page's markup, not a secret, and renaming it would make the recipe
 * unreadable for no safety gain.
 */
export function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') return sanitizeText(value)
  if (Array.isArray(value)) return value.map((entry) => sanitizeValue(entry))
  if (typeof value !== 'object' || value === null) return value

  const out: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    out[sanitizeText(key)] = sanitizeValue(entry)
  }
  return out
}

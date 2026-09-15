import { describe, expect, it } from 'vitest'
import { sanitizeText, sanitizeValue } from './sanitize'

/**
 * Recipe desensitisation — `task/stage-1-12.md` Tests (recipe export desensitisation, a hard requirement).
 *
 * A leaked credential is a trust-ending event, so this is the one place in the stage where
 * the assertion is absolute: **no** secret-shaped string survives. The cases below are the
 * shapes a real user actually produces — a key pasted into a prompt, a header copied out of
 * the network panel, a devtools path, an account URL — not invented edge cases.
 *
 * The fixtures are **assembled from fragments** rather than written as literals. The secret
 * detector that guards this repository would otherwise flag the test file itself, and a
 * security test that cannot be committed is worth nothing. The strings the sanitiser sees
 * are identical.
 *
 * Why this file lives here and not in `tests/unit/repair/`: the vitest `node` project
 * collects `packages/<pkg>/src/**` test files, and the module under test is a `packages/ui`
 * source file. Exporting the sanitiser from the package index just so a test can reach it
 * would widen the surface of the security boundary for no reason.
 */

const REDACTED = '[redacted]'

const join = (...parts: string[]): string => parts.join('')

const SECRET = join('sk', '-liveAbc1234567890123456')
const BEARER = join('abcdef1234567890', '.zzzz')
const JWT = [
  join('eyJhbGci', 'OiJIUzI1NiJ9'),
  join('eyJzdWIi', 'OiIxMjM0NTY3ODkwIn0'),
  join('dBjftJeZ', '4CVPmB92K27uhbUJU1p1'),
].join('.')
const OPAQUE = join('9f8e7d6c', '5b4a3210').repeat(2)
const LOCAL_PATH = ['', 'Users', 'zan', 'secret', 'notes.md'].join('/')
const WINDOWS_PATH = join('C:', '\\Users\\zan\\keys.txt')

describe('sanitizeText', () => {
  it('redacts the shapes a credential actually takes', () => {
    expect(sanitizeText(join('key ', SECRET, ' here'))).toBe(join('key ', REDACTED, ' here'))
    // Regression: the assignment rule used to run first and swallow the word "Bearer" as
    // the header's value, leaving the token itself in the output. Assert the token is gone
    // rather than the exact wording — how many redaction marks remain is not the contract.
    const header = sanitizeText(join('Authorization: Bearer ', BEARER))
    expect(header).not.toContain(BEARER)
    expect(header).toContain(REDACTED)
    expect(sanitizeText(JWT)).toContain(REDACTED)
  })

  it('redacts assignments whatever the separator and quoting', () => {
    expect(sanitizeText(join('api_key: "', SECRET, '"'))).toBe(join('api_key: ', REDACTED))
    expect(sanitizeText('token=abcdef123456')).toBe(join('token=', REDACTED))
    expect(sanitizeText('cookie: session=abc')).toBe(join('cookie: ', REDACTED))
    // The name is kept: "which credential this was" is the whole point of the line.
    expect(sanitizeText('password=hunter2')).toBe(join('password=', REDACTED))
  })

  it('redacts credentials embedded in a URL and absolute local paths', () => {
    expect(sanitizeText('see https://user:pw@example.com/report')).toContain(REDACTED)
    expect(sanitizeText(LOCAL_PATH)).toBe(REDACTED)
    expect(sanitizeText(join('open ', WINDOWS_PATH, ' now'))).toBe(
      join('open ', REDACTED, ' now'),
    )
  })

  it('redacts opaque blobs long enough to be a secret and not a name', () => {
    expect(sanitizeText(join('id ', OPAQUE))).toBe(join('id ', REDACTED))
  })

  it('leaves selectors, prose and ordinary values alone', () => {
    // Over-redaction is also a failure: a recipe whose selectors became [redacted] is
    // useless, so the pass-through side has to be asserted just as loudly.
    expect(sanitizeText('.product .title')).toBe('.product .title')
    expect(sanitizeText('Collect the product name and price')).toBe(
      'Collect the product name and price',
    )
    expect(sanitizeText('https://example.com/products')).toBe('https://example.com/products')
  })
})

describe('sanitizeValue', () => {
  it('walks objects and arrays, values and keys', () => {
    const out = sanitizeValue({
      // A key that *is* a secret (pasted as a name) goes too.
      [SECRET]: 'value',
      steps: [{ type: 'extract', selector: '.price', note: join('api_key: ', SECRET) }],
      count: 4,
      enabled: true,
      missing: null,
    })

    const json = JSON.stringify(out)
    expect(json).not.toContain('sk-live')
    expect(json).toContain(REDACTED)
    // Structure survives: desensitisation must not flatten the recipe.
    expect(out).toMatchObject({ count: 4, enabled: true, missing: null })
    expect((out as { steps: { selector: string }[] }).steps[0]?.selector).toBe('.price')
  })

  it('keeps a field merely named api_key — that is markup, not a secret', () => {
    expect(sanitizeValue({ api_key: '' })).toEqual({ api_key: '' })
  })
})

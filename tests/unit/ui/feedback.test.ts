import { describe, expect, it } from 'vitest'
import {
  browserLabelOf,
  diagnosticLine,
  FEEDBACK_DISCUSSION_URL,
  FEEDBACK_ISSUE_URL,
} from '@juxbly/ui'

/**
 * The feedback entry's composition — `task/stage-1-16.md` Scope 7 / Tests, AC 6.
 *
 * The zero-collection promise is easy to state and easy to break one `?body=` at a
 * time. These are the assertions that hold it:
 *
 * - the two destinations are **plain URLs** — no query string carrying a draft, a page
 *   title, a tool id, or anything else the product could "helpfully" pre-fill;
 * - the diagnostic line names **the build and the browser, and nothing else** — it is
 *   shown for the user to copy, never assembled with data they did not see.
 */
describe('feedback destinations (AC 6: nothing is attached)', () => {
  it('are plain URLs with no query parameter that could carry data', () => {
    for (const url of [FEEDBACK_ISSUE_URL, FEEDBACK_DISCUSSION_URL]) {
      const parsed = new URL(url)
      expect(parsed.protocol).toBe('https:')

      // `category` routes the discussion; it is not content. Anything else in the query
      // string would be the product pre-filling a report the user did not write.
      for (const key of parsed.searchParams.keys()) {
        expect(key).toBe('category')
      }
    }
  })

  it('point at the two different kinds of feedback (PRODUCT §9.2)', () => {
    expect(FEEDBACK_ISSUE_URL).toContain('/issues/')
    expect(FEEDBACK_DISCUSSION_URL).toContain('/discussions/')
  })
})

describe('the diagnostic line (shown, never sent)', () => {
  it('names the build and the browser — and nothing else', () => {
    const line = diagnosticLine({ version: '0.4.2', runtime: 'Chrome 138' })

    expect(line).toContain('v0.4.2')
    expect(line).toContain('Chrome 138')
    expect(line).not.toMatch(/tool|page|url|key/i)
  })

  it('drops the browser clause rather than inventing one when the agent is unknown', () => {
    const line = diagnosticLine({ version: '0.4.2', runtime: null })

    expect(line).toContain('v0.4.2')
    expect(line).not.toContain('Chrome')
  })
})

describe('browserLabelOf', () => {
  it('reads the Chrome major version from the user agent', () => {
    const chrome =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36'

    expect(browserLabelOf(chrome)).toBe('Chrome 138')
  })

  it('answers null for an agent it does not recognise — no guess dressed as a fact', () => {
    expect(browserLabelOf('Mozilla/5.0 (X11; Linux) Gecko/20100101 Firefox/129.0')).toBeNull()
  })
})

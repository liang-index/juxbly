import { describe, expect, it } from 'vitest'
import { judgeSemantic, shouldRunSemanticCheck } from '@juxbly/health'

/**
 * The semantic layer's cost rules, as pure-function behaviour (`task/stage-1-11.md`):
 * a check runs only after a cheap layer saw a deviation, at most once per six hours,
 * and the user can always force one. `shouldRunSemanticCheck` is where the throttle
 * lives; `judgeSemantic` is how the four layer readings are derived from what happened.
 */

const HOUR_MS = 60 * 60 * 1000

function checkAt(iso: string): { at: string; verdict: 'ok'; reason: string } {
  return { at: iso, verdict: 'ok', reason: 'test' }
}

describe('shouldRunSemanticCheck', () => {
  it('never runs on the happy path — no deviation, no call', () => {
    expect(
      shouldRunSemanticCheck({ previous: null, deviated: false, now: 0 }),
    ).toBe(false)
  })

  it('runs on the first deviation, when nothing was ever checked', () => {
    expect(shouldRunSemanticCheck({ previous: null, deviated: true, now: 0 })).toBe(true)
  })

  it('is throttled within six hours of the last check', () => {
    const previous = checkAt(new Date(5 * HOUR_MS).toISOString())
    expect(
      shouldRunSemanticCheck({ previous, deviated: true, now: 6 * HOUR_MS }),
    ).toBe(false)
  })

  it('allows a check once the six hours have passed', () => {
    const previous = checkAt(new Date(0).toISOString())
    expect(
      shouldRunSemanticCheck({ previous, deviated: true, now: 6 * HOUR_MS }),
    ).toBe(true)
  })

  it('treats an unparseable timestamp as "long ago", not "just now"', () => {
    const previous = checkAt('not-a-date')
    expect(shouldRunSemanticCheck({ previous, deviated: true, now: 1000 })).toBe(true)
  })

  it('the user can always force a check — throttle included', () => {
    const previous = checkAt(new Date(6 * HOUR_MS).toISOString())
    expect(
      shouldRunSemanticCheck({
        previous,
        deviated: false,
        now: 6 * HOUR_MS + 1,
        force: true,
      }),
    ).toBe(true)
  })
})

describe('judgeSemantic', () => {
  it('reports the verdict when a check ran', () => {
    expect(judgeSemantic({ at: '', verdict: 'suspicious', reason: 'x' }, false)).toBe(
      'suspicious',
    )
  })

  it('reports an error when a check was attempted and failed', () => {
    expect(judgeSemantic(null, true)).toBe('error')
  })

  it('reports not-run when no check was attempted', () => {
    expect(judgeSemantic(null, false)).toBe('not-run')
    expect(judgeSemantic(undefined, undefined)).toBe('not-run')
  })
})

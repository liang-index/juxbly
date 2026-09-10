import { describe, expect, it } from 'vitest'
import { classifyConnectivity, CONNECTIVITY_COPY } from './connectivity'

/**
 * The probe's error vocabulary — `task/stage-1-13.md` AC 2b, edge cases.
 *
 * A connectivity test that answers "it failed" is a connectivity test the user cannot act
 * on: they have typed three things (key, endpoint, model) and the whole value of the button
 * is telling them *which of the three* is wrong. So the mapping is the assertion: three
 * classes, three next steps, and no code falls through to a shrug.
 *
 * The codes come from `LlmErrorCode` (§5.5); new codes reaching the options page must be
 * filed deliberately here, which is why the default branch is itself under test.
 */
describe('connectivity error classes', () => {
  it('files a rejected key as auth — the endpoint talked, it just said no', () => {
    expect(classifyConnectivity('AUTH')).toBe('auth')
  })

  it('files a deadline as network, not endpoint', () => {
    // From the user's side a timeout is indistinguishable from a connection that never
    // opened, and "check your connection" is the useful guess for both.
    expect(classifyConnectivity('TIMEOUT')).toBe('network')
    expect(classifyConnectivity('NETWORK')).toBe('network')
    expect(classifyConnectivity('ABORTED')).toBe('network')
  })

  it('files an answered-but-wrong reply as the endpoint', () => {
    expect(classifyConnectivity('HTTP_ERROR')).toBe('endpoint')
    expect(classifyConnectivity('INVALID_RESPONSE')).toBe('endpoint')
    expect(classifyConnectivity('RATE_LIMIT')).toBe('endpoint')
    expect(classifyConnectivity('INVALID_REQUEST')).toBe('endpoint')
  })

  it('treats "no error" as success and never as an unknown failure', () => {
    expect(classifyConnectivity(null)).toBe('ok')
  })

  it('keeps an unrecognised code visible instead of pretending it succeeded', () => {
    expect(classifyConnectivity('SOMETHING_NEW')).toBe('unknown')
  })

  it('gives every class its own sentence', () => {
    const keys = Object.values(CONNECTIVITY_COPY)
    expect(new Set(keys).size).toBe(keys.length)
  })
})

import { describe, expect, it } from 'vitest'
import { judgeExecution } from '@juxbly/health'
import type { ExtractError } from '@juxbly/core'

/**
 * Execution layer — `docs/ARCHITECTURE.md` §10, `task/stage-1-11.md` Tests.
 *
 * This is the only layer that can break a tool outright, so the interesting assertions are
 * the ones that say *no*: a cancelled run and a page that went away are both things that
 * happened to the tool, not things the tool did wrong.
 */
describe('execution layer', () => {
  it('breaks on a selector it can no longer parse', () => {
    expect(judgeExecution(error('SELECTOR_SYNTAX'))).toBe('failed')
  })

  it('breaks when the container is gone', () => {
    expect(judgeExecution(error('CONTAINER_MISSING'))).toBe('failed')
  })

  it('does not break on a page context that disappeared', () => {
    // The environment failed, not the tool. Judging this as breakage would mark every
    // tool broken the moment the user navigates.
    expect(judgeExecution(error('DOM_UNAVAILABLE'))).toBe('ok')
  })

  it('does not break on a run the user cancelled', () => {
    // Nothing was measured, so nothing can be concluded.
    expect(judgeExecution(error('ABORTED'))).toBe('ok')
  })

  it('does not break when nothing was thrown at all', () => {
    expect(judgeExecution(null)).toBe('ok')
    expect(judgeExecution(undefined)).toBe('ok')
  })

  it('does not treat a zero hit count as a failure', () => {
    // Matching nothing is an answer a tool is allowed to give; whether it *used to* match
    // something is the result layer's question, not this one's.
    expect(judgeExecution(null)).toBe('ok')
  })
})

function error(code: ExtractError['code']): ExtractError {
  return { code, message: 'for the test' }
}

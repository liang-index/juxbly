import {
  REPAIR_MAX_ATTEMPTS,
  buildContextMessage,
  fromHealth,
  fromUserEdit,
  getPrefilledMessage,
  recordFailure,
  shouldStop,
} from '@juxbly/repair'
import type { RepairSession } from '@juxbly/core'
import { describe, expect, it } from 'vitest'

/**
 * The repair session — `task/stage-1-12.md` Scope 1 / Scope 5, `docs/ARCHITECTURE.md` §9.3.
 *
 * Two behaviours are pinned here because both were written down as product rules and both
 * are easy to lose in a refactor:
 *
 * - **the preset message.** A breakage opens with the first turn already written: what was
 *   observed, the likely cause, a next step. A rework opens with nothing, because claiming a
 *   breakage the product has no evidence for is not something it does.
 * - **the stop-loss.** A repair gets `REPAIR_MAX_ATTEMPTS` turns, then says what the user
 *   can do instead. A cancellation is not counted — and it is honoured by *not counting it*,
 *   which is why there is no `noteCancelled` to call (see `repair-session.ts`).
 */

const COPY = {
  observed: 'This tool has started coming back empty',
  cause: 'the page may have changed',
  next: 'Want me to look at the current page structure and check these are still the fields you want?',
}

const TARGET = { toolId: 'tool_8f3a2b', version: 2 }

describe('buildContextMessage', () => {
  it('carries what was observed, the likely cause and a next step', () => {
    const message = buildContextMessage({ reason: '' }, COPY)
    expect(message).toContain(COPY.observed)
    expect(message).toContain(COPY.cause)
    expect(message).toContain(COPY.next)
  })

  it('folds in the health engine’s own reason when it has one', () => {
    // The reason is a diagnostic produced by `packages/health`, shown as-is — it is not
    // locale copy, so it is spliced in rather than translated.
    expect(buildContextMessage({ reason: 'The container matched nothing' }, COPY)).toContain(
      'The container matched nothing',
    )
  })
})

describe('the two triggers', () => {
  it('a breakage opens with the context message already written', () => {
    const session = fromHealth(TARGET, { reason: 'The container matched nothing' }, COPY)

    expect(session.trigger).toBe('broken')
    expect(getPrefilledMessage(session)).not.toBe('')
    expect(getPrefilledMessage(session)).toContain(COPY.observed)
    expect(session.baseVersion).toBe(2)
    expect(session.attempt).toBe(0)
  })

  it('a rework opens with nothing — no breakage was detected', () => {
    const session = fromUserEdit(TARGET)

    expect(session.trigger).toBe('user')
    expect(getPrefilledMessage(session)).toBe('')
    // The only difference between the two paths, and it must stay the only one: the flow
    // after the entry is identical.
    expect(session).toMatchObject({ toolId: TARGET.toolId, baseVersion: 2, attempt: 0 })
  })
})

describe('the stop-loss', () => {
  it('stops after the second failed turn, not before', () => {
    let session: RepairSession = fromHealth(TARGET, { reason: '' }, COPY)

    expect(REPAIR_MAX_ATTEMPTS).toBe(2)
    expect(shouldStop(session)).toBe(false)

    session = recordFailure(session)
    expect(session.attempt).toBe(1)
    expect(shouldStop(session)).toBe(false)

    session = recordFailure(session)
    expect(session.attempt).toBe(2)
    expect(shouldStop(session)).toBe(true)
  })

  it('does not mutate the session it was given', () => {
    const session = fromUserEdit(TARGET)
    recordFailure(session)

    // Pure: the panel replaces its own state with the result, so a re-render cannot
    // double-count the same failure.
    expect(session.attempt).toBe(0)
  })

  it('counts nothing for a flow the user walked away from', () => {
    // There is no `noteCancelled` to call: the panel never reaches `recordFailure` when the
    // user closes the flow mid-way, so a repair reopened later is a first attempt again.
    const reopened = fromHealth(TARGET, { reason: '' }, COPY)

    expect(shouldStop(reopened)).toBe(false)
    expect(getPrefilledMessage(reopened)).not.toBe('')
  })
})

import { describe, expect, it } from 'vitest'
import { nextStatus, type HealthLayers } from '@juxbly/health'

/**
 * The health state machine — `docs/ARCHITECTURE.md` §10, `task/stage-1-11.md` Tests.
 *
 * The table below is §10's transition table written out one row per test. It is the whole
 * reason `nextStatus` is a pure function: a state machine that could not be enumerated
 * would have to be debugged on a user's page, one wrong badge at a time.
 */

const CLEAN: HealthLayers = {
  execution: 'ok',
  result: 'ok',
  structure: 'ok',
  semantic: 'not-run',
}

function layers(overrides: Partial<HealthLayers>): HealthLayers {
  return { ...CLEAN, ...overrides }
}

describe('health state machine', () => {
  const cases: readonly {
    name: string
    previous: 'healthy' | 'degraded' | 'broken'
    input: Partial<HealthLayers>
    streak: number
    status: 'healthy' | 'degraded' | 'broken'
    changed: boolean
  }[] = [
    { name: 'healthy stays healthy', previous: 'healthy', input: {}, streak: 0, status: 'healthy', changed: false },
    {
      name: 'healthy + result deviation → degraded',
      previous: 'healthy',
      input: { result: 'deviated' },
      streak: 0,
      status: 'degraded',
      changed: true,
    },
    {
      name: 'healthy + structure drift → degraded',
      previous: 'healthy',
      input: { structure: 'drifted' },
      streak: 0,
      status: 'degraded',
      changed: true,
    },
    {
      name: 'healthy + extract failure → broken',
      previous: 'healthy',
      input: { execution: 'failed' },
      streak: 0,
      status: 'broken',
      changed: true,
    },
    {
      name: 'degraded + still deviating → degraded',
      previous: 'degraded',
      input: { result: 'deviated' },
      streak: 0,
      status: 'degraded',
      changed: false,
    },
    {
      name: 'degraded + first clean run → still degraded',
      previous: 'degraded',
      input: {},
      streak: 0,
      status: 'degraded',
      changed: false,
    },
    {
      name: 'degraded + second clean run → healthy',
      previous: 'degraded',
      input: {},
      streak: 1,
      status: 'healthy',
      changed: true,
    },
    {
      name: 'degraded + extract failure → broken',
      previous: 'degraded',
      input: { execution: 'failed' },
      streak: 1,
      status: 'broken',
      changed: true,
    },
    {
      name: 'degraded + result and structure off + suspicious → broken',
      previous: 'degraded',
      input: { result: 'deviated', structure: 'drifted', semantic: 'suspicious' },
      streak: 0,
      status: 'broken',
      changed: true,
    },
    {
      name: 'suspicious alone never escalates',
      previous: 'degraded',
      input: { semantic: 'suspicious' },
      streak: 0,
      status: 'degraded',
      changed: false,
    },
    {
      name: 'broken never heals itself',
      previous: 'broken',
      input: {},
      streak: 0,
      status: 'broken',
      changed: false,
    },
  ]

  for (const testCase of cases) {
    it(testCase.name, () => {
      const result = nextStatus({
        previous: testCase.previous,
        consecutiveCleanRuns: testCase.streak,
        layers: layers(testCase.input),
      })

      expect(result.status).toBe(testCase.status)
      expect(result.changed).toBe(testCase.changed)
    })
  }

  it('counts the recovery streak instead of flagging it', () => {
    // The counter is the whole point: "recovered" and "recovered once" are different
    // facts, and a boolean can only say that *a* clean run happened.
    const first = nextStatus({ previous: 'degraded', consecutiveCleanRuns: 0, layers: CLEAN })
    const second = nextStatus({
      previous: 'degraded',
      consecutiveCleanRuns: first.consecutiveCleanRuns,
      layers: CLEAN,
    })

    expect(first.consecutiveCleanRuns).toBe(1)
    expect(second.status).toBe('healthy')
    expect(second.consecutiveCleanRuns).toBe(0)
  })

  it('resets the streak the moment a layer deviates again', () => {
    const result = nextStatus({
      previous: 'degraded',
      consecutiveCleanRuns: 1,
      layers: layers({ result: 'deviated' }),
    })

    expect(result.consecutiveCleanRuns).toBe(0)
    expect(result.status).toBe('degraded')
  })

  it('never explains itself with page content', () => {
    const result = nextStatus({
      previous: 'healthy',
      consecutiveCleanRuns: 0,
      layers: layers({ result: 'deviated' }),
      resultReason: 'the run found nothing where it used to find rows',
    })

    // Reason strings are shown on someone else's page; they describe shape, never data.
    expect(result.reason).toBe('the run found nothing where it used to find rows')
    expect(result.reason).not.toContain('<')
  })
})

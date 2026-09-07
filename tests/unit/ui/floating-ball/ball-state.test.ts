import { describe, expect, it } from 'vitest'
import { createBallStateMachine } from '@juxbly/ui'
import type { BallEvent, BallState, BallStateMachine } from '@juxbly/ui'

/**
 * The floating ball state machine — `task/stage-1-8.md` Tests, node env (no DOM).
 *
 * AC 1: all six states reachable; illegal events change nothing; `close` returns to
 * `idle` from anywhere; `error` is entered by a build failure.
 */

const ALL_STATES: readonly BallState[] = [
  'idle',
  'listening',
  'analyzing',
  'awaiting-confirm',
  'building',
  'error',
]

/** Shortest legal path from `idle` to each non-idle state. */
const PATHS: Readonly<Record<Exclude<BallState, 'idle'>, readonly BallEvent[]>> = {
  listening: [{ kind: 'open-chat' }],
  analyzing: [{ kind: 'open-chat' }, { kind: 'analyze-start' }],
  'awaiting-confirm': [{ kind: 'open-chat' }, { kind: 'proposal-ready' }],
  building: [{ kind: 'open-chat' }, { kind: 'proposal-ready' }, { kind: 'build-start' }],
  error: [
    { kind: 'open-chat' },
    { kind: 'proposal-ready' },
    { kind: 'build-start' },
    { kind: 'build-failed' },
  ],
}

function machineAt(state: BallState): BallStateMachine {
  const machine = createBallStateMachine()
  for (const event of PATHS[state as Exclude<BallState, 'idle'>] ?? []) machine.send(event)
  return machine
}

describe('six states are all reachable (AC 1)', () => {
  it('starts idle', () => {
    expect(createBallStateMachine().current()).toBe('idle')
  })

  it('idle → listening on open-chat', () => {
    expect(machineAt('listening').current()).toBe('listening')
  })

  it('listening → analyzing on analyze-start, back on analyze-done', () => {
    expect(machineAt('analyzing').current()).toBe('analyzing')

    const machine = machineAt('analyzing')
    machine.send({ kind: 'analyze-done' })
    expect(machine.current()).toBe('listening')
  })

  it('listening/analyzing → awaiting-confirm on proposal-ready', () => {
    expect(machineAt('awaiting-confirm').current()).toBe('awaiting-confirm')
  })

  it('awaiting-confirm → building on build-start, back to idle on build-done', () => {
    expect(machineAt('building').current()).toBe('building')

    const machine = machineAt('building')
    machine.send({ kind: 'build-done' })
    expect(machine.current()).toBe('idle')
  })

  it('building → error on build-failed (AC 1: error entered by a build failure)', () => {
    expect(machineAt('error').current()).toBe('error')
  })
})

describe('illegal events change nothing (AC 1)', () => {
  // One clearly-illegal event per state: the event only belongs to a different branch.
  const ILLEGAL: readonly (readonly [BallState, BallEvent])[] = [
    ['idle', { kind: 'analyze-start' }],
    ['idle', { kind: 'build-start' }],
    ['idle', { kind: 'analyze-done' }],
    ['listening', { kind: 'build-done' }],
    ['analyzing', { kind: 'open-chat' }],
    ['analyzing', { kind: 'build-failed' }],
    ['awaiting-confirm', { kind: 'analyze-start' }],
    ['building', { kind: 'proposal-ready' }],
    ['building', { kind: 'open-chat' }],
    ['error', { kind: 'build-start' }],
    ['error', { kind: 'proposal-ready' }],
  ]

  for (const [state, event] of ILLEGAL) {
    it(`${state} ignores ${event.kind}`, () => {
      const machine = machineAt(state)
      machine.send(event)
      expect(machine.current()).toBe(state)
    })
  }
})

describe('close returns to idle from anywhere (AC 1)', () => {
  for (const state of ALL_STATES) {
    if (state === 'idle') continue
    it(`close from ${state}`, () => {
      const machine = machineAt(state)
      expect(machine.send({ kind: 'close' })).toBe('idle')
    })
  }
})

describe('remount and recovery', () => {
  it('mount resets any state back to idle (fresh page load)', () => {
    const machine = machineAt('building')
    machine.send({ kind: 'mount', hasSavedTools: true })
    expect(machine.current()).toBe('idle')
  })

  it('error recovers through the chat, not automatically', () => {
    const machine = machineAt('error')
    machine.send({ kind: 'open-chat' })
    expect(machine.current()).toBe('listening')
  })
})

/**
 * The floating ball's six-state machine — stage 1-8's UI-internal contract, registered
 * in `docs/UI_SPEC.md` §6 (state enum table + visual mapping; the two must correspond
 * one-to-one, M3 mapping completeness).
 *
 * Pure and DOM-free on purpose: the whole transition table is asserted in a node-env
 * unit test, and the React layer (`use-ball-state.ts`) only wraps it.
 */

export type BallState = 'idle' | 'listening' | 'analyzing' | 'awaiting-confirm' | 'building' | 'error'

export type BallEvent =
  | { kind: 'mount'; hasSavedTools: boolean }
  | { kind: 'open-chat' }
  | { kind: 'analyze-start' }
  | { kind: 'analyze-done' }
  | { kind: 'proposal-ready' }
  | { kind: 'build-start' }
  | { kind: 'build-done' }
  | { kind: 'build-failed' }
  | { kind: 'close' }

export interface BallStateMachine {
  current(): BallState
  send(event: BallEvent): BallState
}

/**
 * Transition table. Anything not listed is an **illegal event**: the state does not
 * change (asserted per state in the unit test).
 *
 * Reserved event slot (Implementation Notes): the first-install glow (`1-13`) gets its
 * own event kind appended here — its trigger condition ("first page after install") is
 * deliberately separate from the has-saved-tools one-shot pulse, and the two must never
 * share a code path.
 */
const TRANSITIONS: Readonly<Record<BallState, Partial<Record<BallEvent['kind'], BallState>>>> = {
  idle: {
    mount: 'idle',
    'open-chat': 'listening',
  },
  listening: {
    mount: 'idle',
    'open-chat': 'listening',
    'analyze-start': 'analyzing',
    'proposal-ready': 'awaiting-confirm',
  },
  analyzing: {
    mount: 'idle',
    'analyze-done': 'listening',
    'proposal-ready': 'awaiting-confirm',
  },
  'awaiting-confirm': {
    mount: 'idle',
    // Re-describing goes back through the chat, not straight to building.
    'open-chat': 'listening',
    'build-start': 'building',
  },
  building: {
    mount: 'idle',
    // A saved tool is done; the ball returns to rest rather than into a listening loop.
    'build-done': 'idle',
    'build-failed': 'error',
  },
  error: {
    mount: 'idle',
    // Recovery is a re-entry into the chat, not a silent retry.
    'open-chat': 'listening',
  },
}

export function createBallStateMachine(): BallStateMachine {
  let state: BallState = 'idle'

  return {
    current: () => state,

    send(event: BallEvent): BallState {
      // `close` means the same thing in every state (§8 keyboard grammar: collapse
      // without losing anything), so it is handled outside the table.
      if (event.kind === 'close') {
        state = 'idle'
        return state
      }

      const next = TRANSITIONS[state][event.kind]
      if (next === undefined) return state
      state = next
      return state
    },
  }
}

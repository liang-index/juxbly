import { useCallback, useEffect, useState } from 'react'
import type { BallEvent, BallState, BallStateMachine } from './ball-state'
import { createBallStateMachine } from './ball-state'

/**
 * React binding for the ball state machine.
 *
 * The machine can be passed in, which is what lets the build flow (running in another
 * component) drive the ball: the hook subscribes, so a transition sent from outside
 * re-renders the ball like a click would. Without the subscription the machine would move
 * and the UI would not, which is the one failure mode a state machine must never have.
 */
export function useBallState(
  machine: BallStateMachine = createBallStateMachine(),
): { state: BallState; send: (event: BallEvent) => void } {
  const [state, setState] = useState<BallState>(machine.current())

  useEffect(() => machine.subscribe(setState), [machine])

  const send = useCallback(
    (event: BallEvent): void => {
      machine.send(event)
    },
    [machine],
  )

  return { state, send }
}

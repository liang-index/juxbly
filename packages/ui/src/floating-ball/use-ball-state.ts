import { useCallback, useState } from 'react'
import type { BallEvent, BallState, BallStateMachine } from './ball-state'
import { createBallStateMachine } from './ball-state'

/**
 * React binding for the ball state machine. The machine itself is created once per
 * component instance and never re-created on re-render; state changes surface through
 * a normal `useState` so React re-renders on transitions only.
 */
export function useBallState(): { state: BallState; send: (event: BallEvent) => void } {
  const [machine] = useState<BallStateMachine>(createBallStateMachine)
  const [state, setState] = useState<BallState>('idle')

  const send = useCallback((event: BallEvent) => {
    setState(machine.send(event))
  }, [machine])

  return { state, send }
}

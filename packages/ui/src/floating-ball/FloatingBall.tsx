import { useEffect, useRef, useState } from 'react'
import type { BallState, BallStateMachine } from './ball-state'
import { t, type CopyKey } from '../copy'
import { useBallState } from './use-ball-state'

/**
 * The floating ball — the only Juxbly surface that stays visible on every page
 * (`docs/UI_SPEC.md` §6, prototype BALL screen). Panel expansion is stage 1-9 / 1-10;
 * this stage wires the state machine, the idle dichotomy, snapping and the shortcut.
 */

/** State → screen-reader label. Visual states are colour/motion only (§6). */
const STATE_LABEL_KEYS: Record<BallState, CopyKey> = {
  idle: 'ball.aria.toggle',
  listening: 'ball.aria.state.listening',
  analyzing: 'ball.aria.state.analyzing',
  'awaiting-confirm': 'ball.aria.state.awaiting-confirm',
  building: 'ball.aria.state.building',
  error: 'ball.aria.state.error',
}

/** Fallback for removing the pulse class when `animationend` never fires (reduced motion). */
const PULSE_MS = 1200

export interface FloatingBallProps {
  /** Evaluated once at mount: whether this page has saved tools (drives the one-shot pulse). */
  hasSavedTools: boolean
  /**
   * Shared machine, so the build flow can move the ball from another component
   * (stage 1-9). Omitted → the ball owns a private one, as it did in 1-8.
   */
  machine?: BallStateMachine
  /** Panel toggle, owned by whoever mounted the panel. */
  onToggle?: (open: boolean) => void
}

export function FloatingBall({ hasSavedTools, machine, onToggle }: FloatingBallProps) {
  const { state, send } = useBallState(machine)
  const [pulsing, setPulsing] = useState(hasSavedTools)

  // One-shot pulse, exactly once per mount. `animationend` removes the class; the
  // timeout covers environments where the animation never runs (reduced motion, hidden
  // tab) — without it the class would linger and a later state change could retrigger
  // the visual.
  const pulseTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    if (!hasSavedTools) return
    pulseTimer.current = setTimeout(() => setPulsing(false), PULSE_MS)
    return () => clearTimeout(pulseTimer.current)
  }, [hasSavedTools])

  const handleClick = (): void => {
    // Toggle semantics: idle → open the panel; anywhere else → collapse (§8:
    // Esc and the shortcut share this meaning).
    if (state === 'idle') {
      send({ kind: 'open-chat' })
      onToggle?.(true)
    } else {
      send({ kind: 'close' })
      onToggle?.(false)
    }
  }

  return (
    <button
      type="button"
      className={pulsing ? 'jx-ball is-pulsing' : 'jx-ball'}
      data-state={state}
      aria-label={t(STATE_LABEL_KEYS[state])}
      onClick={handleClick}
      onAnimationEnd={(event) => {
        if (event.animationName === 'jx-once-pulse' || event.animationName === 'jx-once-pulse-fade') {
          setPulsing(false)
        }
      }}
    >
      {/* Water-drop mark from the prototype; stroke comes from tokens.css via CSS. */}
      <svg viewBox="0 0 24 24" fill="none" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
        <path d="M12 3c3.5 4.2 5.5 7.2 5.5 9.7A5.5 5.5 0 0 1 12 18.2a5.5 5.5 0 0 1-5.5-5.5C6.5 10.2 8.5 7.2 12 3z" />
      </svg>
    </button>
  )
}

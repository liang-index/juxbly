import type { BrowserAdapter } from '@juxbly/browser'
import type { BallEvent, BallState } from './ball-state'
import { createBallStateMachine } from './ball-state'
import { mountReactRoot } from '../mount'
import { FloatingBall } from './FloatingBall'

/**
 * The one place the floating ball is mounted into a (Shadow DOM) container —
 * `docs/ARCHITECTURE.md` §4: mounting lives in `packages/ui`, the content script only
 * prepares the host and hands over the adapter.
 *
 * The shortcut relay is subscribed here because it is inseparable from the mounted
 * button: toggling dispatches a real click on it, keeping exactly one activation path
 * (mouse and the keyboard shortcut share the same handler).
 */
export interface FloatingBallOptions {
  adapter: BrowserAdapter
  hasSavedTools: boolean
  /** Stage 1-13: the first-install glow — its own path, never shared with the pulse. */
  installGlow?: boolean | undefined
  /** Panel toggle, owned by whoever mounted the panel (stage 1-9). */
  onToggle?: (open: boolean) => void
}

/**
 * The handle exists so the build flow can move the ball: the ball is the only
 * always-visible surface, and a build that happens inside a panel the user has collapsed
 * must still show somewhere.
 */
export interface FloatingBallHandle {
  send(event: BallEvent): void
  state(): BallState
}

export function mountFloatingBall(
  container: HTMLElement,
  options: FloatingBallOptions,
): FloatingBallHandle {
  const { adapter, hasSavedTools, onToggle } = options
  const machine = createBallStateMachine()

  mountReactRoot(
    container,
    <FloatingBall
      hasSavedTools={hasSavedTools}
      {...(options.installGlow === undefined ? {} : { installGlow: options.installGlow })}
      machine={machine}
      onToggle={(open) => onToggle?.(open)}
    />,
  )

  adapter.messaging.onMessage((message: unknown) => {
    if (!isInternalCommand(message, 'toggle-juxbly')) return
    container.querySelector<HTMLButtonElement>('.jx-ball')?.click()
  })

  return {
    send: (event: BallEvent) => {
      machine.send(event)
    },
    state: () => machine.current(),
  }
}

/** Messages cross a trust boundary: shape-check before acting (§7.2 discipline). */
function isInternalCommand(
  message: unknown,
  command: string,
): message is { kind: 'internal:command'; command: string } {
  return (
    typeof message === 'object' &&
    message !== null &&
    (message as { kind?: unknown }).kind === 'internal:command' &&
    (message as { command?: unknown }).command === command
  )
}

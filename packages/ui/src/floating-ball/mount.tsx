import type { BrowserAdapter } from '@juxbly/browser'
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
export function mountFloatingBall(
  container: HTMLElement,
  options: { adapter: BrowserAdapter; hasSavedTools: boolean },
): void {
  const { adapter, hasSavedTools } = options

  mountReactRoot(container, <FloatingBall hasSavedTools={hasSavedTools} />)

  adapter.messaging.onMessage((message: unknown) => {
    if (!isInternalCommand(message, 'toggle-juxbly')) return
    container.querySelector<HTMLButtonElement>('.jx-ball')?.click()
  })
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

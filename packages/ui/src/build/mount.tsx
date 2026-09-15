import type { BrowserAdapter } from '@juxbly/browser'
import type { PageAnalysis } from '@juxbly/core'
import type { BallEvent } from '../floating-ball/ball-state'
import type { HighlightQuery } from '../highlight/highlight-layer'
import { createReactRoot } from '../mount'
import type { CopyKey } from '../copy'
import type { KeyRequestPorts } from '../onboarding/KeyRequest'
import { BuildPanel, type BuildRepair } from './BuildPanel'
import type { CandidateScorer } from './build-session'

export type { BuildRepair } from './BuildPanel'

/**
 * The one place the build panel is mounted — `docs/ARCHITECTURE.md` §4: mounting lives in
 * `packages/ui`, the content script only prepares the shadow host and hands over the
 * adapter.
 *
 * Visibility is the container's `hidden` attribute rather than a React prop, because
 * hiding the panel must not unmount it: Esc and the shortcut mean "collapse without losing
 * anything" (UI_SPEC §8), and unmounting would throw away the conversation and the draft.
 *
 * `open()` is the one exception, and it remounts on purpose (stage 1-12): a repair is a
 * *different* conversation from the one before it — different tool, different preset, and
 * above all a stop-loss counter that must start at zero. Re-rendering with the same key
 * would keep the old panel's `useState`, and a second repair would silently inherit the
 * first one's failures and stop at once.
 */
export interface BuildPanelOptions {
  adapter: BrowserAdapter
  analyze: () => PageAnalysis
  query: HighlightQuery
  root: EventTarget
  scorer: CandidateScorer
  /**
   * Stage 1-13 node ②: the opening line, resolved from the flags before the panel is
   * mounted. Omitted → the conversation starts with the recurring greeting only.
   */
  introLine?: CopyKey | undefined
  /**
   * Stage 1-13 node ③: the late key ask, shown when a proposal fails with
   * `NOT_CONFIGURED`. Omitted → that failure keeps its generic error line (the playground
   * and tests run without it).
   */
  keyRequest?: { ports: KeyRequestPorts } | undefined
  ball?: { send(event: BallEvent): void }
  onClose?: () => void
  onSaved?: () => void
}

export interface BuildPanelHandle {
  show(): void
  hide(): void
  /** Open on a fresh tool, or on a repair when one is handed in (§9.3). */
  open(repair?: BuildRepair): void
  destroy(): void
}

export function mountBuildPanel(
  container: HTMLElement,
  options: BuildPanelOptions,
): BuildPanelHandle {
  container.hidden = true
  const root = createReactRoot(container)
  let openCount = 0

  const render = (repair?: BuildRepair): void => {
    openCount += 1
    root.render(
      <BuildPanel
        {...options}
        key={openCount}
        {...(repair === undefined ? {} : { repair })}
      />,
    )
  }

  render()

  return {
    show() {
      container.hidden = false
    },
    hide() {
      container.hidden = true
    },
    open(repair?: BuildRepair) {
      render(repair)
      container.hidden = false
    },
    destroy() {
      container.remove()
    },
  }
}

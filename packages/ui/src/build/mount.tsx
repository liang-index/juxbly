import type { BrowserAdapter } from '@juxbly/browser'
import type { PageAnalysis } from '@juxbly/core'
import type { BallEvent } from '../floating-ball/ball-state'
import type { HighlightQuery } from '../highlight/highlight-layer'
import { mountReactRoot } from '../mount'
import { BuildPanel } from './BuildPanel'
import type { CandidateScorer } from './build-session'

/**
 * The one place the build panel is mounted — `docs/ARCHITECTURE.md` §4: mounting lives in
 * `packages/ui`, the content script only prepares the shadow host and hands over the
 * adapter.
 *
 * Visibility is the container's `hidden` attribute rather than a React prop, because
 * hiding the panel must not unmount it: Esc and the shortcut mean "collapse without losing
 * anything" (UI_SPEC §8), and unmounting would throw away the conversation and the draft.
 */
export interface BuildPanelOptions {
  adapter: BrowserAdapter
  analyze: () => PageAnalysis
  query: HighlightQuery
  root: EventTarget
  scorer: CandidateScorer
  ball?: { send(event: BallEvent): void }
  onClose?: () => void
  onSaved?: () => void
}

export interface BuildPanelHandle {
  show(): void
  hide(): void
  destroy(): void
}

export function mountBuildPanel(
  container: HTMLElement,
  options: BuildPanelOptions,
): BuildPanelHandle {
  container.hidden = true
  mountReactRoot(container, <BuildPanel {...options} />)

  return {
    show() {
      container.hidden = false
    },
    hide() {
      container.hidden = true
    },
    destroy() {
      container.remove()
    },
  }
}

import type { BrowserAdapter } from '@juxbly/browser'
import type { RunOutcome } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import type { BuildRepair } from '../build/BuildPanel'
import { mountReactRoot } from '../mount'
import { RunPanel } from './RunPanel'
import type { RunStepOptions } from './run-session'

/**
 * The one place the run panel is mounted — `docs/ARCHITECTURE.md` §4.
 *
 * Visibility is the container's `hidden` attribute, not a React prop: hiding must not
 * unmount, because Esc and the shortcut mean "collapse to the ball without losing the
 * result" (UI_SPEC §8).
 *
 * `mountPoint()` is how the render capability finds its way in: the engine asks
 * `RuntimePorts.dom.mountPoint()` for the element to draw into, and that element lives
 * inside this panel's Shadow DOM subtree.
 */
export interface RunPanelOptions {
  adapter: BrowserAdapter
  url: string
  run(tool: ToolDefinition, options: RunStepOptions): Promise<RunOutcome>
  /** Fired with the matching tools once the query returns — the host decides visibility. */
  onTools?(tools: readonly ToolDefinition[]): void
  onClose?(): void
  onNewTool?(): void
  /**
   * Opens the build flow over an existing tool (stage 1-12). The panel builds the repair —
   * preset context message for a breakage, none for a rework — and hands it up; the host
   * owns the composer surface.
   */
  onRepair?(repair: BuildRepair): void
  onDiscarded?(): void
}

export interface RunPanelHandle {
  show(): void
  hide(): void
  /** The element the render capability draws into; null until the panel has mounted. */
  mountPoint(): HTMLElement | null
  destroy(): void
}

export function mountRunPanel(container: HTMLElement, options: RunPanelOptions): RunPanelHandle {
  let element: HTMLElement | null = null
  container.hidden = true

  mountReactRoot(
    container,
    <RunPanel
      adapter={options.adapter}
      url={options.url}
      run={options.run}
      onMountPoint={(next) => {
        element = next
      }}
      {...(options.onTools === undefined ? {} : { onTools: options.onTools })}
      {...(options.onClose === undefined ? {} : { onClose: options.onClose })}
      {...(options.onNewTool === undefined ? {} : { onNewTool: options.onNewTool })}
      {...(options.onRepair === undefined ? {} : { onRepair: options.onRepair })}
      {...(options.onDiscarded === undefined ? {} : { onDiscarded: options.onDiscarded })}
    />,
  )

  return {
    show() {
      container.hidden = false
    },
    hide() {
      container.hidden = true
    },
    mountPoint() {
      return element
    },
    destroy() {
      container.remove()
    },
  }
}

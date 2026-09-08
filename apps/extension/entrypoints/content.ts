import { createChromeAdapter } from '@juxbly/browser'
import { createLogger } from '@juxbly/core'
import type { DomPort, LlmPort, RuntimePorts } from '@juxbly/core'
import { analyzePage } from '@juxbly/analyzer'
import {
  candidateFingerprint,
  evaluateCandidates,
  queryAll,
  registerBuiltInCapabilities,
} from '@juxbly/capabilities'
import { CapabilityRegistry, ToolRuntime, ZERO_USAGE } from '@juxbly/runtime'
import { computeSnapPosition, mountBuildPanel, mountFloatingBall, mountRunPanel } from '@juxbly/ui'
import type { CandidateScorer, FloatingBallHandle, RunPanelHandle } from '@juxbly/ui'
// The stylesheets come in by relative path, not by a `@juxbly/ui/...` alias: the alias
// table does prefix matching, which cannot express a subpath import carrying Vite's
// `?inline` query — the shorter `@juxbly/ui` key would swallow it. Relative imports are
// handled natively by Vite. The shadow-DOM comment below explains why `?inline`.
import ballCss from '../../../packages/ui/src/floating-ball/styles.css?inline'
import buildCss from '../../../packages/ui/src/build/styles.css?inline'
import highlightCss from '../../../packages/ui/src/highlight/styles.css?inline'
import runCss from '../../../packages/ui/src/run/styles.css?inline'
import tokensCss from '../../../packages/ui/src/tokens.css?inline'
import { defineContentScript } from 'wxt/utils/define-content-script'

/**
 * Content script — mounts the floating ball inside the Shadow DOM host
 * (`docs/ARCHITECTURE.md` §7.1). Stage 0-3 mounted an empty, hidden host; stage 1-8
 * makes the ball live; stage 1-9 adds the build panel and the highlight layer; stage 1-10
 * adds the run panel and the run engine that drives it.
 *
 * This file must not touch `chrome.*`: the content script is the UI-side host, and
 * platform access goes through `BrowserAdapter` (`docs/ARCHITECTURE.md` §6.4.1). It is
 * also the UI-side holder of `ports.dom` (§6.1): the page's DOM is what the build flow
 * reads and what the highlight layer draws on, and only this context has it.
 */

const log = createLogger('RUNTIME')

const HOST_ID = 'juxbly-root'
const BALL_HEIGHT = 76
const BALL_Z_INDEX = 600

export default defineContentScript({
  // Matches `host_permissions: ['<all_urls>']`. A tool must be able to reappear on any
  // page the user saved it for, so this is deliberately not a list of known domains.
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    // Only the top-level document. Iframes would otherwise mount a host each.
    if (window.top !== window) return

    void mountBall()
  },
})

/**
 * Whether the ball should exist on this page at all. Settings are **asked for, never
 * read**: `juxbly:settings` holds the BYOK key, which must not enter the page context
 * (`docs/ARCHITECTURE.md` §12) — the background answers with the public subset only.
 */
async function fetchBallEnabled(adapter: ReturnType<typeof createChromeAdapter>): Promise<boolean> {
  try {
    const result = await adapter.messaging.send({ kind: 'settings:get' })
    // Unconfigured (null reply) defaults to on: the ball is the product's only
    // always-visible anchor.
    if (result?.kind !== 'settings:get_result') return true
    return result.floating_ball_enabled
  } catch (error: unknown) {
    // The service worker may not be reachable yet (cold start, restricted page).
    log.info('settings lookup unavailable, defaulting ball on', error)
    return true
  }
}

/** Whether this page has saved tools — the one-shot pulse condition (§6 idle dichotomy). */
async function fetchHasSavedTools(
  adapter: ReturnType<typeof createChromeAdapter>,
): Promise<boolean> {
  try {
    const result = await adapter.messaging.send({ kind: 'run:query_tools', url: location.href })
    if (result?.kind !== 'run:query_tools_result') return false
    return result.tools.length > 0
  } catch (error: unknown) {
    log.info('tool lookup unavailable, skipping pulse', error)
    return false
  }
}

async function mountBall(): Promise<void> {
  const adapter = createChromeAdapter()

  const [enabled, hasSavedTools] = await Promise.all([
    fetchBallEnabled(adapter),
    fetchHasSavedTools(adapter),
  ])

  if (!enabled) {
    // Toolbar entry remains available (options toggle belongs to 1-13).
    log.info('floating ball disabled in settings, not mounting')
    return
  }

  const shadow = mountHost()
  const ballMount = document.createElement('div')
  const panelMount = document.createElement('div')
  const runMount = document.createElement('div')
  shadow.append(panelMount, runMount, ballMount)

  // The panels are created before the ball because the ball is what opens them; the ball
  // handle reaches the panels through this holder, since they are mounted first.
  const ballHolder: { current: FloatingBallHandle | null } = { current: null }
  // The run panel is remounted after a save: the tool list it queried at page load does
  // not contain the tool that was just created.
  const runHolder: { current: RunPanelHandle | null } = { current: null }
  let hasRunTools = false

  const collapseToBall = (): void => {
    ballHolder.current?.send({ kind: 'close' })
  }

  const panel = mountBuildPanel(panelMount, {
    adapter,
    analyze: () => analyzePage(document),
    query: pageQuery,
    root: document,
    scorer: createCandidateScorer(createPageDomPort()),
    ball: {
      send: (event) => ballHolder.current?.send(event),
    },
    onClose: () => {
      panel.hide()
      // Esc collapses to the ball in every state (§8); the panel keeps its state.
      collapseToBall()
    },
    onSaved: () => {
      panel.hide()
      mountRun()
    },
  })

  function mountRun(): void {
    runHolder.current?.destroy()
    const runtime = createRuntime(adapter, () => {
      // Asked for at render time, not captured: the panel owns the element and can be
      // remounted, and a stale element would render results into a detached node.
      const point = runHolder.current?.mountPoint() ?? null
      if (point === null) throw new Error('run panel is not mounted yet')
      return point
    })

    runHolder.current = mountRunPanel(runMount, {
      adapter,
      url: window.location.href,
      run: (tool, options) => runtime.run(tool, options),
      onTools: (tools) => {
        hasRunTools = tools.length > 0
        // Auto-invoke: a matching page opens the tool without being asked (§9.2).
        if (hasRunTools) runHolder.current?.show()
      },
      onClose: () => {
        runHolder.current?.hide()
        collapseToBall()
      },
      onNewTool: () => {
        runHolder.current?.hide()
        panel.show()
      },
      onDiscarded: () => {
        // The tool is gone: back to the ball, and the shortcut opens the composer again.
        hasRunTools = false
        runHolder.current?.hide()
        collapseToBall()
      },
    })
  }

  mountRun()

  ballHolder.current = mountFloatingBall(ballMount, {
    adapter,
    hasSavedTools,
    onToggle: (open) => {
      if (!open) {
        panel.hide()
        runHolder.current?.hide()
        return
      }
      // With a tool for this page the shortcut opens the tool; without one it opens the
      // composer. Two surfaces, one shortcut, never both at once.
      if (hasRunTools) {
        runHolder.current?.show()
        return
      }
      panel.show()
    },
  })
}

function mountHost(): ShadowRoot {
  const staleHost = document.getElementById(HOST_ID)
  if (staleHost) {
    log.warn('host already present, replacing it')
    staleHost.remove()
  }

  const host = document.createElement('div')
  host.id = HOST_ID
  // The ball is positioned once here; it never scrolls with the page (MANUAL 1-8 #9:
  // edge snapping must survive zooming and scrolling — hence fixed, not absolute).
  host.style.position = 'fixed'
  host.style.top = `${computeSnapPosition(window.innerHeight, BALL_HEIGHT).top}px`
  host.style.right = '0'
  host.style.zIndex = String(BALL_Z_INDEX)

  const shadow = host.attachShadow({ mode: 'open' })

  // Styles live inside the shadow root only — both directions of isolation (UI_SPEC
  // §11.1): the host page never sees these rules, these rules never see host styles.
  for (const css of [tokensCss, ballCss, buildCss, runCss, highlightCss]) {
    const style = document.createElement('style')
    style.textContent = css
    shadow.append(style)
  }

  document.documentElement.append(host)
  return shadow
}

/**
 * The DOM read this context offers to the rest of the system — `DomPort` (§6.1), backed
 * by the same traversal the `extract` capability uses, so a candidate scored here reads
 * the page exactly the way the saved tool will later.
 *
 * No scrolling and no mount point: the build flow's dry run is deliberately read-only
 * (§5.6), and rendering into the page is the run panel's concern (1-10).
 */
function createPageDomPort(): DomPort {
  return {
    query: (selector, scope) => queryAll(scope ?? document, selector),
    mountPoint: () => {
      throw new Error('build flow must not mount anything into the page')
    },
    scrollToBottom: async () => false,
  }
}

/** The candidate scorer the panel drives: model proposes, the page decides (§5.6). */
function createCandidateScorer(dom: DomPort): CandidateScorer {
  return {
    score: (candidates) => evaluateCandidates(candidates, dom),
    fingerprint: candidateFingerprint,
  }
}

/** The one query the highlight layer, the panels and the extract capability draw from. */
function pageQuery(selector: string, scope?: Element): Element[] {
  return queryAll(scope ?? document, selector)
}

/**
 * The run engine, assembled here and nowhere else.
 *
 * The registry is filled by `registerBuiltInCapabilities` — which capabilities exist is
 * the capabilities package's answer (§6.2), and the engine only ever dispatches on
 * `step.type`. The ports are this context's: the DOM is the page's, model calls go to the
 * background because the key lives there (§7.1), and the mount point is the run panel's
 * Shadow DOM container.
 */
function createRuntime(
  adapter: ReturnType<typeof createChromeAdapter>,
  mountPointOf: () => HTMLElement,
): ToolRuntime {
  const registry = new CapabilityRegistry()
  registerBuiltInCapabilities(registry)
  return new ToolRuntime(registry, createRunPorts(adapter, mountPointOf))
}

function createRunPorts(
  adapter: ReturnType<typeof createChromeAdapter>,
  mountPointOf: () => HTMLElement,
): RuntimePorts {
  return {
    dom: {
      query: pageQuery,
      mountPoint: mountPointOf,
      // A1: lazy-loading lists only exist once the page has been scrolled.
      scrollToBottom: async () => {
        const before = document.documentElement.scrollHeight
        window.scrollTo(0, before)
        await new Promise((resolve) => setTimeout(resolve, 0))
        return document.documentElement.scrollHeight > before
      },
    },
    llm: createRunLlmPort(adapter),
    clipboard: adapter.clipboard,
    downloads: createContentDownloadsPort(adapter),
    log: (event) => log.info(event.message, ...(event.details ?? [])),
  }
}

/**
 * The downloads port, wired for the content-script context (stage 1-15, AC4).
 *
 * `downloads` is unavailable here, so a capability that asks to download is not
 * handed the platform adapter — it is handed a relay that messages the background. The
 * background owns the real platform `downloads` call (§7.1); this side only ever sends
 * `export:download_csv` / `export:download_json` and turns a refused reply into a throw,
 * so "not delivered" never reads as "delivered".
 */
function createContentDownloadsPort(adapter: ReturnType<typeof createChromeAdapter>) {
  return {
    async download(filename: string, content: string, mime: string): Promise<void> {
      const message =
        mime === 'application/json'
          ? ({ kind: 'export:download_json', filename, json: content } as const)
          : ({ kind: 'export:download_csv', filename, csv: content } as const)

      const reply = await adapter.messaging.send(message)
      if (reply === null || reply.kind !== 'export:download_result' || !reply.ok) {
        const reason =
          reply !== null && reply.kind === 'export:download_result' ? reply.error : 'NO_REPLY'
        throw new Error(reason ?? 'NO_REPLY')
      }
    },
  }
}

/**
 * The llm port — §6.1. The content script has no key and no endpoint, so a step's model
 * call crosses to the background and comes back with output and spend. Zero usage is the
 * honest number when the background reports none.
 */
function createRunLlmPort(adapter: ReturnType<typeof createChromeAdapter>): LlmPort {
  return {
    async call(step, input) {
      const reply = await adapter.messaging.send({
        kind: 'run:llm',
        requestId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        step,
        input,
      })

      if (reply === null || reply.kind !== 'run:llm_result' || !reply.ok) {
        const reason = reply !== null && reply.kind === 'run:llm_result' ? reply.error : 'NO_REPLY'
        throw new Error(reason ?? 'NO_REPLY')
      }

      return { output: reply.output, usage: reply.usage ?? { ...ZERO_USAGE } }
    },
  }
}

import { createChromeAdapter } from '@juxbly/browser'
import { createLogger } from '@juxbly/core'
import { computeSnapPosition, mountFloatingBall } from '@juxbly/ui'
// The stylesheets come in by relative path, not by a `@juxbly/ui/...` alias: the alias
// table does prefix matching, which cannot express a subpath import carrying Vite's
// `?inline` query — the shorter `@juxbly/ui` key would swallow it. Relative imports are
// handled natively by Vite. The shadow-DOM comment below explains why `?inline`.
import ballCss from '../../../packages/ui/src/floating-ball/styles.css?inline'
import tokensCss from '../../../packages/ui/src/tokens.css?inline'
import { defineContentScript } from 'wxt/utils/define-content-script'

/**
 * Content script — mounts the floating ball inside the Shadow DOM host
 * (`docs/ARCHITECTURE.md` §7.1). Stage 0-3 mounted an empty, hidden host; stage 1-8
 * makes the ball live.
 *
 * This file must not touch `chrome.*`: the content script is the UI-side host, and
 * platform access goes through `BrowserAdapter` (`docs/ARCHITECTURE.md` §6.4.1).
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
  const mountPoint = document.createElement('div')
  shadow.append(mountPoint)

  mountFloatingBall(mountPoint, { adapter, hasSavedTools })
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
  for (const css of [tokensCss, ballCss]) {
    const style = document.createElement('style')
    style.textContent = css
    shadow.append(style)
  }

  document.documentElement.append(host)
  return shadow
}

import { createLogger } from '@juxbly/core'
import { defineContentScript } from 'wxt/utils/define-content-script'

/**
 * Content script — mounts the Shadow DOM host that `packages/ui` will render into
 * (stage 1-8). Stage 0-3 mounts an empty, hidden host and nothing else.
 *
 * This file must not touch `chrome.*`: the content script is the UI-side host, and
 * platform access goes through `BrowserAdapter` (`docs/ARCHITECTURE.md` §6.4.1).
 */

const log = createLogger('RUNTIME')

const HOST_ID = 'juxbly-root'

export default defineContentScript({
  // Matches `host_permissions: ['<all_urls>']`. A tool must be able to reappear on any
  // page the user saved it for, so this is deliberately not a list of known domains.
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main() {
    // Only the top-level document. Iframes would otherwise mount a host each.
    if (window.top !== window) return

    mountHost()
  },
})

function mountHost(): void {
  const staleHost = document.getElementById(HOST_ID)
  if (staleHost) {
    log.warn('host already present, replacing it')
    staleHost.remove()
  }

  const host = document.createElement('div')
  host.id = HOST_ID
  // Hidden until stage 1-8 renders actual UI and positions the host itself.
  host.style.display = 'none'

  const shadow = host.attachShadow({ mode: 'open' })
  // An empty shadow root is not enough for some bundlers to keep the subtree, and it
  // gives 1-8 an explicit node to mount into.
  const placeholder = document.createElement('div')
  placeholder.dataset.juxblyPlaceholder = 'true'
  shadow.append(placeholder)

  document.documentElement.append(host)
}

import { createChromeAdapter } from '@juxbly/browser'
import { Popup, createOverviewPorts } from '@juxbly/ui'
import type { ReactNode } from 'react'

/**
 * The toolbar popup — stage 1-13 replaces the 0-3 placeholder.
 *
 * The popup never reads storage itself: the overview rows and the tab switch both go
 * through the background (`docs/ARCHITECTURE.md` §7.1 / §7.2). The ports object is built
 * here, at the entrypoint, so the component stays a render of its props and the tests
 * hand in a fake instead of a messaging channel.
 */

const HELP_URL = 'https://github.com/liang-index/juxbly#readme'

/**
 * Relative, so it resolves against the popup's own `chrome-extension://<id>/` origin —
 * the overview's settings entry needs no platform API to exist (§6.4).
 */
const SETTINGS_URL = 'options.html'

export function App(): ReactNode {
  return (
    <Popup
      ports={createOverviewPorts(createChromeAdapter())}
      helpUrl={HELP_URL}
      settingsUrl={SETTINGS_URL}
    />
  )
}

// Relative path, `?inline`-free: a popup is its own page, so the stylesheet goes in as a
// normal import (the shadow-root indirection content.ts needs does not apply here).
// Four levels up: this file sits one directory deeper than content.ts.
import '../../../../packages/ui/src/tokens.css'
import '../../../../packages/ui/src/popup/styles.css'
import { mountReactRoot } from '@juxbly/ui'
import { App } from './App'

const container = document.getElementById('juxbly-popup-root')

if (!container) {
  // Broken entry point, not a runtime state: fail loudly instead of rendering nowhere.
  throw new Error('Popup root container #juxbly-popup-root is missing from index.html')
}

mountReactRoot(container, <App />)

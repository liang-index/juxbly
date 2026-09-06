import { mountReactRoot } from '@juxbly/ui'
import { App } from './App'

const container = document.getElementById('juxbly-popup-root')

if (!container) {
  // Broken entry point, not a runtime state: fail loudly instead of rendering nowhere.
  throw new Error('Popup root container #juxbly-popup-root is missing from index.html')
}

mountReactRoot(container, <App />)

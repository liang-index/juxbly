import { mountReactRoot } from '@juxbly/ui'
import { App } from './App'

const container = document.getElementById('juxbly-options-root')

if (!container) {
  throw new Error('Options root container #juxbly-options-root is missing from index.html')
}

mountReactRoot(container, <App />)

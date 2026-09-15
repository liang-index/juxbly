// Same reasoning as the popup: a page, not a shadow root, so the stylesheets import
// directly and the token definitions come first. Four levels up: this file sits one
// directory deeper than content.ts.
import '../../../../packages/ui/src/tokens.css'
import '../../../../packages/ui/src/options/styles.css'
import { mountReactRoot } from '@juxbly/ui'
import { App } from './App'

const container = document.getElementById('juxbly-options-root')

if (!container) {
  throw new Error('Options root container #juxbly-options-root is missing from index.html')
}

mountReactRoot(container, <App />)

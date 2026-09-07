/**
 * `analyzePage()` — the input to the build flow (`docs/ARCHITECTURE.md` §9.1).
 *
 * Contract: `PageAnalysis` in §5.5, which is also the type this returns. Nothing here
 * decides anything: the analyzer produces the material the model and the local scorer
 * work from, and it makes no model call of its own (§4).
 *
 * Three invariants worth protecting:
 *
 * - **No side effects.** The analyzer runs inside someone else's page. It reads the DOM
 *   and nothing else: no writes, no scrolling, no network, no script execution.
 * - **No page content in logs.** The visible text is page content; only its length and
 *   whether it was truncated may be logged.
 * - **Cheap before pretty.** Structure beats prose: when the budget runs out, the text is
 *   cut and the tag names, containers and shadow hosts stay intact.
 */
import type { PageAnalysis } from '@juxbly/core'
import { isElementNode } from './dom'
import { collectCustomElements } from './custom-elements'
import { collectNodes } from './shadow'
import { detectContainers, detectScrollHint } from './structure'
import { collectVisibleText, DEFAULT_MAX_CHARS, isInvisible } from './visible-text'

export interface AnalyzePageOptions {
  maxChars?: number
  now?: () => string
}

export function analyzePage(root: ParentNode, options: AnalyzePageOptions = {}): PageAnalysis {
  const walk = collectNodes(root, { skip: isInvisible })
  const elements = walk.nodes.filter(isElementNode)
  const text = collectVisibleText(walk.nodes, options.maxChars ?? DEFAULT_MAX_CHARS)

  return {
    url: documentUrl(root),
    title: documentTitle(root),
    visibleText: text.text,
    containers: detectContainers(elements),
    customElements: collectCustomElements(elements),
    shadowHosts: walk.shadowHosts,
    scrollHint: detectScrollHint(elements),
    // Either cap can stop the analysis short, and the caller has to be able to tell.
    truncated: walk.truncated || text.truncated,
    analyzedAt: (options.now ?? nowIso)(),
  }
}

function nowIso(): string {
  return new Date().toISOString()
}

function documentOf(root: ParentNode): Document | null {
  return root.nodeType === 9 ? (root as Document) : root.ownerDocument
}

/**
 * Empty string rather than a made-up URL: the analyzer may be handed a detached document
 * (a fixture, a playground page), and inventing a location would be worse than admitting
 * there is none.
 */
function documentUrl(root: ParentNode): string {
  return documentOf(root)?.URL ?? ''
}

function documentTitle(root: ParentNode): string {
  return documentOf(root)?.title ?? ''
}

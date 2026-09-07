/**
 * Document traversal that descends into **open** shadow roots.
 *
 * Why this module exists at all: M0 failed on YouTube and Reddit because the analyzer
 * only ever saw the light DOM, where those pages render almost nothing. The content of
 * the page the user is looking at lives inside web components, so a walk that stops at
 * `document.body` analyses the wrong document.
 *
 * Closed roots are not penetrated — `shadowRoot` is `null` for them by platform design,
 * so they are skipped rather than probed.
 *
 * Two caps make this safe on hostile pages: a node budget and a shadow depth limit. Both
 * set `truncated`, because "I stopped early" is information the caller must not lose.
 */
import type { ShadowHostInfo } from '@juxbly/core'
import { isElementNode, isTextNode, tagOf } from './dom'

export const DEFAULT_MAX_NODES = 20_000
export const DEFAULT_MAX_SHADOW_DEPTH = 6

const MAX_SUMMARY_TAGS = 12
const SUMMARY_SCAN_LIMIT = 60

export interface WalkOptions {
  maxNodes?: number
  maxShadowDepth?: number
  /** Prune this element and everything below it (hidden / non-content nodes). */
  skip?: (element: Element) => boolean
}

export interface WalkResult {
  /** Elements and text nodes in document order; a shadow interior sits at its host. */
  nodes: readonly Node[]
  shadowHosts: ShadowHostInfo[]
  /** True when a budget or a depth cap stopped the walk early. */
  truncated: boolean
}

interface WalkState {
  nodes: Node[]
  shadowHosts: ShadowHostInfo[]
  truncated: boolean
  maxNodes: number
  maxShadowDepth: number
  skip: ((element: Element) => boolean) | undefined
}

interface Frame {
  children: readonly Node[]
  index: number
  shadowDepth: number
}

export function collectNodes(root: ParentNode, options: WalkOptions = {}): WalkResult {
  const state: WalkState = {
    nodes: [],
    shadowHosts: [],
    truncated: false,
    maxNodes: options.maxNodes ?? DEFAULT_MAX_NODES,
    maxShadowDepth: options.maxShadowDepth ?? DEFAULT_MAX_SHADOW_DEPTH,
    skip: options.skip,
  }

  // Explicit stack instead of recursion: a pathological page can nest thousands of nodes
  // deep, and blowing the stack would take down the host page's content script.
  const stack: Frame[] = [frameOf(root, 0)]

  while (stack.length > 0) {
    const current = stack[stack.length - 1]
    if (current === undefined) break

    if (state.nodes.length >= state.maxNodes) {
      state.truncated = true
      break
    }

    if (current.index >= current.children.length) {
      stack.pop()
      continue
    }

    const node = current.children[current.index]
    current.index += 1
    if (node === undefined) continue

    if (isTextNode(node)) {
      state.nodes.push(node)
      continue
    }
    if (!isElementNode(node)) continue
    if (state.skip?.(node) === true) continue

    state.nodes.push(node)

    const shadow = node.shadowRoot
    if (shadow !== null) {
      state.shadowHosts.push({ hostTag: tagOf(node), innerSummary: summarizeShadow(shadow) })
      if (current.shadowDepth >= state.maxShadowDepth) {
        state.truncated = true
      } else {
        stack.push(frameOf(shadow, current.shadowDepth + 1))
      }
    }

    // Cross-origin frames are unreadable by definition; same-origin ones are a different
    // document with its own analysis. Neither belongs in this walk.
    if (tagOf(node) === 'iframe') continue

    // Pushed after the shadow frame so the stack processes the shadow interior first:
    // that is the order the user sees.
    stack.push(frameOf(node, current.shadowDepth))
  }

  return { nodes: state.nodes, shadowHosts: state.shadowHosts, truncated: state.truncated }
}

function frameOf(parent: ParentNode, shadowDepth: number): Frame {
  return { children: Array.from(parent.childNodes), index: 0, shadowDepth }
}

/**
 * A compact description of what is inside a shadow root: tag names and a node count.
 *
 * Deliberately not the text. The summary is what tells the model "there is a card here
 * with a title and a price", which is the signal that makes it pick the right container;
 * pasting the content in as well would only spend budget twice.
 */
function summarizeShadow(root: ShadowRoot): string {
  const descendants = Array.from(root.querySelectorAll('*'))
  if (descendants.length === 0) return 'empty'

  const tags = [
    ...new Set(descendants.slice(0, SUMMARY_SCAN_LIMIT).map((element) => tagOf(element))),
  ]
  const listed = tags.slice(0, MAX_SUMMARY_TAGS)
  const overflow = tags.length > MAX_SUMMARY_TAGS ? ', ...' : ''

  return `${listed.join(', ')}${overflow} (${String(descendants.length)} nodes)`
}

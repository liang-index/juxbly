/**
 * Tiny DOM helpers shared by every analyzer module.
 *
 * They live here rather than in one of the analysis modules because all four of them
 * need the same answers to "what tag is this?" and "where is its parent, including
 * across a shadow boundary?" — and because `parentElement` stops at a shadow root,
 * which every caller would otherwise rediscover the hard way.
 */

/** `NODE.ELEMENT_NODE` / `NODE.TEXT_NODE`, spelled out: the numbers say nothing. */
const ELEMENT_NODE = 1
const TEXT_NODE = 3

export function isElementNode(node: Node): node is Element {
  return node.nodeType === ELEMENT_NODE
}

export function isTextNode(node: Node): node is Text {
  return node.nodeType === TEXT_NODE
}

export function tagOf(element: Element): string {
  return element.tagName.toLowerCase()
}

/**
 * The parent element, following a shadow root back to its host.
 *
 * `parentElement` is `null` for anything at the top of a shadow root; without the
 * fallback, a tag path or a relative selector that crosses into (or out of) a web
 * component would simply stop one level short.
 */
export function parentElementOf(element: Element): Element | null {
  const parent = element.parentElement
  if (parent !== null) return parent

  const node = element.parentNode
  return node !== null && 'host' in node ? ((node as ShadowRoot).host ?? null) : null
}

/** Collapse every run of whitespace to a single space — whitespace is token budget. */
export function collapseText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

export function truncateText(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max)}...`
}

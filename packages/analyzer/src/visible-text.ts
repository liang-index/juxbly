/**
 * Simplified visible text — the largest and cheapest part of what the model sees.
 *
 * Two product constraints shape this file (`docs/PRODUCT.md` §4.3):
 *
 * 1. **The whole page is never sent.** Text is capped by a character budget, and the
 *    budget is spent on structure: headings, list items and table cells keep their
 *    markers, because those markers are what let a model propose a container.
 * 2. **What is not on the screen is not in the analysis.** Scripts, styles, hidden
 *    subtrees and `aria-hidden` content are dropped — they are noise at best and, for
 *    hidden SEO text, an outright trap.
 *
 * This module is pure: it reads nodes and returns a string. No DOM writes, no network,
 * no model call, and nothing here logs the text it produced.
 */
import { collapseText, isElementNode, isTextNode, tagOf } from './dom'

/** `docs/PRODUCT.md` §4.3: a page is never sent whole, so there is always a budget. */
export const DEFAULT_MAX_CHARS = 6_000

/** Never content, whatever a page puts in them. */
const SKIPPED_TAGS = new Set([
  'script',
  'style',
  'noscript',
  'template',
  'head',
  'link',
  'meta',
  'iframe',
  'object',
  'embed',
  'svg',
  'canvas',
])

/** Elements that start a new line. Inline elements deliberately stay on one line. */
const BLOCK_TAGS = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'dd',
  'details',
  'div',
  'dl',
  'dt',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'header',
  'hgroup',
  'hr',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'summary',
  'table',
  'ul',
])

const HEADING_LEVEL: Record<string, number> = {
  h1: 1,
  h2: 2,
  h3: 3,
  h4: 4,
  h5: 5,
  h6: 6,
}

/**
 * Zero-width characters and the soft hyphen: invisible on the page, pure token cost here.
 * Written as escapes because a literal one is impossible to see in a diff.
 */
const INVISIBLE_CHARACTERS = /\u00ad|\u200b|\u200c|\u200d|\u2060|\ufeff/g

export interface VisibleText {
  text: string
  truncated: boolean
}

/**
 * Whether an element — and therefore its whole subtree — is invisible to a reader.
 *
 * The attribute checks come first because they are free; the computed style is only
 * consulted when a window exists (a detached document has none) and catches the
 * class-driven `display: none` that the attributes miss.
 */
export function isInvisible(element: Element): boolean {
  if (SKIPPED_TAGS.has(tagOf(element))) return true
  if (element.hasAttribute('hidden')) return true
  if (element.getAttribute('aria-hidden') === 'true') return true

  const inline = element.getAttribute('style')
  if (inline !== null && /(^|;)\s*display\s*:\s*none/.test(inline)) return true

  const view = element.ownerDocument?.defaultView
  if (view !== undefined && view !== null) {
    const style = view.getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return true
  }

  return false
}

export function collectVisibleText(
  nodes: readonly Node[],
  maxChars: number = DEFAULT_MAX_CHARS,
): VisibleText {
  const chunks: string[] = []
  let pendingBreak = false

  const startLine = (marker: string): void => {
    if (chunks.length > 0) chunks.push('\n')
    pendingBreak = false
    if (marker !== '') chunks.push(marker)
  }

  const appendText = (value: string): void => {
    if (value === '') return

    if (pendingBreak) {
      chunks.push('\n')
      pendingBreak = false
    } else if (!endsWithWhitespace(chunks)) {
      chunks.push(' ')
    }
    chunks.push(value)
  }

  for (const node of nodes) {
    if (isTextNode(node)) {
      appendText(collapseText(node.data))
      const parent = node.parentElement
      if (parent !== null) {
        const tag = tagOf(parent)
        if (tag === 'td' || tag === 'th') chunks.push(' | ')
      }
      continue
    }

    if (!isElementNode(node)) continue

    const tag = tagOf(node)
    if (tag === 'br' || tag === 'tr') {
      startLine('')
      continue
    }
    if (tag === 'li') {
      startLine('- ')
      continue
    }
    const level = HEADING_LEVEL[tag]
    if (level !== undefined) {
      startLine(`${'#'.repeat(level)} `)
      continue
    }
    // Deferred, so an empty block element does not leave a blank line behind.
    if (BLOCK_TAGS.has(tag)) pendingBreak = true
  }

  const text = normalize(chunks.join(''))
  if (text.length > maxChars) {
    return { text: text.slice(0, maxChars), truncated: true }
  }
  return { text, truncated: false }
}

function endsWithWhitespace(chunks: readonly string[]): boolean {
  const last = chunks[chunks.length - 1]
  return last === undefined || last === '' || /\s$/.test(last)
}

function normalize(value: string): string {
  return value
    .replace(INVISIBLE_CHARACTERS, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ ?\n ?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

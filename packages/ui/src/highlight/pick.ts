/**
 * Point-select correction — the "no, that one" path of the build flow (§9.1 step 3).
 *
 * A user who clicks the wrong box does not want a selector editor; they want to point at
 * the right element. What makes that cheap is a property of the DSL rather than of this
 * file: an `extract` field selector is **relative to the container** (§5.2), so a selector
 * derived from one row reads the same field in every row. "Apply to all" is therefore not
 * a feature — it is what a relative selector already means.
 *
 * The selector is built from tag, first class token and `:nth-of-type`. It is deliberately
 * unglamorous: it must be *stable and explainable*, and a fancy selector that happens to
 * be unique today is neither. Health (1-11) and repair (1-12) are what deal with a page
 * that later changes; this file only has to produce something a human can read in the
 * inspector.
 */
import type { HighlightQuery } from './highlight-layer'

export function relativeSelector(element: Element, container: Element | null): string {
  const parts: string[] = []
  let node: Element | null = element

  while (node !== null && node !== container) {
    parts.unshift(describe(node))
    node = node.parentElement
  }

  return parts.join(' > ')
}

/**
 * The container a picked element belongs to, or `null` when the tool has none.
 *
 * `closest` first because it is the cheap and exact answer; the query fallback is for a
 * picked element inside a shadow root, which `closest` cannot reach from outside — in that
 * case the first container that *contains* the element wins.
 */
export function containerFor(
  element: Element,
  containerSelector: string | null,
  query: HighlightQuery,
): Element | null {
  if (containerSelector === null || containerSelector === '') return null

  const closest = element.closest(containerSelector)
  if (closest !== null) return closest

  return query(containerSelector).find((container) => container.contains(element)) ?? null
}

function describe(element: Element): string {
  const tag = element.tagName.toLowerCase()
  const className = firstUsableClass(element)
  return `${tag}${className}${nthOfType(element)}`
}

/**
 * The first class token that is safe to write into a selector.
 *
 * Hashed build artifacts are skipped on purpose: they are not names, they are output, and
 * a selector written against one expires the next time the site is bundled.
 */
function firstUsableClass(element: Element): string {
  for (const token of element.classList) {
    if (/^[A-Za-z_-][A-Za-z0-9_-]*$/.test(token)) return `.${token}`
  }
  return ''
}

function nthOfType(element: Element): string {
  const parent = element.parentElement
  if (parent === null) return ''

  const siblings = Array.from(parent.children).filter(
    (child) => child.tagName === element.tagName,
  )
  const index = siblings.indexOf(element)
  // Always emitted: a bare tag would match the first sibling of that type, which is the
  // exact ambiguity the correction is meant to remove.
  return `:nth-of-type(${index + 1})`
}

/**
 * Structural features: repeating-unit candidates, their field-level candidates, and the
 * infinite-scroll signal.
 *
 * Why the analyzer proposes containers at all: the M0 review's highest-priority problem
 * was the model proposing selectors that hit nothing. Proposing is a *generation*
 * problem, but picking is a *verification* problem — and verification is free, local and
 * exact. So this module hands the model a shortlist of containers that demonstrably
 * repeat, and 1-9 scores the resulting candidates against the real page (§5.6).
 *
 * Selector policy: **structure and stable attributes only.** A hashed class (CSS-in-JS
 * output) changes on the next deploy, so a selector built from one is guaranteed to
 * break. That is a known hard problem, not something to paper over by emitting one
 * anyway.
 */
import type { ContainerCandidate, FieldHint, PageAnalysis } from '@juxbly/core'
import { collapseText, parentElementOf, tagOf, truncateText } from './dom'

/** Below three hits a group is not a repeating unit, it is a coincidence. */
export const MIN_REPEAT = 3
export const MAX_CONTAINERS = 5
export const MAX_FIELD_HINTS = 8

const PATH_DEPTH = 3
const SELECTOR_DEPTH = 3
const FIELD_SCAN_LIMIT = 40
const SAMPLE_TEXT_LENGTH = 40

const LOAD_MORE_PATTERN = /load\s+more|show\s+more|see\s+more|more\s+results/i
const INFINITE_PATTERN = /infinite|sentinel|end-?of-?(?:list|page|results)|lazy-?load/i

/** A class name worth building a selector on: short, alphanumeric, no build hash. */
const STABLE_CLASS = /^[A-Za-z][A-Za-z0-9_-]{1,20}$/

/**
 * A build hash: a run of six or more alphanumerics containing a digit (`css-1x2y3z4`,
 * `jss123`). Conservative on purpose — mistaking a stable class for a hash costs a
 * slightly vaguer selector, while mistaking a hash for a stable class costs a selector
 * that breaks on the site's next deploy.
 */
const HASHED_CLASS = /(?=[0-9a-z]*[0-9])[0-9a-z]{6,}/i

interface SiblingGroup {
  tag: string
  items: readonly Element[]
}

interface RankedContainer {
  candidate: ContainerCandidate
  element: Element
  /** The whole group: one sibling is not enough to decide what swallows what. */
  items: readonly Element[]
  depth: number
}

interface FieldDescriptor {
  name: string
  selector: string
  sampleText: string
}

export function detectContainers(elements: readonly Element[]): ContainerCandidate[] {
  const ranked: RankedContainer[] = []

  for (const group of groupSiblings(elements)) {
    if (group.items.length < MIN_REPEAT) continue
    const first = group.items[0]
    if (first === undefined) continue

    const fields = collectFields(first)
    ranked.push({
      element: first,
      items: group.items,
      depth: depthOf(first),
      candidate: {
        tagPath: tagPath(first),
        hitCount: group.items.length,
        sampleFields: [...new Set(fields.map((field) => field.name))],
        fieldHints: fields.map<FieldHint>((field) => ({
          selector: field.selector,
          sampleText: field.sampleText,
        })),
      },
    })
  }

  // Equal hit counts are broken by depth: the outer element is the repeating unit, the
  // inner one is a part of it.
  ranked.sort(
    (left, right) =>
      right.candidate.hitCount - left.candidate.hitCount || left.depth - right.depth,
  )

  const accepted: RankedContainer[] = []
  for (const container of ranked) {
    // An accepted group that repeats at least as often and contains this element makes it
    // redundant: the container is the whole repeating unit, not one element inside it.
    const swallowed = accepted.some(
      (kept) =>
        kept.candidate.hitCount >= container.candidate.hitCount &&
        kept.items.some((item) => item.contains(container.element)),
    )
    if (swallowed) continue

    accepted.push(container)
    if (accepted.length >= MAX_CONTAINERS) break
  }

  return accepted.map((container) => container.candidate)
}

/**
 * Group elements by (parent, tag): "these elements are siblings of the same kind" is
 * what makes a repeating unit, and it is far more reliable than matching selectors —
 * two different lists of `li` share a tag path and are still two different lists.
 */
function groupSiblings(elements: readonly Element[]): SiblingGroup[] {
  const byParent = new Map<Element | null, Map<string, Element[]>>()
  const groups: SiblingGroup[] = []

  for (const element of elements) {
    const parent = parentElementOf(element)
    const tag = tagOf(element)

    let byTag = byParent.get(parent)
    if (byTag === undefined) {
      byTag = new Map<string, Element[]>()
      byParent.set(parent, byTag)
    }

    let items = byTag.get(tag)
    if (items === undefined) {
      items = []
      byTag.set(tag, items)
      groups.push({ tag, items })
    }
    items.push(element)
  }

  return groups
}

/**
 * Field-level candidates inside one container (S1).
 *
 * Measured on a 10-site sample, field selectors were the largest failure bucket — right
 * container, empty fields, 4 of 10 sites. Offering the model per-field candidates lifted
 * L0 correctness from 20% to 30% (`docs/benchmark/a4-escalation-spike-2026-09-04.md`),
 * which is the single largest measured improvement in the whole build flow.
 */
function collectFields(container: Element): FieldDescriptor[] {
  const fields: FieldDescriptor[] = []
  const seen = new Set<string>()

  // Leaves only: an element with children holds other fields' text as well, which would
  // put the same value under several selectors.
  // `querySelectorAll` does not pierce shadow roots. That is accepted: a selector that
  // crosses a shadow boundary cannot be used by the extract capability anyway (§6.1
  // `DomPort.query` works within the document and open roots), and the shadow interior is
  // already reported through `shadowHosts`.
  const candidates = Array.from(container.querySelectorAll('*')).slice(0, FIELD_SCAN_LIMIT)

  for (const element of candidates) {
    if (element.children.length > 0) continue

    const sampleText = collapseText(element.textContent ?? '')
    if (sampleText === '') continue

    const selector = relativeSelector(container, element)
    if (selector === '' || seen.has(selector)) continue
    seen.add(selector)

    fields.push({
      name: fieldName(element),
      selector,
      sampleText: truncateText(sampleText, SAMPLE_TEXT_LENGTH),
    })
    if (fields.length >= MAX_FIELD_HINTS) break
  }

  return fields
}

/**
 * The most semantic name available for a field. Attribute labels beat tag names because
 * "price" tells the model what the field means, while "span" only tells it what it is.
 */
function fieldName(element: Element): string {
  for (const attribute of ['aria-label', 'itemprop', 'placeholder', 'alt', 'title'] as const) {
    const value = element.getAttribute(attribute)
    if (value !== null && value.trim() !== '') return value.trim()
  }
  return tagOf(element)
}

/** A selector usable with `container.querySelectorAll(...)`, matching inside it. */
function relativeSelector(container: Element, target: Element): string {
  const chain: Element[] = []
  let current: Element | null = target

  while (current !== null && current !== container && chain.length < SELECTOR_DEPTH) {
    chain.unshift(current)
    current = parentElementOf(current)
  }

  if (chain.length === 0) return ''

  // Deeper than the cap: the tail still resolves (a path matches any descendant), and it
  // is the tail that distinguishes one field from another.
  return chain.map((element, index) => (index === chain.length - 1 ? decorate(element) : tagOf(element))).join('>')
}

function decorate(element: Element): string {
  const id = element.getAttribute('id')
  if (id !== null && /^[A-Za-z][\w-]*$/.test(id)) return `#${id}`

  const stable = stableClass(element)
  if (stable !== null) return `${tagOf(element)}.${stable}`

  // Two siblings of the same tag are different fields (table columns), so the position is
  // what separates them. A lone child needs no position: an index would only break when a
  // page adds one more element.
  const position = nthOfType(element)
  return position === null ? tagOf(element) : `${tagOf(element)}:nth-of-type(${String(position)})`
}

function stableClass(element: Element): string | null {
  for (const token of element.classList) {
    if (HASHED_CLASS.test(token)) continue
    if (STABLE_CLASS.test(token)) return token
  }
  return null
}

function nthOfType(element: Element): number | null {
  const parent = parentElementOf(element)
  if (parent === null) return null

  const sameTag = Array.from(parent.children).filter((sibling) => sibling.tagName === element.tagName)
  return sameTag.length > 1 ? sameTag.indexOf(element) + 1 : null
}

function depthOf(element: Element): number {
  let depth = 0
  let current: Element | null = element

  while (current !== null) {
    depth += 1
    current = parentElementOf(current)
  }

  return depth
}

/** Tag path with subscripts stripped, e.g. "div>ul>li" (§5.5). */
export function tagPath(element: Element, depth: number = PATH_DEPTH): string {
  const parts: string[] = []
  let current: Element | null = element

  while (current !== null && parts.length < depth) {
    parts.unshift(tagOf(current))
    current = parentElementOf(current)
  }

  return parts.join('>')
}

/**
 * Infinite-scroll / load-more signal (A1). **Detection only — this module never scrolls.**
 *
 * Scrolling is the extract capability's `pre_scroll` (1-5); what belongs here is the
 * signal that tells the build flow whether "20 of 500 items" is waiting below the fold.
 * `load_more` wins over `infinite` because an explicit control is a stronger, more
 * actionable statement about the page than a marker in the class name.
 */
export function detectScrollHint(elements: readonly Element[]): PageAnalysis['scrollHint'] {
  let infinite = false

  for (const element of elements) {
    if (isLoadMoreControl(element)) return 'load_more'
    if (!infinite && hasInfiniteMarker(element)) infinite = true
  }

  return infinite ? 'infinite' : 'none'
}

function isLoadMoreControl(element: Element): boolean {
  const tag = tagOf(element)
  const role = element.getAttribute('role')
  const type = element.getAttribute('type') ?? ''

  const isControl =
    tag === 'button' ||
    tag === 'a' ||
    role === 'button' ||
    (tag === 'input' && type.toLowerCase() === 'button')
  if (!isControl) return false

  const label = `${element.getAttribute('aria-label') ?? ''} ${collapseText(element.textContent ?? '')}`
  return LOAD_MORE_PATTERN.test(label)
}

function hasInfiniteMarker(element: Element): boolean {
  const id = element.getAttribute('id') ?? ''
  const className = element.getAttribute('class') ?? ''
  return INFINITE_PATTERN.test(id) || INFINITE_PATTERN.test(className)
}

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
 * anyway. The hashed-class rule itself lives in `@juxbly/core` (`selector.ts`), shared
 * with the DSL validator so the two cannot drift apart.
 */
import { isHashedClassToken, type ContainerCandidate, type FieldHint, type PageAnalysis } from '@juxbly/core'
import { collapseText, isElementNode, parentElementOf, tagOf, truncateText } from './dom'
import { collectNodes } from './shadow'

/** Below three hits a group is not a repeating unit, it is a coincidence. */
export const MIN_REPEAT = 3
export const MAX_CONTAINERS = 5
export const MAX_FIELD_HINTS = 12
/**
 * How many repeating items the field scan samples. One item is enough to guess and not
 * enough to be sure: a promoted slot, a "sponsored" badge or a first row that is really
 * a header do not belong to the pattern, and only sampling several items can tell them
 * apart from fields that genuinely belong to every item.
 */
export const MAX_SCAN_ITEMS = 5
/**
 * A field has to appear in at least this share of the sampled items to be offered. Three
 * of five, roughly: strict enough to drop the one-off, loose enough to survive a card
 * that simply has no price today.
 */
export const MIN_FIELD_PRESENCE = 0.4

const PATH_DEPTH = 3
const SELECTOR_DEPTH = 3
/**
 * Walk budget for one *item's* field scan. Every sampled item gets its own budget, so the
 * whole container costs `MAX_SCAN_ITEMS * FIELD_SCAN_NODE_BUDGET` at most — and the cost
 * is paid once per container, not once per element in the page.
 */
const FIELD_SCAN_NODE_BUDGET = 400
const SAMPLE_TEXT_LENGTH = 40

/** How many candidates one item may carry into the cross-item merge, before trimming. */
const MAX_FIELDS_PER_ITEM = 24
/** Above this, an element's whole text is a block of content, not one field's value. */
const FIELD_TEXT_MAX = 80

const LOAD_MORE_PATTERN = /load\s+more|show\s+more|see\s+more|more\s+results/i
const INFINITE_PATTERN = /infinite|sentinel|end-?of-?(?:list|page|results)|lazy-?load/i

/** A class name worth building a selector on: short, alphanumeric, no build hash. */
const STABLE_CLASS = /^[A-Za-z][A-Za-z0-9_-]{1,20}$/

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

/** A candidate while the scan is still running: the element is needed to drop duplicates. */
interface ScannedField extends FieldDescriptor {
  element: Element
}

export function detectContainers(elements: readonly Element[]): ContainerCandidate[] {
  const ranked: RankedContainer[] = []

  for (const group of groupSiblings(elements)) {
    if (group.items.length < MIN_REPEAT) continue
    const first = group.items[0]
    if (first === undefined) continue

    const fields = collectFields(group.items)
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
 *
 * The scan pierces open shadow roots — the same policy as the census walk and the extract
 * capability's `queryAll` (§6.1): a custom-element container (chromestatus, Reddit's
 * `shreddit-*`) keeps its content in its shadow interior, so a light-DOM scan would offer
 * the model a container whose fields can never be filled in. The generated relative
 * selectors are usable because `queryAll` searches the scope's own shadow root too.
 * Closed roots stay skipped (`shadowRoot` is `null` by platform design); the shared node
 * budget and depth cap keep the scan bounded on hostile pages.
 *
 * Two rules keep the list honest:
 *
 * - **Several items, not one.** A single item cannot distinguish "every card has this"
 *   from "this card happens to have this" — a promoted slot, a badge, a row that is
 *   really a header. Only fields present in most sampled items are offered
 *   (`MIN_FIELD_PRESENCE`).
 * - **No duplicate values.** An element wrapping other fields holds their text too, so a
 *   candidate whose value already appears under another accepted selector is dropped;
 *   the deeper of the two wins. A wrapper whose value is *different* — an `<a>` carrying
 *   `href` around a `<span>` carrying the title — is kept, because those are two fields,
 *   not two copies of one.
 */
export function collectFields(items: readonly Element[]): FieldDescriptor[] {
  const sampled = items.slice(0, MAX_SCAN_ITEMS)
  if (sampled.length === 0) return []

  /**
   * Presence counted per selector, in the order the first item yielded them: the order is
   * what survives the merge, and it is document order — which is roughly reading order.
   *
   * The whole selector string is the identity, not its tail: two items that reach the same
   * leaf by different routes produce two selectors, and keeping both costs one hint that
   * no longer resolves on every item. The requirement is that a hint has to work on the
   * page it was measured on, and a `span` that resolves through `h3>a` in three cards and
   * `div>span` in two is not one hint.
   */
  const order: string[] = []
  const bySelector = new Map<string, { hits: number; descriptor: FieldDescriptor }>()

  for (const item of sampled) {
    for (const field of fieldsInItem(item)) {
      const entry = bySelector.get(field.selector)
      if (entry === undefined) {
        bySelector.set(field.selector, { hits: 1, descriptor: field })
        order.push(field.selector)
        continue
      }
      entry.hits += 1
    }
  }

  const required = Math.ceil(sampled.length * MIN_FIELD_PRESENCE)
  const stable = order.filter((selector) => (bySelector.get(selector)?.hits ?? 0) >= required)

  return stable
    .slice(0, MAX_FIELD_HINTS)
    .map((selector) => bySelector.get(selector)?.descriptor)
    .filter((descriptor): descriptor is FieldDescriptor => descriptor !== undefined)
}

/**
 * One item's candidates, before the cross-item merge decides which of them are real.
 *
 * An element earns a place if it says something on its own: either text it holds
 * directly (a wrapper is not credited with its children's words) or a `href` / `src` of
 * its own, which is the only way a link or an image field can be offered at all — the
 * URL is in the attribute, never in the text.
 *
 * The scan pierces open shadow roots — the same policy as the census walk and the extract
 * capability's `queryAll` (§6.1): a custom-element container (chromestatus, Reddit's
 * `shreddit-*`) keeps its content in its shadow interior, so a light-DOM scan would offer
 * the model a container whose fields can never be filled in. The generated relative
 * selectors are usable because `queryAll` searches the scope's own shadow root too.
 * Closed roots stay skipped (`shadowRoot` is `null` by platform design); the per-item node
 * budget and depth cap keep the scan bounded on hostile pages.
 */
function fieldsInItem(container: Element): FieldDescriptor[] {
  const fields: ScannedField[] = []
  const seen = new Set<string>()

  // Light DOM first, then the item's own shadow root — the same order the extract
  // capability's `queryAll` answers (§6.1, the chromestatus shape). `collectNodes` only
  // descends into the shadow roots of *descendants*; a container that is itself a host
  // keeps its content in its own root, so that root is walked explicitly.
  const candidates = [
    ...collectNodes(container, { maxNodes: FIELD_SCAN_NODE_BUDGET }).nodes.filter(isElementNode),
    ...(container.shadowRoot !== null
      ? collectNodes(container.shadowRoot, { maxNodes: FIELD_SCAN_NODE_BUDGET }).nodes.filter(isElementNode)
      : []),
  ]

  for (const element of candidates) {
    const sampleText = truncateText(sampleValue(element), SAMPLE_TEXT_LENGTH)
    if (sampleText === '') continue

    const selector = relativeSelector(container, element)
    if (selector === '' || seen.has(selector)) continue

    const duplicate = fields.findIndex(
      (field) =>
        field.sampleText === sampleText &&
        (field.element.contains(element) || element.contains(field.element)),
    )
    if (duplicate >= 0) {
      // Same value, one wrapping the other: the inner one is the field, the outer one is
      // the box it sits in. Document order reaches the box first, so it is replaced here.
      const held = fields[duplicate]
      if (held !== undefined && held.element.contains(element)) fields[duplicate] = { element, name: fieldName(element), selector, sampleText }
      continue
    }

    seen.add(selector)
    fields.push({ element, name: fieldName(element), selector, sampleText })
    if (fields.length >= MAX_FIELDS_PER_ITEM) break
  }

  return fields.map(({ name, selector, sampleText }) => ({ name, selector, sampleText }))
}

/** What reading this element as one field would yield: its own words, or its URL. */
function sampleValue(element: Element): string {
  const own = collapseText(
    Array.from(element.childNodes)
      .filter((node) => node.nodeType === 3)
      .map((node) => node.nodeValue ?? '')
      .join(' '),
  )
  if (own !== '') return own

  // Which for `<a>` and `<img>` is normal, not empty: the value the extract step reads is
  // the attribute (`link` reads `href`, `image` reads `src`).
  const attribute = collapseText(element.getAttribute('href') ?? element.getAttribute('src') ?? '')
  if (attribute !== '') return attribute

  // Last resort: a wrapper whose words all sit in child elements is still one plausible
  // field when the whole thing is short. A long one is the item itself, and offering it
  // would hand the model back the card as a field.
  const whole = collapseText(element.textContent ?? '')
  return whole.length <= FIELD_TEXT_MAX ? whole : ''
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
    if (isHashedClassToken(token)) continue
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

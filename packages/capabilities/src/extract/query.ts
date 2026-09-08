/**
 * The query tool behind `extract` — `docs/ARCHITECTURE.md` §5.2 / §6.1.
 *
 * Two responsibilities, and only two:
 *
 * 1. **`queryAll` is the reference implementation of a shadow-piercing query.** The
 *    `DomPort` an extract run receives is supplied by the host (the content script), and
 *    hosts back `query` with this function; extract itself never walks the tree, it only
 *    ever calls the port (§6.1: capabilities depend on interfaces only — which is also
 *    why §5.6 `evaluateCandidates` takes a `DomPort` and not a document).
 *
 * 2. **`classifyQueryError` turns whatever the DOM threw into an `ExtractErrorCode`.**
 *    "invalid selector" and "the page went away" are different failures with different
 *    consequences for health (§10), so a capability must never let a raw `DOMException`
 *    escape.
 *
 * Sharing rules with `packages/analyzer/src/shadow.ts` (stage 1-2): open roots only,
 * the same depth cap, closed roots skipped rather than probed. The implementations differ
 * on purpose — the analyzer takes a census of every node, this module answers one
 * selector — so the two are not merged, but a change to either policy must be mirrored.
 */
import { CapabilityError } from '../errors'

/**
 * Same cap as the analyzer's `DEFAULT_MAX_SHADOW_DEPTH`. A page that nests shadow roots
 * deeper than this is either pathological or actively hostile; stopping keeps the query
 * bounded instead of hanging the host page.
 */
export const MAX_SHADOW_DEPTH = 6

/**
 * Queries `root` and every open shadow root below it — including `root`'s own, when root
 * is a shadow host — in a deterministic order: light-DOM matches in document order first,
 * then (when root is a host) the matches inside its own shadow root, then, for each host
 * in document order, the matches inside its shadow root.
 *
 * The order is part of the contract — "a selector matched several elements across a
 * shadow boundary" is resolved by this order, never by re-sorting downstream (§5.2 Edge
 * Cases). It is not strict document order (a shadow interior sits at its host), and
 * pretending otherwise would be slower without being more correct.
 *
 * Throws whatever the platform throws for an invalid selector; the caller classifies it.
 */
export function queryAll(root: ParentNode, selector: string): Element[] {
  return collect(root, selector, 0, [])
}

function collect(root: ParentNode, selector: string, depth: number, found: Element[]): Element[] {
  // Native `querySelectorAll` per root, not `matches` per node: the platform matches
  // pseudo-classes and combinators correctly and far faster than a JS walk would.
  for (const element of Array.from(root.querySelectorAll(selector))) found.push(element)

  if (depth >= MAX_SHADOW_DEPTH) return found

  // A scope that is itself a shadow host must have its own root searched. Found on
  // chromestatus: the repeating unit is a custom element whose *content* lives in its own
  // shadow root, so a relative field query against that container — the §5.2 shape — saw
  // nothing without this branch. The host is not its own descendant, so the loop below
  // never reaches it. Closed roots stay skipped (still `null` by platform design).
  if (root instanceof Element) {
    const own = root.shadowRoot
    if (own !== null) collect(own, selector, depth + 1, found)
  }

  for (const host of Array.from(root.querySelectorAll('*'))) {
    const shadow = host.shadowRoot
    // Closed roots are `null` by platform design; skipping is the only legal move.
    if (shadow === null) continue
    collect(shadow, selector, depth + 1, found)
  }

  return found
}

/**
 * Maps an exception from `DomPort.query` onto the §5.5 `ExtractErrorCode` union.
 *
 * The message deliberately names the failure, not the selector and not anything from the
 * page: a selector is generated from page text often enough that echoing it would leak
 * page content into logs (1-5 Security).
 */
export function classifyQueryError(error: unknown): CapabilityError {
  const name = error instanceof DOMException ? error.name : ''
  const message = error instanceof Error ? error.message : ''

  if (name === 'SyntaxError' || /valid selector|invalid selector/i.test(message)) {
    return new CapabilityError('SELECTOR_SYNTAX', 'a selector is not valid CSS')
  }
  return new CapabilityError('DOM_UNAVAILABLE', 'the page could not be read')
}

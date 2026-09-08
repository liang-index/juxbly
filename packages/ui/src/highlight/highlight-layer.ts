/**
 * Turning a proposal into boxes on the page — `docs/UI_SPEC.md` §7.5, ARCHITECTURE §9.1.
 *
 * The highlight is the confirmation step: the user does not read a plan, they see the
 * actual elements the tool would read, lit up on their own page. Everything here is
 * therefore about **truthfulness**:
 *
 * - A field that matched nothing gets no box. Silently highlighting a neighbour would be
 *   a lie about what the tool will extract.
 * - The boxes are positioned from `getBoundingClientRect()` and are re-measured whenever
 *   the page can have moved (scroll, resize): a box that drifts off its element is worse
 *   than no box.
 *
 * The query function is injected, not imported: the caller decides whether it is the real
 * shadow-piercing query of the content script or a test's.
 */
import type { ProposalField } from '../build/proposal'

/** One box. `rect` is viewport-relative, which is what `position: fixed` needs. */
export interface HighlightTarget {
  field: string
  selector: string
  rect: DOMRect
}

export type HighlightQuery = (selector: string, scope?: Element) => Element[]

/**
 * How many rows to light up. A page with 2000 matches would otherwise cover the viewport
 * in boxes — and the point is recognisable confirmation, not a census.
 */
export const MAX_HIGHLIGHT_ROWS = 6

export function collectHighlightTargets(
  fields: readonly ProposalField[],
  containerSelector: string | null,
  query: HighlightQuery,
): HighlightTarget[] {
  const targets: HighlightTarget[] = []
  // `null` scope means "the document": single mode has no container (§5.2).
  const containers = containerSelector === null ? [null] : query(containerSelector).slice(0, MAX_HIGHLIGHT_ROWS)

  for (const container of containers) {
    for (const field of fields) {
      const [element] = query(field.selector, container ?? undefined)
      if (element === undefined) continue
      targets.push({ field: field.field, selector: field.selector, rect: element.getBoundingClientRect() })
    }
  }

  return targets
}

/**
 * Re-measure: the same targets, at their current viewport positions.
 *
 * One field per *name*, not per box: in list mode a field appears once per container, and
 * re-collecting them all would multiply the boxes on every scroll tick.
 */
export function remeasureTargets(
  targets: readonly HighlightTarget[],
  containerSelector: string | null,
  query: HighlightQuery,
): HighlightTarget[] {
  const fields: Array<{ field: string; selector: string; type: 'text' }> = []
  const seen = new Set<string>()

  for (const target of targets) {
    if (seen.has(target.field)) continue
    seen.add(target.field)
    fields.push({ field: target.field, selector: target.selector, type: 'text' })
  }

  return collectHighlightTargets(fields, containerSelector, query)
}

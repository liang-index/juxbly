/**
 * How much of the page the model is shown — `docs/ARCHITECTURE.md` §9.1.
 *
 * Two views exist because one number says they are not equivalent: on the 50-case
 * corpus the model writes its own container selector instead of taking one of the
 * selectors the analyser offered, and `B-04` is the example that got expensive — the
 * model chose `div>div>a`, which hits 232 nodes, when the analyser's list was right
 * there in the same prompt.
 *
 * - `summary` — the shipped view: counts, selectors and the visible text, and the model
 *   writes CSS. It has to *notice* the list to use it.
 * - `flat` — the experiment: the same page as a numbered list, and a selector is written
 *   as a reference into that list (`@3`, `@1`). Choosing wrongly now means choosing an
 *   item from a menu, not composing a selector from memory.
 *
 * One view wins and the other is deleted: two permanent representations mean every
 * future prompt change has to be written twice.
 */
import type { PageAnalysis } from '@juxbly/core'

export type PageView = 'summary' | 'flat'

export const PAGE_VIEWS: readonly PageView[] = ['summary', 'flat']

/** How many containers and field hints the flat view lists: enough to choose, not to dump. */
const MAX_CONTAINERS = 12
const MAX_FIELDS = 8
const SAMPLE_CHARS = 120

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}

/** The shipped view. Counts, selectors, samples — and the page's own text. */
export function describeSummary(analysis: PageAnalysis): Record<string, unknown> {
  return {
    url: analysis.url,
    title: analysis.title,
    visibleText: analysis.visibleText,
    truncated: analysis.truncated,
    scrollHint: analysis.scrollHint,
    customElements: analysis.customElements,
    shadowHosts: analysis.shadowHosts,
    containers: analysis.containers.map((container) => ({
      tagPath: container.tagPath,
      hitCount: container.hitCount,
      sampleFields: container.sampleFields,
      fieldHints: container.fieldHints.map((hint) => ({
        selector: hint.selector,
        sampleText: hint.sampleText,
      })),
    })),
  }
}

/**
 * The experimental view: a numbered menu.
 *
 * Each container carries what the model needs to judge it without re-reading the page —
 * how many items it has, and what one of them looks like — and each field carries its
 * sample. Numbers, because a reference cannot be mistyped into a different selector the
 * way a CSS string can.
 */
export function describeFlat(analysis: PageAnalysis): Record<string, unknown> {
  return {
    url: analysis.url,
    title: analysis.title,
    visibleText: analysis.visibleText,
    truncated: analysis.truncated,
    scrollHint: analysis.scrollHint,
    customElements: analysis.customElements,
    containers: analysis.containers.slice(0, MAX_CONTAINERS).map((container, index) => ({
      index,
      tagPath: container.tagPath,
      hits: container.hitCount,
      sample: clip(container.fieldHints.map((hint) => hint.sampleText).join(' | '), SAMPLE_CHARS),
      fields: container.fieldHints.slice(0, MAX_FIELDS).map((hint, fieldIndex) => ({
        index: fieldIndex,
        selector: hint.selector,
        sample: clip(hint.sampleText, 60),
      })),
    })),
  }
}

export function describePage(analysis: PageAnalysis, view: PageView): Record<string, unknown> {
  return view === 'flat' ? describeFlat(analysis) : describeSummary(analysis)
}

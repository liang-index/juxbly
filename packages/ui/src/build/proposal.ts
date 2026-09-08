/**
 * What the panel puts on the page for confirmation — `docs/ARCHITECTURE.md` §9.1 step 3.
 *
 * A proposal is **one** tool definition plus the field list the highlight layer draws.
 * Nothing here decides whether the tool is good: `evaluateCandidates` did that (§5.6), and
 * the user does it now by looking at the boxes on their own page.
 *
 * Two helpers decide things the build flow needs and that are easy to get wrong:
 *
 * - `isDomHostile` — whether the page is a bad fit for the DOM route at all, which is the
 *   gate on the A3 visual fallback. It is a heuristic over the analysis, deliberately
 *   conservative: claiming hostility when the DOM route is fine would send screenshots of
 *   pages that never needed one.
 * - `applyFieldSelector` — the point-select correction. Because a field selector is
 *   **relative to the container** (§5.2), re-pointing one field on one row re-points it on
 *   every row. That is why "apply to all" is not a separate feature.
 */
import type { CandidateEvaluation, PageAnalysis } from '@juxbly/core'
import type { ExtractStep, FieldType, ToolDefinition } from '@juxbly/dsl'

/** One field of the proposal: what the user sees highlighted and can re-point. */
export interface ProposalField {
  field: string
  selector: string
  type: FieldType
}

export interface BuildProposal {
  tool: ToolDefinition
  fields: ProposalField[]
  /** Container selector of the extract step; `null` in single mode (§5.2). */
  containerSelector: string | null
  /** How the winning candidate scored. Absent only for a tool that was never scored. */
  evaluation: CandidateEvaluation | null
}

/** The `extract` step a proposal is about; `null` for a tool that has none. */
export function extractStepOf(tool: ToolDefinition): ExtractStep | null {
  for (const step of tool.steps) {
    if (step.type === 'extract') return step
  }
  return null
}

export function containerSelectorOf(tool: ToolDefinition): string | null {
  const step = extractStepOf(tool)
  if (step === null || step.mode !== 'list') return null
  return step.selector ?? null
}

export function proposalFields(tool: ToolDefinition): ProposalField[] {
  const step = extractStepOf(tool)
  if (step === null) return []

  return Object.entries(step.fields).map(([field, selector]) => ({
    field,
    selector,
    type: step.field_types?.[field] ?? 'text',
  }))
}

export function toProposal(
  tool: ToolDefinition,
  evaluation: CandidateEvaluation | null,
): BuildProposal {
  return {
    tool,
    fields: proposalFields(tool),
    containerSelector: containerSelectorOf(tool),
    evaluation,
  }
}

/**
 * Re-point one field. Returns a **new** definition: the confirmed proposal and the stored
 * tool must never share a mutable object, and the correction bumps `updated_at` because
 * the definition really did change.
 */
export function applyFieldSelector(
  tool: ToolDefinition,
  field: string,
  selector: string,
  at: string,
): ToolDefinition {
  const steps = tool.steps.map((step) => {
    if (step.type !== 'extract' || step.fields[field] === undefined) return step
    return { ...step, fields: { ...step.fields, [field]: selector } }
  })

  return { ...tool, steps, updated_at: at }
}

/**
 * Whether the page is a bad fit for the DOM route — the gate on A3.
 *
 * Two signals, both read from the analysis and neither of them a guess:
 *
 * - **No repeating structure.** `containers` is empty: there is nothing to point a
 *   container selector at, so no amount of selector repair will help.
 * - **Opaque selectors.** Every field hint the analyzer could produce is a hashed token
 *   (`div.x7f2a`, `#sc-1x2y3z`). Those names are generated per build; a selector written
 *   against them is a selector that expires.
 *
 * Shadow hosts and custom elements are **not** hostility: they are pierceable today
 * (§5.2) and were measured as such, so treating them as hostile would route pages to a
 * screenshot that the DOM route handles fine.
 */
export function isDomHostile(analysis: PageAnalysis): boolean {
  if (analysis.containers.length === 0) return true

  const hints = analysis.containers.flatMap((container) => container.fieldHints)
  if (hints.length === 0) return false

  return hints.every((hint) => looksHashed(hint.selector))
}

/**
 * A class or id that ends in a run of digits, or is a long low-entropy token, is a build
 * artifact rather than a name someone chose. `x7f2a`, `sc-1x2y3z`, `css-1dbjc4n`.
 */
export function looksHashed(selector: string): boolean {
  return /[.#][A-Za-z_-]*[0-9]{2,}/.test(selector) || /[.#][a-z0-9]{8,}$/.test(selector)
}

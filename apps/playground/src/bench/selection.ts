/**
 * Turning the model's candidates into the one tool a case actually runs.
 *
 * One function, used by both the live run and the replay — if the two paths picked
 * differently, a replay would be measuring a different experiment than the run it
 * claims to reproduce.
 *
 * Two rules, and the difference between them is the whole of the `bestof` experiment:
 *
 * - `first-valid` — the first candidate that passes §5.4. What the benchmark has always
 *   done, and what the product did before §5.6 existed.
 * - `best-scored` — every candidate is run as a dry run against the snapshot and the
 *   highest score wins. This is the product's own ranking (`evaluateCandidates` /
 *   `pickBestCandidate`, §5.6 — "the model proposes, the page decides"), applied where
 *   the benchmark used to take the first.
 *
 * Scoring is not allowed to invent a winner out of nothing: if every dry run throws, the
 * first valid candidate still runs. A candidate that cannot be scored is not a candidate
 * that scored zero.
 */
import { evaluateCandidates, pickBestCandidate } from '@juxbly/capabilities'
import type { DomPort, LlmPort } from '@juxbly/core'
import { validateToolDefinition, type ToolDefinition } from '@juxbly/dsl'
import { runTool, type Execution } from './execute'
import type { BenchVariant, SelectionRule } from './types'

export interface SelectedTool {
  tool: ToolDefinition | null
  rule: SelectionRule
  /** How many candidates the model offered, before any of them was judged. */
  candidateCount: number
  /** Why nothing was usable; absent when a tool was found. */
  error?: string
}

export interface RunSelected extends SelectedTool {
  /** `null` only when nothing was usable — there is no execution to report, not a zero. */
  execution: Execution | null
}

/** Candidates that pass §5.4; the errors say why the rest did not, in the model's order. */
function validCandidates(raw: readonly unknown[]): { valid: ToolDefinition[]; errors: string[] } {
  const valid: ToolDefinition[] = []
  const errors: string[] = []

  raw.forEach((candidate, index) => {
    if (typeof candidate !== 'object' || candidate === null) {
      errors.push(`${index}: not an object`)
      return
    }
    const checked = validateToolDefinition(candidate as ToolDefinition)
    if (checked.ok) valid.push(checked.value)
    else errors.push(`${index}: ${checked.errors.map((entry) => `${entry.path}: ${entry.message}`).join('; ')}`)
  })

  return { valid, errors }
}

export function selectTool(raw: readonly unknown[], dom: DomPort | null, variant: BenchVariant): SelectedTool {
  const { valid, errors } = validCandidates(raw)
  const candidateCount = raw.length

  if (valid.length === 0) {
    return {
      tool: null,
      rule: 'none',
      candidateCount,
      ...(errors.length === 0 ? {} : { error: errors.join(' | ') || 'NO_CANDIDATE' }),
    }
  }

  if (variant !== 'bestof' || dom === null) return { tool: valid[0] ?? null, rule: 'first-valid', candidateCount }

  const best = pickBestCandidate(evaluateCandidates(valid, dom))
  // Every dry run threw: nothing was scored, so the model's own order stands.
  if (best === null) return { tool: valid[0] ?? null, rule: 'first-valid', candidateCount }

  return { tool: valid[best.candidateIndex] ?? valid[0] ?? null, rule: 'best-scored', candidateCount }
}

export async function runSelected(
  raw: readonly unknown[],
  dom: DomPort,
  llmPort: LlmPort,
  variant: BenchVariant,
): Promise<RunSelected> {
  const selection = selectTool(raw, dom, variant)
  if (selection.tool === null) return { ...selection, execution: null }

  return { ...selection, execution: await runTool(selection.tool, dom, llmPort) }
}

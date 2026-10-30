/**
 * Round B — the closed-loop repair round (`docs/benchmark/field-menu-spike-2026-09-22.md`).
 *
 * Round A measured the mechanism, not the outcome: the model took 78% of its field
 * selectors from the offered menu, yet F1 moved less than the noise band. What the model
 * never sees is what its own selectors *did* — the chain is open. This module closes it:
 * after the selected tool's first execution, the first rows it actually pulled go back to
 * the model, which returns corrected candidates.
 *
 * One shared function for the live run and the replay. If the two applied different
 * adoption rules, a replay would be measuring a different experiment than the run it
 * claims to reproduce — the same reason `selection.ts` exists.
 *
 * The adoption rule is **GT-free on purpose**. Ground truth must never enter the loop:
 * a repair that "fixed" fields because the benchmark told it what the right answer is
 * would measure nothing. The rule is execution-shaped: the repaired tool replaces the
 * original only when it validates and runs cleanly and pulled at least one item.
 */
import type { DomPort, LlmPort } from '@juxbly/core'
import { validateToolDefinition, type ToolDefinition } from '@juxbly/dsl'
import { runTool, type Execution } from './execute'

export interface RepairOutcome {
  /** The tool the case should measure: the repaired one, or the original. */
  tool: ToolDefinition
  execution: Execution
  /** True when the repaired tool replaced the original. */
  adopted: boolean
  /** Why the repair was not adopted; absent on adoption. */
  reason?: 'no-candidates' | 'invalid' | 'execution-failed' | 'empty'
}

/**
 * Run the repaired candidates and apply the adoption rule against the original.
 *
 * The original's execution is passed in so the rule has both sides in front of it, and
 * so a replay pays the same two executions the live run paid.
 */
export async function applyRepair(
  repairedRaw: readonly unknown[],
  original: { tool: ToolDefinition; execution: Execution },
  dom: DomPort,
  llm: LlmPort,
): Promise<RepairOutcome> {
  let sawValid = false

  for (const candidate of repairedRaw) {
    const validated = validateToolDefinition(candidate as ToolDefinition)
    if (!validated.ok) continue
    sawValid = true

    const execution = await runTool(validated.value, dom, llm)
    if (execution.error !== undefined) continue
    if (execution.itemCount < 1) continue

    return { tool: validated.value, execution, adopted: true }
  }

  return {
    tool: original.tool,
    execution: original.execution,
    adopted: false,
    ...(repairedRaw.length === 0 ? { reason: 'no-candidates' as const } : sawValid ? { reason: 'execution-failed' as const } : { reason: 'invalid' as const }),
  }
}

/**
 * The dry-run rows the repair prompt shows, taken from the runtime's variable bag.
 *
 * Recognised by shape — the same rule `firstExtractLike` uses — because the DSL does
 * not enforce where an extract step parks its output. String cells are truncated so a
 * runaway value cannot blow the prompt; the caller's `describeDryRun` also caps rows.
 */
export function sampleRowsFromOutputs(
  outputs: Record<string, unknown>,
  maxRows = 3,
  maxCellLength = 200,
): Record<string, unknown>[] {
  for (const value of Object.values(outputs)) {
    if (typeof value !== 'object' || value === null || !('items' in value)) continue
    const items = (value as { items: unknown }).items
    if (!Array.isArray(items)) continue

    return items.slice(0, maxRows).map((item) => truncateRow(item, maxCellLength))
  }
  return []
}

function truncateRow(item: unknown, maxCellLength: number): Record<string, unknown> {
  if (typeof item !== 'object' || item === null) return { value: truncateCell(item, maxCellLength) }
  return Object.fromEntries(
    Object.entries(item as Record<string, unknown>).map(([name, value]) => [
      name,
      truncateCell(value, maxCellLength),
    ]),
  )
}

function truncateCell(value: unknown, maxCellLength: number): unknown {
  if (typeof value !== 'string') return value
  return value.length > maxCellLength ? `${value.slice(0, maxCellLength)}…` : value
}

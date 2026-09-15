/**
 * The runtime inspect tab's data — `task/stage-1-16.md` Scope 3.
 *
 * The trace the runtime already produces (`RunOutcome.steps`) is deliberately thin: a
 * step's index, type, row count, duration and the variable it wrote, and **no copy of
 * the data** (§5.5). This file is where that trace becomes something drawable — the
 * values are resolved from the variable bag at draw time, not stored beside it.
 *
 * Two limits, because a debug view that freezes the panel is worse than no debug view
 * (edge case: a large result set):
 *
 * - `MAX_PREVIEW_ROWS` — an array longer than this is drawn short, with a count.
 * - `MAX_PREVIEW_CHARS` — the JSON is cut, never the whole panel's worth of text.
 */
import type { RunStepTrace } from '@juxbly/core'
import type { ToolDefinition, ToolStep } from '@juxbly/dsl'

export const MAX_PREVIEW_ROWS = 5
export const MAX_PREVIEW_CHARS = 400

export interface StepView {
  index: number
  type: ToolStep['type']
  /** Rows the step was handed; `null` for `extract`, which reads the page (§5.2). */
  inputCount: number | null
  /** What the step was handed, already truncated. `null` means "the page itself". */
  input: string | null
  /** Rows left out of `input` — the panel says how many rather than silently cutting. */
  inputHidden: number
  /** What the step wrote. `null` for `render` and `export`, which consume (§5.2). */
  output: string | null
  outputHidden: number
  durationMs: number
  /** Whether the run reached this step at all — what "not reached" is drawn from. */
  ran: boolean
  cached: boolean
  error: string | null
}

/**
 * One line per step of the definition, in order.
 *
 * Steps the run never reached (a run that failed at step 2 of 4) are still listed, with
 * no input and no output: "not reached" is information, and a list that stops at the
 * failure would look like the definition stopped there too.
 */
export function stepViews(
  tool: ToolDefinition,
  trace: readonly RunStepTrace[] | null,
  outputs: Readonly<Record<string, unknown>> | null,
): StepView[] {
  return tool.steps.map((step, index) => viewOf(step, index, trace, outputs))
}

function viewOf(
  step: ToolStep,
  index: number,
  trace: readonly RunStepTrace[] | null,
  outputs: Readonly<Record<string, unknown>> | null,
): StepView {
  const run = trace?.find((entry) => entry.index === index) ?? null
  const outputTo = 'output_to' in step ? step.output_to : undefined
  const inputFrom = 'input_from' in step ? step.input_from : undefined

  const input = inputFrom === undefined ? undefined : outputs?.[inputFrom]
  const output = outputTo === undefined ? undefined : outputs?.[outputTo]

  return {
    index,
    type: step.type,
    inputCount: run?.inputCount ?? null,
    // A variable that was never written is `null`, not an empty string: "not reached"
    // and "produced nothing" are different answers (§7: blank areas say nothing).
    input: input === undefined ? null : preview(input),
    inputHidden: hiddenRows(input),
    output: output === undefined ? null : preview(output),
    outputHidden: hiddenRows(output),
    durationMs: run?.durationMs ?? 0,
    ran: run !== null,
    cached: run?.cached === true,
    error: run?.error?.message ?? null,
  }
}

/** A short, readable rendering of a value: JSON, cut to the two limits above. */
export function preview(value: unknown): string {
  if (value === undefined) return ''
  const text = renderValue(value)
  return text.length <= MAX_PREVIEW_CHARS ? text : `${text.slice(0, MAX_PREVIEW_CHARS)}…`
}

/** How many rows a value holds — `1` for anything that is not an array. */
export function rowCount(value: unknown): number {
  if (Array.isArray(value)) return value.length
  return value === undefined ? 0 : 1
}

/** Rows the preview dropped. Zero for anything but a long array. */
function hiddenRows(value: unknown): number {
  if (!Array.isArray(value)) return 0
  return Math.max(0, value.length - MAX_PREVIEW_ROWS)
}

function renderValue(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.slice(0, MAX_PREVIEW_ROWS))
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    // A cycle is not possible in a variable bag, but a value that will not serialise
    // must not take the debug view down with it.
    return ''
  }
}

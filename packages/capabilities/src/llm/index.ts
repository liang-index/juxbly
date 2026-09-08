/**
 * The `llm` capability — `docs/ARCHITECTURE.md` §5.2 / §6.1 / §6.3.
 *
 * The only capability that costs money, and the reason the run engine carries a cache
 * (1-7): this file does not decide *whether* the model is called, only *how*. Asking the
 * model again for data that has not changed is a bug, not a feature, and it is the
 * engine's hash comparison that keeps it from happening.
 *
 * It owns no endpoint, no key and no prompt: those live in `packages/llm` behind
 * `RuntimePorts.llm` (§6.1). What it adds on top of the port is the capability contract —
 * declared permissions, schemas and the one log line that makes the spend visible.
 */
import type { CapabilityDefinition, CapabilityInput, LlmPort, LlmStepOutput } from '@juxbly/core'
import type { LlmStep } from '@juxbly/dsl'

/** The port call, separated so a test can exercise it without a registry. */
export function runLlm(input: CapabilityInput<LlmStep>, llm: LlmPort): Promise<LlmStepOutput> {
  return llm.call(input.step, input.items)
}

export const llmCapability: CapabilityDefinition<CapabilityInput<LlmStep>, LlmStepOutput> = {
  type: 'llm',
  version: '1.0.0',
  inputSchema: {
    type: 'object',
    required: ['step', 'items'],
    properties: {
      step: { type: 'object', required: ['type', 'task', 'input_from', 'output_to'] },
      items: { type: 'array', items: { type: 'object' } },
    },
  },
  outputSchema: {
    type: 'object',
    required: ['output', 'usage'],
    properties: {
      output: {},
      usage: {
        type: 'object',
        required: ['prompt_tokens', 'completion_tokens'],
        properties: { prompt_tokens: { type: 'integer' }, completion_tokens: { type: 'integer' } },
      },
    },
  },
  // The model runs in the background context: this capability only asks for it.
  permissions: ['llm.call'],
  securityNotes:
    'Calls the model exclusively through RuntimePorts.llm, which resolves to the background context: no endpoint, no API key and no fetch in the page. The records it sends are page content, so they are passed through untouched and never logged — the log line carries the task and the token counts only. Cancellation belongs to the engine: the port is not handed the signal (ARCHITECTURE §6.1), so a cancelled run is abandoned by the caller, not by this capability.',

  async execute(input, ctx): Promise<LlmStepOutput> {
    let result: LlmStepOutput
    try {
      result = await runLlm(input, ctx.ports.llm)
    } catch (error) {
      // The port's own categories (§5.5) do not reach the panel: the engine's error model
      // has one tier for "the model step did not answer", and the panel's copy branches on
      // that. Folding happens *here*, at the one place that knows both vocabularies — a
      // host port (background relay) and a mock port both fail the same way, so neither
      // has to remember to attach a code. `ABORTED` keeps its meaning: a cancelled run is
      // not a failed one, and `run-session` restores the previous result instead.
      throw asStepFailure(error)
    }

    // Task and token counts, never the prompt or the output: both are page content.
    ctx.ports.log({
      tag: 'CAPABILITY',
      message: 'llm',
      details: [input.step.task, result.usage.prompt_tokens, result.usage.completion_tokens],
    })

    return result
  },
}

/**
 * `NOT_CONFIGURED` folds too, on purpose: "check your key and endpoint" is the right next
 * step for an unconfigured user as well, and 1-13's onboarding decides on flags and
 * settings, not on run errors — it needs no distinct code arriving through `RunOutcome`.
 */
function asStepFailure(error: unknown): unknown {
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined
  if (code === 'ABORTED') return error

  const folded = error instanceof Error ? new Error(error.message) : new Error(String(error))
  return Object.assign(folded, { code: 'LLM_FAILED' })
}

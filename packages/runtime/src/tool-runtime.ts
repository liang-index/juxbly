/**
 * `ToolRuntime` — step orchestration (`docs/ARCHITECTURE.md` §6, §9.2; stage 1-7).
 *
 * The engine knows step types and nothing else: it resolves a type through the registry,
 * resolves `input_from` through the variable bag, and calls the capability with both.
 * Adding a capability is a registration, not an edit here — which is what keeps the
 * engine from becoming a switch statement over the whole product.
 *
 * Two decisions live in this file and nowhere else:
 *
 * - **Validation runs before every run**, even though saving already ran it (§5.4). A
 *   stored tool can be hand-edited — this is the open-source build — or written by an
 *   older DSL. The gate is cheap and it is the only one between storage and execution.
 * - **The llm cache decision is a hash comparison over the step's input data**, not over
 *   the page and not over time (§9.2). Unchanged data reuses the last output; only an
 *   explicit `force` spends tokens again. That is the whole cost model of a tool a user
 *   opens every day.
 */
import type {
  ExecutionContext,
  LlmStepOutput,
  RenderResult,
  RunOptions,
  RunOutcome,
  RunState,
  RuntimePorts,
  TokenUsage,
} from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { validateToolDefinition } from '@juxbly/dsl'
import { stableHash } from './hash'
import { VariableBag } from './variable-bag'
import { StepFailure, classifyFailure } from './errors'
import { buildSummary, emptySummary } from './summary'
import type { CapabilityRegistry } from './registry'

export const ZERO_USAGE: TokenUsage = { prompt_tokens: 0, completion_tokens: 0 }

export class ToolRuntime {
  private readonly registry: CapabilityRegistry
  private readonly ports: RuntimePorts

  constructor(registry: CapabilityRegistry, ports: RuntimePorts) {
    this.registry = registry
    this.ports = ports
  }

  async run(tool: ToolDefinition, options: RunOptions): Promise<RunOutcome> {
    const startedAt = Date.now()
    const validated = validateToolDefinition(tool)

    if (!validated.ok) {
      this.ports.log({ tag: 'RUNTIME', message: 'rejected', details: [validated.errors.length] })

      return {
        ok: false,
        outputs: {},
        usage: { ...ZERO_USAGE },
        llmCached: false,
        summary: emptySummary(),
        error: {
          code: 'VALIDATION_FAILED',
          message: 'the tool definition is not valid',
          errors: validated.errors,
        },
      }
    }

    const steps = validated.value.steps
    const bag = new VariableBag()
    const usage: TokenUsage = { ...ZERO_USAGE }
    const llmOutputs: Record<string, unknown> = {}
    const previous = options.runState ?? null

    let index = 0
    let llmCached = false
    let firstLlmHash: string | null = null
    let lastDataName: string | null = null
    let render: RenderResult | undefined

    try {
      for (; index < steps.length; index += 1) {
        const step = steps[index]
        if (step === undefined) break

        throwIfAborted(options.signal, index)

        const capability = this.registry.get(step.type)
        if (capability === undefined) {
          throw new StepFailure(
            'CAPABILITY_UNREGISTERED',
            `no capability is registered for step type "${step.type}"`,
            index,
          )
        }

        // The engine is the only thing that runs a tool *by itself*, and a `copy` export is
        // the one step that must never run by itself: `navigator.clipboard` needs a user
        // gesture, and a tool that auto-runs on page load overwriting the clipboard the
        // user just filled is the worst possible failure of the reuse promise (1-15 AC5).
        // The panel's Copy button does not go through a step at all — it calls the
        // clipboard port directly from the click — so *every* `copy` step that reaches
        // here is unattended, and refusing is the only honest answer. Refusing loudly also
        // beats the alternative: without a gesture the platform call fails anyway, as an
        // unattributed error three layers down. Checked before the input variable is
        // resolved so the refusal names the real cause even when the data is broken too.
        if (step.type === 'export' && step.format === 'copy') {
          throw new StepFailure(
            'CAPABILITY_FAILED',
            'an export step may not use the "copy" format: writing the clipboard needs a user gesture, so a run can never deliver it — the panel Copy button is the only path',
            index,
          )
        }

        const stepStartedAt = Date.now()
        // `extract` is the only step that produces data without consuming any (§5.2).
        const items = step.type === 'extract' ? [] : bag.records(step.input_from)

        if (step.type === 'llm') {
          const hash = stableHash(items)
          firstLlmHash ??= hash

          const cached = cachedOutput(previous, hash, step.output_to, options.force)
          if (cached !== undefined) {
            bag.set(step.output_to, cached.value)
            llmOutputs[step.output_to] = cached.value
            llmCached = true
            this.ports.log({ tag: 'RUNTIME', message: 'step:cached', details: [index, 'llm'] })
            continue
          }
        }

        const output = await capability.execute({ step, items }, this.context(options))
        throwIfAborted(options.signal, index)

        if (step.type === 'llm') {
          const llmOutput = asLlmStepOutput(output)
          addUsage(usage, llmOutput.usage)
          bag.set(step.output_to, llmOutput.output)
          llmOutputs[step.output_to] = llmOutput.output
          // Not the summary's subject: a model's answer is free-form, and "how much data
          // did this run see" is a question about the extracted rows, not about prose.
        } else if (step.type === 'render') {
          render = output as RenderResult
        } else if (step.type !== 'export') {
          // `export` consumes and delivers: it produces no variable (§5.2, 1-15).
          bag.set(step.output_to, output)
          lastDataName = step.output_to
        }

        this.ports.log({
          tag: 'RUNTIME',
          message: 'step',
          details: [index, step.type, Date.now() - stepStartedAt, items.length],
        })
      }
    } catch (error) {
      const failure = classifyFailure(error, index)
      this.ports.log({ tag: 'RUNTIME', message: 'failed', details: [failure.code, index] })

      return {
        ok: false,
        outputs: bag.snapshot(),
        usage,
        llmCached,
        summary: failure.aborted ? emptySummary() : buildSummary(bag, lastDataName),
        error: {
          code: failure.code,
          message: failure.message,
          ...(failure.step === undefined ? {} : { step: failure.step }),
          ...(failure.selector === undefined ? {} : { selector: failure.selector }),
        },
      }
    }

    this.ports.log({
      tag: 'RUNTIME',
      message: 'run',
      details: [steps.length, Date.now() - startedAt, usage.prompt_tokens + usage.completion_tokens, llmCached],
    })

    return {
      ok: true,
      outputs: bag.snapshot(),
      usage,
      llmCached,
      summary: buildSummary(bag, lastDataName),
      ...(render === undefined ? {} : { render }),
      runState: { last_extract_hash: firstLlmHash, last_llm_outputs: llmOutputs },
    }
  }

  private context(options: RunOptions): ExecutionContext {
    return {
      ...(options.tabId === undefined ? {} : { tabId: options.tabId }),
      signal: options.signal,
      ports: this.ports,
    }
  }
}

/**
 * The cache decision (§9.2): same input hash **and** a stored output for this exact
 * variable. Both, because a hash says "the data is unchanged", not "this step has ever
 * run" — a tool edited to add a second llm step must call it the first time.
 */
function cachedOutput(
  state: RunState | null,
  hash: string,
  name: string,
  force: boolean | undefined,
): { value: unknown } | undefined {
  if (force === true || state === null) return undefined
  if (state.last_extract_hash !== hash) return undefined
  if (!Object.prototype.hasOwnProperty.call(state.last_llm_outputs, name)) return undefined

  return { value: state.last_llm_outputs[name] }
}

function throwIfAborted(signal: AbortSignal, index: number): void {
  if (signal.aborted) {
    throw new StepFailure('ABORTED', 'the run was cancelled', index)
  }
}

function addUsage(total: TokenUsage, add: TokenUsage): void {
  total.prompt_tokens += add.prompt_tokens
  total.completion_tokens += add.completion_tokens
}

/**
 * The llm capability answers with its output and what it cost (§5.5). Tolerant on
 * purpose: a capability that returns a bare value is still a usable pipeline, it just
 * cannot account for its tokens — and zero is the honest number for "not reported".
 */
function asLlmStepOutput(value: unknown): LlmStepOutput {
  if (typeof value === 'object' && value !== null && 'output' in value) {
    const candidate = value as { output: unknown; usage?: unknown }
    const usage = candidate.usage

    if (
      typeof usage === 'object' &&
      usage !== null &&
      typeof (usage as TokenUsage).prompt_tokens === 'number' &&
      typeof (usage as TokenUsage).completion_tokens === 'number'
    ) {
      return { output: candidate.output, usage: usage as TokenUsage }
    }

    return { output: candidate.output, usage: { ...ZERO_USAGE } }
  }

  return { output: value, usage: { ...ZERO_USAGE } }
}

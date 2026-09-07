/**
 * The mock `LlmPort` — what stage 1-7 and the integration tests inject.
 *
 * It exists so a pipeline can be exercised without a key, without a network and without
 * a token: "it runs in tests" has to keep being worth something while the extension's
 * only model access is a user-supplied endpoint.
 */
import type { TokenUsage } from '@juxbly/core'
import type { LlmStep } from '@juxbly/dsl'
import type { LlmPort } from './types'

export interface MockLlmStepCall {
  step: LlmStep
  input: unknown
}

export interface MockLlmPortOptions {
  /** Returned for every call unless `handler` overrides it. */
  output?: unknown
  usage?: TokenUsage
  /** Thrown for every call; use it to drive the failure paths of a consumer. */
  error?: unknown
  /** Per-call answer, receives the step and the input the step was given. */
  handler?: (step: LlmStep, input: unknown) => unknown | Promise<unknown>
}

export interface MockLlmPort extends LlmPort {
  /** Every call in order, for "this step ran / it did not" assertions. */
  readonly calls: readonly MockLlmStepCall[]
}

export const ZERO_USAGE: TokenUsage = { prompt_tokens: 0, completion_tokens: 0 }

export function createMockLlmPort(options: MockLlmPortOptions = {}): MockLlmPort {
  const calls: MockLlmStepCall[] = []

  return {
    calls,

    async call(step: LlmStep, input: unknown): Promise<{ output: unknown; usage: TokenUsage }> {
      calls.push({ step, input })

      if (options.error !== undefined) throw options.error

      const output = options.handler === undefined ? (options.output ?? '') : await options.handler(step, input)

      return { output, usage: options.usage ?? ZERO_USAGE }
    },
  }
}

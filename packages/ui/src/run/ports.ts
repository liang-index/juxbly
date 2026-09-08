/**
 * The run panel's way out of the page — `docs/ARCHITECTURE.md` §7.2.
 *
 * Same rule as the build panel's ports: the panel lives in a content script, so it owns
 * no storage and no key. Every read and write goes through these calls, and the mapping
 * from "a message came back" to "what that means" lives here so the session stays a pure
 * machine a node test can drive without messaging.
 *
 * Replies are `unknown` until their `kind` says otherwise; a wrong or missing reply is a
 * failure, never a cast.
 */
import type { BrowserAdapter } from '@juxbly/browser'
import type { OnboardingFlags, RunState, RunSummary } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'

export interface RunMessagingPorts {
  queryTools(url: string): Promise<ToolDefinition[]>
  loadState(toolId: string): Promise<RunState | null>
  loadFlags(): Promise<OnboardingFlags | null>
  /** `runState` is only present when the run produced one — a cancelled run stores nothing. */
  report(input: {
    toolId: string
    summary: RunSummary
    ok: boolean
    runState?: RunState
  }): Promise<void>
  discard(toolId: string): Promise<boolean>
}

export function createRunPorts(adapter: BrowserAdapter): RunMessagingPorts {
  return {
    async queryTools(url: string): Promise<ToolDefinition[]> {
      const reply = await adapter.messaging.send({ kind: 'run:query_tools', url })
      if (reply === null || reply.kind !== 'run:query_tools_result') return []
      return reply.tools
    },

    async loadState(toolId: string): Promise<RunState | null> {
      const reply = await adapter.messaging.send({ kind: 'run:load_state', toolId })
      // No reply means "assume nothing": running everything is the safe answer.
      if (reply === null || reply.kind !== 'run:load_state_result') return null
      return reply.runState
    },

    async loadFlags(): Promise<OnboardingFlags | null> {
      const reply = await adapter.messaging.send({ kind: 'onboarding:get' })
      if (reply === null || reply.kind !== 'onboarding:get_result') return null
      return reply.flags
    },

    async report(input): Promise<void> {
      await adapter.messaging.send({
        kind: 'run:report',
        toolId: input.toolId,
        summary: input.summary,
        ok: input.ok,
        ...(input.runState === undefined ? {} : { runState: input.runState }),
      })
    },

    async discard(toolId: string): Promise<boolean> {
      const reply = await adapter.messaging.send({ kind: 'tool:delete', toolId })
      if (reply === null || reply.kind !== 'tool:delete_result') return false
      return reply.ok
    },
  }
}

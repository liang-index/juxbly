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
import type {
  HealthEvaluation,
  OnboardingFlags,
  RunError,
  RunState,
  RunSummary,
  TokenUsage,
  ToolHealth,
} from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'

/** What a finished run reports — the health inputs the background's evaluation reads. */
export interface RunReportInput {
  toolId: string
  summary: RunSummary
  ok: boolean
  runState?: RunState
  error?: RunError
  extract?: { hitCount: number; fieldPresence: Record<string, number> }
  sample?: unknown[]
}

/** The background's verdict, echoed back so the panel renders the badge without a re-read. */
export interface RunHealthVerdict {
  status: ToolHealth['status']
  changed: boolean
  reason: string
  layers: HealthEvaluation['layers']
}

/**
 * The manual semantic check's outcome ("check once", stage 1-11). `ok: false` means no
 * answer — the panel says so without inventing a verdict, and nothing changed (§10).
 */
export interface RunManualCheck {
  pending: boolean
  ok?: boolean
  verdict?: 'ok' | 'suspicious'
  reason?: string
  usage?: TokenUsage
  error?: string
}

export interface RunMessagingPorts {
  queryTools(url: string): Promise<ToolDefinition[]>
  loadState(toolId: string): Promise<RunState | null>
  loadFlags(): Promise<OnboardingFlags | null>
  /** `runState` is only present when the run produced one — a cancelled run stores nothing. */
  report(input: RunReportInput): Promise<RunHealthVerdict | null>
  /** The manual semantic check. Deliberately bypasses the automatic throttle (§10). */
  checkHealth(input: { fields: string[]; sample: unknown[] }): Promise<RunManualCheck | null>
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

    async report(input: RunReportInput): Promise<RunHealthVerdict | null> {
      const reply = await adapter.messaging.send({
        kind: 'run:report',
        toolId: input.toolId,
        summary: input.summary,
        ok: input.ok,
        ...(input.runState === undefined ? {} : { runState: input.runState }),
        ...(input.error === undefined ? {} : { error: input.error }),
        ...(input.extract === undefined ? {} : { extract: input.extract }),
        ...(input.sample === undefined ? {} : { sample: input.sample }),
      })
      // No reply means "no verdict": the panel renders no badge rather than guessing.
      if (reply === null || reply.kind !== 'run:report_result' || reply.evaluation === undefined) {
        return null
      }
      return reply.evaluation
    },

    async checkHealth({ fields, sample }): Promise<RunManualCheck | null> {
      const reply = await adapter.messaging.send({
        kind: 'health:semantic_check',
        requestId: createCheckRequestId(),
        fields,
        sample,
      })
      if (reply === null || reply.kind !== 'health:semantic_check_result') return null
      return {
        pending: false,
        ok: reply.ok,
        ...(reply.verdict === undefined ? {} : { verdict: reply.verdict }),
        ...(reply.reason === undefined ? {} : { reason: reply.reason }),
        ...(reply.usage === undefined ? {} : { usage: reply.usage }),
        ...(reply.error === undefined ? {} : { error: reply.error }),
      }
    },

    async discard(toolId: string): Promise<boolean> {
      const reply = await adapter.messaging.send({ kind: 'tool:delete', toolId })
      if (reply === null || reply.kind !== 'tool:delete_result') return false
      return reply.ok
    },
  }
}

/** Same discipline as the build panel's ids: echoed back, so a late reply lands right. */
function createCheckRequestId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `health-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

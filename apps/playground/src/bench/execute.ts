/**
 * Execution and health: a validated DSL is run against the snapshot exactly the way the
 * extension runs it — same registry, same engine, same health evaluation (§9.2 / §10).
 *
 * The only thing the benchmark decides here is where the ports come from.
 */
import type {
  DomPort,
  ExtractResult,
  HealthStatus,
  LlmPort,
  RunOutcome,
  RunSummary,
  TokenUsage,
  ToolHealth,
} from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { evaluateHealth, captureFingerprint } from '@juxbly/health'
import { CapabilityRegistry, createRuntimePorts, ToolRuntime } from '@juxbly/runtime'
import { registerBuiltInCapabilities } from '@juxbly/capabilities'

export interface Execution {
  outputs: Record<string, unknown>
  usage: TokenUsage
  summary: RunSummary
  error?: string
  health?: HealthStatus
  itemCount: number
}

/**
 * Health starts from the empty record: a benchmark run is by definition the tool's
 * first run on that page. That is what makes `healthFalsePositiveRate` measurable at
 * all — any non-healthy verdict here was produced with no history to deviate from.
 */
const EMPTY_HEALTH: ToolHealth = {
  status: 'healthy',
  recent_runs: [],
  structure_fingerprint: null,
  last_semantic_check: null,
  consecutive_clean_runs: 0,
}

export async function runTool(tool: ToolDefinition, dom: DomPort, llm: LlmPort): Promise<Execution> {
  const registry = new CapabilityRegistry()
  registerBuiltInCapabilities(registry)
  const ports = createRuntimePorts({ dom, llm })

  const outcome = await new ToolRuntime(registry, ports).run(tool, {
    signal: new AbortController().signal,
  })

  return toExecution(outcome)
}

function toExecution(outcome: RunOutcome): Execution {
  const fingerprintSource = firstExtractLike(outcome.outputs)
  const evaluation = evaluateHealth({
    previous: EMPTY_HEALTH,
    summary: outcome.summary,
    fingerprint: fingerprintSource === null ? null : captureFingerprint(fingerprintSource),
  })

  return {
    outputs: outcome.outputs,
    usage: outcome.usage,
    summary: outcome.summary,
    ...(outcome.error === undefined ? {} : { error: outcome.error.code }),
    health: evaluation.status,
    itemCount: outcome.summary.item_count,
  }
}

/**
 * The extract step's own output, wherever the DSL parked it in the variable bag.
 *
 * Recognised by shape (`hitCount` + `fieldPresence`) rather than by variable name:
 * naming it would couple the benchmark to a convention the DSL does not enforce.
 */
function firstExtractLike(outputs: Record<string, unknown>): Pick<ExtractResult, 'hitCount' | 'fieldPresence'> | null {
  for (const value of Object.values(outputs)) {
    if (typeof value === 'object' && value !== null && 'hitCount' in value && 'fieldPresence' in value) {
      return value as Pick<ExtractResult, 'hitCount' | 'fieldPresence'>
    }
  }
  return null
}

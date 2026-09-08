/**
 * The run session — `docs/ARCHITECTURE.md` §9.2, `docs/UI_SPEC.md` §7.
 *
 * Everything the run panel decides lives here; the component is wiring. The three rules
 * that are easy to lose in a refactor are therefore stated in this file, next to the code
 * that keeps them:
 *
 * 1. **A view switch re-renders local data and nothing else.** No extract, no llm, no
 *    engine call — the cost model of a tool opened every day depends on it (§7.1).
 * 2. **Only the manual refresh forces the model.** `force` is one flag in one place;
 *    nothing else may set it.
 * 3. **A cancelled run reports nothing** (§9.2 edge case). The engine hands back no run
 *    state when it is cut short, and the session does not report either — a half-finished
 *    run must never look like a finished one.
 *
 * The session owns no runtime and no messaging: `run` and the four storage round trips
 * arrive as ports, so this file is drivable from a node test with no DOM and no platform.
 */
import type {
  OnboardingFlags,
  RunError,
  RunOutcome,
  RunState,
  RunSummary,
  TokenUsage,
} from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { capSample } from '@juxbly/health'
import type { RunHealthVerdict, RunManualCheck } from './ports'
import type { ViewName } from '../views'

export type RunPhase = 'loading' | 'ready' | 'empty' | 'error'

export interface RunSessionState {
  phase: RunPhase
  /** Every tool matching this page (§12 allows several). */
  tools: readonly ToolDefinition[]
  activeToolId: string | null
  /** The last data this tool produced — kept when a later run fails, so there is still something to look at. */
  items: readonly Record<string, unknown>[] | null
  view: ViewName
  /** Null when no model call was made: BYOK transparency shows real spend only (§9 rule 4). */
  usage: TokenUsage | null
  runAt: string | null
  error: RunError | null
  /** True when the visible data is the previous run's and the latest one failed. */
  stale: boolean
  /** `OnboardingFlags.first_tool_built`: picks the promise line's full or minimal sentence. */
  firstToolBuilt: boolean
  /** Set once "Don't keep" has been confirmed — the host collapses the panel. */
  discarded: boolean
  /**
   * The background's latest health verdict for the active tool (stage 1-11). Null when
   * nothing has been reported yet — `healthy` renders nothing, so "unknown" and
   * "healthy" look the same on purpose.
   */
  health: RunHealthVerdict | null
  /** The manual semantic check's lifecycle; null until the user asked for one. */
  check: RunManualCheck | null
}

export interface RunStepOptions {
  runState: RunState | null
  /** The only way to spend tokens on purpose (manual refresh). */
  force: boolean
  signal: AbortSignal
}

export interface RunSessionPorts {
  queryTools(url: string): Promise<ToolDefinition[]>
  loadState(toolId: string): Promise<RunState | null>
  loadFlags(): Promise<OnboardingFlags | null>
  report(input: {
    toolId: string
    summary: RunSummary
    ok: boolean
    runState?: RunState
    error?: RunError
    extract?: { hitCount: number; fieldPresence: Record<string, number> }
    sample?: unknown[]
  }): Promise<RunHealthVerdict | null>
  checkHealth(input: { fields: string[]; sample: unknown[] }): Promise<RunManualCheck | null>
  discard(toolId: string): Promise<boolean>
  /**
   * The host's engine call. The session never builds a runtime: which capabilities exist
   * and what the DOM port points at are the content script's business (§4).
   */
  run(tool: ToolDefinition, options: RunStepOptions): Promise<RunOutcome>
  now(): string
}

export interface RunSession {
  state(): RunSessionState
  subscribe(listener: (state: RunSessionState) => void): () => void
  start(url: string): Promise<void>
  selectTool(toolId: string): Promise<void>
  /** Local re-render only — see rule 1 above. */
  setView(view: ViewName): void
  refresh(): Promise<void>
  /** The user's "check once": spends their tokens on purpose, bypasses the throttle (§10). */
  checkNow(): Promise<void>
  cancel(): void
  discard(): Promise<boolean>
}

const INITIAL: RunSessionState = {
  phase: 'loading',
  tools: [],
  activeToolId: null,
  items: null,
  view: 'table',
  usage: null,
  runAt: null,
  error: null,
  stale: false,
  firstToolBuilt: false,
  discarded: false,
  health: null,
  check: null,
}

export function createRunSession(ports: RunSessionPorts): RunSession {
  let state: RunSessionState = { ...INITIAL }
  const listeners = new Set<(state: RunSessionState) => void>()
  const runStates = new Map<string, RunState | null>()
  // The user's view choice survives re-runs and refreshes; it is never written back to
  // the DSL (that would be editing the tool, which is 1-12).
  let viewOverride: ViewName | null = null
  let controller: AbortController | null = null

  const setState = (patch: Partial<RunSessionState>): void => {
    state = { ...state, ...patch }
    for (const listener of listeners) listener(state)
  }

  const activeTool = (): ToolDefinition | null =>
    state.tools.find((tool) => tool.tool_id === state.activeToolId) ?? state.tools[0] ?? null

  const run = async (tool: ToolDefinition, force: boolean): Promise<void> => {
    controller?.abort()
    const signal = new AbortController()
    controller = signal

    // Where an aborted run lands: the previous state when there is one, otherwise the
    // empty guidance — never a blank panel (UI_SPEC §7: blank areas are forbidden).
    const restore: RunPhase = state.phase === 'loading' ? 'empty' : state.phase
    setState({ phase: 'loading', error: null })

    // The cache is per tool and lives in the record, so it is asked for once per tool and
    // kept for the rest of the page — a refresh reuses what the last run handed back.
    if (!runStates.has(tool.tool_id)) {
      runStates.set(tool.tool_id, await ports.loadState(tool.tool_id))
    }

    let outcome: RunOutcome
    try {
      outcome = await ports.run(tool, {
        runState: runStates.get(tool.tool_id) ?? null,
        force,
        signal: signal.signal,
      })
    } catch (error) {
      // A throw means the host failed outside the engine's own error model.
      setState(
        signal.signal.aborted
          ? { phase: restore }
          : { phase: 'error', error: { code: 'LLM_FAILED', message: String(error) } },
      )
      return
    }

    // Rule 3: a cancelled run leaves the previous result on screen and reports nothing.
    if (signal.signal.aborted) {
      setState({ phase: restore })
      return
    }

    if (outcome.ok) {
      const items = resultRecords(tool, outcome)
      if (outcome.runState !== undefined) runStates.set(tool.tool_id, outcome.runState)

      setState({
        phase: items.length === 0 ? 'empty' : 'ready',
        items,
        view: viewOverride ?? defaultView(tool),
        usage: spentTokens(outcome.usage),
        runAt: outcome.summary.at,
        error: null,
        stale: false,
      })

      const health = await ports.report({
        toolId: tool.tool_id,
        summary: outcome.summary,
        ok: true,
        ...(outcome.runState === undefined ? {} : { runState: outcome.runState }),
        ...healthInputs(outcome, items),
      })
      setState({ ...(health === null ? {} : { health }) })
      return
    }

    setState({
      phase: 'error',
      error: outcome.error ?? null,
      // The last good result stays on screen when there is one (§7 error state).
      stale: (state.items?.length ?? 0) > 0,
      usage: spentTokens(outcome.usage),
    })
    const health = await ports.report({
      toolId: tool.tool_id,
      summary: outcome.summary,
      ok: false,
      ...healthInputs(outcome, null),
    })
    setState({ ...(health === null ? {} : { health }) })
  }

  return {
    state: () => state,

    subscribe(listener: (next: RunSessionState) => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },

    async start(url: string): Promise<void> {
      const [tools, flags] = await Promise.all([ports.queryTools(url), ports.loadFlags()])
      if (tools.length === 0) {
        setState({ tools, firstToolBuilt: flags?.first_tool_built === true })
        return
      }
      const first = tools[0]
      setState({
        tools,
        firstToolBuilt: flags?.first_tool_built === true,
        activeToolId: state.activeToolId ?? (first === undefined ? null : first.tool_id),
      })

      const tool = activeTool()
      if (tool !== null) await run(tool, false)
    },

    async selectTool(toolId: string): Promise<void> {
      if (toolId === state.activeToolId) return
      // A different tool, a different suggested view: the override belongs to the old one.
      viewOverride = null
      setState({ activeToolId: toolId, items: null, usage: null, runAt: null, error: null, stale: false })

      const tool = activeTool()
      if (tool !== null) await run(tool, false)
    },

    setView(view: ViewName): void {
      viewOverride = view
      setState({ view })
    },

    async refresh(): Promise<void> {
      const tool = activeTool()
      if (tool === null) return
      await run(tool, true)
    },

    async checkNow(): Promise<void> {
      const tool = activeTool()
      if (tool === null || state.items === null || state.items.length === 0) return

      const fields = extractFieldNames(tool)
      if (fields.length === 0) return

      setState({ check: { pending: true } })
      const result = await ports.checkHealth({
        fields,
        sample: capSample(state.items),
      })
      setState({
        check:
          result === null
            ? // No reply is "no answer": the badge says so rather than inventing a verdict.
              { pending: false, ok: false }
            : result,
      })
    },

    cancel(): void {
      controller?.abort()
    },

    async discard(): Promise<boolean> {
      if (state.activeToolId === null) return false
      const removed = await ports.discard(state.activeToolId)
      if (removed) setState({ discarded: true })
      return removed
    },
  }
}

/**
 * Zero tokens is "no model call was made", and showing "0 tokens" would be noise that
 * looks like a bug. Absent usage means the llm cache hit (or the tool has no llm step).
 */
export function spentTokens(usage: TokenUsage): TokenUsage | null {
  return usage.prompt_tokens + usage.completion_tokens > 0 ? usage : null
}

/**
 * The data the views render: what the `render` step consumed. Falls back to the last
 * variable that holds records, so a tool without a render step still shows something.
 */
export function resultRecords(
  tool: ToolDefinition,
  outcome: RunOutcome,
): readonly Record<string, unknown>[] {
  const render = tool.steps.find((step) => step.type === 'render')
  if (render !== undefined && 'input_from' in render) {
    const rows = asRows(outcome.outputs[(render as { input_from: string }).input_from])
    if (rows !== null) return rows
  }

  for (const step of [...tool.steps].reverse()) {
    if (!('output_to' in step)) continue
    const rows = asRows(outcome.outputs[step.output_to])
    if (rows !== null) return rows
  }

  return []
}

/**
 * `extract` hands on an `ExtractResult` — the rows plus the presence counts health reads —
 * while `transform` and `llm` hand on a plain array. Both are "the rows", and the panel
 * needs the same unwrapping the engine's variable bag does (§5.5).
 */
function asRows(value: unknown): readonly Record<string, unknown>[] | null {
  const rows = Array.isArray(value)
    ? value
    : typeof value === 'object' && value !== null && Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : null

  if (rows === null) return null
  return rows as readonly Record<string, unknown>[]
}

/** The field names the tool's extract step promises — what the semantic layer judges against. */
function extractFieldNames(tool: ToolDefinition): string[] {
  const extract = tool.steps.find((step) => step.type === 'extract')
  if (extract === undefined || !('fields' in extract)) return []
  return Object.keys((extract as { fields: Record<string, string> }).fields)
}

/**
 * The health inputs a run carries to the report (stage 1-11): the engine's error (the
 * execution layer reads its extract codes), the extract's structure statistics
 * (fingerprinted by the background), and a `capSample`d (`SEMANTIC_SAMPLE_SIZE`) set of
 * records for the semantic layer. Everything is optional — a signal the run could not produce (extract
 * never ran, no rows to sample) is simply absent, and the background judges with the rest.
 */
export function healthInputs(
  outcome: RunOutcome,
  items: readonly Record<string, unknown>[] | null,
): { error?: RunError; extract?: { hitCount: number; fieldPresence: Record<string, number> }; sample?: unknown[] } {
  const extract = extractStatsOf(outcome)
  const sample = items === null ? undefined : capSample(items)

  return {
    ...(outcome.error === undefined ? {} : { error: outcome.error }),
    ...(extract === undefined ? {} : { extract }),
    ...(sample === undefined || sample.length === 0 ? {} : { sample }),
  }
}

/** The extract result's statistics, wherever the engine left them in the variable bag. */
function extractStatsOf(
  outcome: RunOutcome,
): { hitCount: number; fieldPresence: Record<string, number> } | undefined {
  for (const value of Object.values(outcome.outputs)) {
    if (typeof value !== 'object' || value === null) continue
    const candidate = value as { hitCount?: unknown; fieldPresence?: unknown }
    if (
      typeof candidate.hitCount === 'number' &&
      typeof candidate.fieldPresence === 'object' &&
      candidate.fieldPresence !== null
    ) {
      return {
        hitCount: candidate.hitCount,
        fieldPresence: candidate.fieldPresence as Record<string, number>,
      }
    }
  }
  return undefined
}

/** §7.1: the default view is the one the build-stage model suggested, stored in `render.view`. */
export function defaultView(tool: ToolDefinition): ViewName {
  const render = tool.steps.find((step) => step.type === 'render')
  if (render !== undefined && 'view' in render) {
    const view = (render as { view?: unknown }).view
    if (view === 'table' || view === 'card' || view === 'text') return view
  }
  return 'table'
}

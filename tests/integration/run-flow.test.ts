// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { DomPort, RunState, RunSummary, TokenUsage } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { registerBuiltInCapabilities } from '@juxbly/capabilities'
import { CapabilityRegistry, ToolRuntime } from '@juxbly/runtime'
import { createRunSession } from '@juxbly/ui'
import type { RunSession, RunSessionPorts } from '@juxbly/ui'
import { SEMANTIC_SAMPLE_SIZE } from '@juxbly/health'
import { createFixtureHost } from '../fixtures/page-host'

/**
 * The shapes the background answers with, read off the ports rather than imported as
 * names: a test that restates a contract in its own words can keep passing after the
 * contract moves.
 */
type RunHealthVerdict = NonNullable<Awaited<ReturnType<RunSessionPorts['report']>>>
type RunManualCheck = NonNullable<Awaited<ReturnType<RunSessionPorts['checkHealth']>>>

/**
 * The run flow — `task/stage-1-10.md` Tests, `docs/ARCHITECTURE.md` §9.2.
 *
 * This test exists for one number: **how many times the model is called**. Everything else
 * in a run is local and free, and a tool that re-asks the model on every page load is a
 * tool the user will turn off. So the harness counts model calls and extract queries across
 * a simulated reload, a view switch and a manual refresh, with the real engine, the real
 * capabilities and the real fixtures in between.
 *
 * The seams under test:
 *
 *   session (`ui`) → `run:query_tools` → engine (`runtime`) → extract / llm / render
 *   (`capabilities`) → `run:report`
 */
const AT = '2026-09-07T00:00:00.000Z'
const USAGE: TokenUsage = { prompt_tokens: 120, completion_tokens: 40 }
const URL = 'https://example.com/shop?q=keyboard'

function tool(
  id: string,
  fields: Record<string, string>,
  view: 'table' | 'card' = 'table',
): ToolDefinition {
  return {
    tool_id: id,
    name: `Tool ${id}`,
    description: 'Reads the results list.',
    category: 'data',
    url_pattern: 'https://example.com/*',
    version: 1,
    created_at: AT,
    updated_at: AT,
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector: '.product',
        fields,
        field_types: Object.fromEntries(Object.keys(fields).map((field) => [field, 'text'])),
        output_to: 'raw_items',
      },
      // Passthrough in the test: what matters is *whether* this step runs, not what the
      // model would have said.
      {
        type: 'llm',
        task: 'custom',
        prompt: 'tidy up',
        input_from: 'raw_items',
        output_to: 'clean_items',
      },
      { type: 'render', view, input_from: 'clean_items' },
    ],
  }
}

function toolWithoutLlm(id: string): ToolDefinition {
  return {
    tool_id: id,
    name: `Tool ${id}`,
    description: 'Reads the titles only.',
    category: 'analyze',
    url_pattern: 'https://example.com/*',
    version: 1,
    created_at: AT,
    updated_at: AT,
    steps: [
      {
        type: 'extract',
        mode: 'list',
        selector: '.product',
        fields: { title: '.title' },
        field_types: { title: 'text' },
        output_to: 'titles',
      },
      { type: 'render', view: 'card', input_from: 'titles' },
    ],
  }
}

interface RunStats {
  readonly llmCalls: number
  readonly queries: number
  readonly reports: readonly {
    toolId: string
    summary: RunSummary
    ok: boolean
    runState?: RunState
  }[]
  readonly ranTools: readonly string[]
}

interface HarnessOptions {
  /** What the background answers to `run:report`. `null` is "no verdict" (§10). */
  verdict?: RunHealthVerdict | null
  /** What `health:semantic_check` answers. `null` is "no reply at all". */
  manualCheck?: RunManualCheck | null
}

/**
 * One page load's worth of wiring. `stored` is the record's `run_state`, shared between
 * harnesses the way `juxbly:tools` would share it between two page loads.
 */
function harness(
  tools: ToolDefinition[],
  stored: { current: RunState | null },
  options: HarnessOptions = {},
): { session: RunSession; stats: RunStats; checks: readonly { fields: string[]; sample: unknown[] }[] } {
  const host = createFixtureHost('list-page.html')
  const mount = host.document.createElement('div')
  host.document.body.append(mount)

  const counters = { llmCalls: 0, queries: 0 }
  const reports: { toolId: string; summary: RunSummary; ok: boolean; runState?: RunState }[] = []
  const checks: { fields: string[]; sample: unknown[] }[] = []
  const ranTools: string[] = []

  const dom: DomPort = {
    query: (selector, scope) => {
      counters.queries += 1
      return host.dom.query(selector, scope)
    },
    // Where the render capability draws: Juxbly's own container, never the host page.
    mountPoint: () => mount,
    scrollToBottom: async () => false,
  }

  const registry = new CapabilityRegistry()
  registerBuiltInCapabilities(registry)

  const runtime = new ToolRuntime(registry, {
    dom,
    llm: {
      call: async (_step, input) => {
        counters.llmCalls += 1
        return { output: input, usage: { ...USAGE } }
      },
    },
    clipboard: { writeText: async () => {} },
    downloads: { download: async () => {} },
    log: () => {},
  })

  const ports: RunSessionPorts = {
    queryTools: async () => tools,
    loadState: async () => stored.current,
    loadFlags: async () => null,
    report: async (input) => {
      reports.push({
        toolId: input.toolId,
        summary: input.summary,
        ok: input.ok,
        ...(input.runState === undefined ? {} : { runState: input.runState }),
        ...(input.error === undefined ? {} : { error: input.error }),
        ...(input.extract === undefined ? {} : { extract: input.extract }),
        ...(input.sample === undefined ? {} : { sample: input.sample }),
      })
      if (input.runState !== undefined) stored.current = input.runState
      return options.verdict ?? null
    },
    checkHealth: async ({ fields, sample }) => {
      checks.push({ fields, sample })
      return options.manualCheck ?? null
    },
    discard: async () => true,
    run: (candidate, options) => {
      ranTools.push(candidate.tool_id)
      return runtime.run(candidate, options)
    },
    now: () => AT,
  }

  return {
    session: createRunSession(ports),
    stats: {
      get llmCalls() {
        return counters.llmCalls
      },
      get queries() {
        return counters.queries
      },
      get reports() {
        return reports
      },
      get ranTools() {
        return ranTools
      },
    },
    checks,
  }
}

describe('the run flow (§9.2)', () => {
  it('wakes up on a matching page and renders what the tool found', async () => {
    const stored = { current: null }
    const { session, stats } = harness([tool('tool_a', { title: '.title', price: '.price' })], stored)

    await session.start(URL)

    expect(session.state().tools).toHaveLength(1)
    expect(session.state().phase).toBe('ready')
    expect(session.state().items).toHaveLength(4)
    expect(session.state().items?.[0]).toMatchObject({ title: 'Wireless keyboard', price: '$49.00' })
    // The default view is the one the build stage suggested (§7.1).
    expect(session.state().view).toBe('table')
    // One real model call, and it is shown — BYOK transparency (§9 rule 4).
    expect(stats.llmCalls).toBe(1)
    expect(session.state().usage).toEqual(USAGE)
    // Reporting is how 1-11 learns anything: the summary plus what to store.
    expect(stats.reports).toHaveLength(1)
    expect(stats.reports[0]?.ok).toBe(true)
    expect(stats.reports[0]?.summary.item_count).toBe(4)
    expect(stats.reports[0]?.runState).not.toBeUndefined()
  })

  it('re-extracts on every page load but calls the model only when the input changed', async () => {
    const stored = { current: null }
    const first = harness([tool('tool_a', { title: '.title', price: '.price' })], stored)
    await first.session.start(URL)
    expect(first.stats.llmCalls).toBe(1)

    // A reload: a fresh session, the same page, and only the stored state carries over.
    const second = harness([tool('tool_a', { title: '.title', price: '.price' })], stored)
    await second.session.start(URL)

    expect(second.stats.queries).toBeGreaterThan(0)
    expect(second.stats.llmCalls).toBe(0)
    expect(second.session.state().items).toHaveLength(4)
    // No model call, so no token line: "0 tokens" would read as a bug.
    expect(second.session.state().usage).toBeNull()
  })

  it('switching views re-renders local data and runs nothing (§7.1)', async () => {
    const stored = { current: null }
    const { session, stats } = harness([tool('tool_a', { title: '.title' })], stored)
    await session.start(URL)

    const queriesAfterRun = stats.queries
    const callsAfterRun = stats.llmCalls

    session.setView('card')
    session.setView('text')

    expect(session.state().view).toBe('text')
    expect(stats.queries).toBe(queriesAfterRun)
    expect(stats.llmCalls).toBe(callsAfterRun)
    expect(stats.reports).toHaveLength(1)
  })

  it('spends tokens only when the user asks: refresh forces the model', async () => {
    const stored = { current: null }
    const { session, stats } = harness([tool('tool_a', { title: '.title' })], stored)
    await session.start(URL)
    expect(stats.llmCalls).toBe(1)

    await session.refresh()

    expect(stats.llmCalls).toBe(2)
    expect(stats.reports).toHaveLength(2)
    expect(session.state().usage).toEqual(USAGE)
  })

  it('switching tools runs the selected definition (§12: several tools, one page)', async () => {
    const stored = { current: null }
    const tools = [tool('tool_a', { title: '.title', price: '.price' }), toolWithoutLlm('tool_b')]
    const { session, stats } = harness(tools, stored)

    await session.start(URL)
    expect(session.state().activeToolId).toBe('tool_a')

    await session.selectTool('tool_b')

    expect(session.state().activeToolId).toBe('tool_b')
    expect(stats.ranTools).toEqual(['tool_a', 'tool_b'])
    // The second tool has no llm step and asks only for the title.
    expect(session.state().items?.[0]).toEqual({ title: 'Wireless keyboard' })
    expect(session.state().view).toBe('card')
    expect(session.state().usage).toBeNull()
  })

  it('reports a failed run without storing anything for the next one', async () => {
    const stored = { current: null }
    const broken: ToolDefinition = {
      ...tool('tool_broken', { title: '.title' }),
      steps: [
        {
          type: 'extract',
          mode: 'list',
          selector: '.product',
          fields: { title: '.title' },
          output_to: 'raw_items',
        },
        { type: 'render', view: 'table', input_from: 'missing_variable' },
      ],
    }
    const { session, stats } = harness([broken], stored)

    await session.start(URL)

    expect(session.state().phase).toBe('error')
    expect(stats.reports).toHaveLength(1)
    // A run that did not finish cannot poison the cache (§9.2).
    expect(stats.reports[0]?.ok).toBe(false)
    expect(stats.reports[0]?.runState).toBeUndefined()
    expect(stored.current).toBeNull()
  })

  it('keeps a page with nothing to show as an empty answer, not an error (§7)', async () => {
    const stored = { current: null }
    const noMatches: ToolDefinition = {
      ...tool('tool_empty', { title: '.title' }),
      steps: [
        {
          type: 'extract',
          mode: 'list',
          selector: '.nothing-here',
          fields: { title: '.title' },
          field_types: { title: 'text' },
          output_to: 'raw_items',
        },
        { type: 'render', view: 'table', input_from: 'raw_items' },
      ],
    }
    const { session } = harness([noMatches], stored)

    await session.start(URL)

    expect(session.state().phase).toBe('empty')
    expect(session.state().items).toHaveLength(0)
    expect(session.state().error).toBeNull()
  })

  it('carries the background health verdict into the panel without hiding the results', async () => {
    const degraded: RunHealthVerdict = {
      status: 'degraded',
      changed: true,
      reason: 'far fewer repeating blocks matched than before',
      layers: { execution: 'ok', result: 'ok', structure: 'drifted', semantic: 'not-run' },
    }
    const { session } = harness(
      [tool('tool_a', { title: '.title' })],
      { current: null },
      { verdict: degraded },
    )

    await session.start(URL)

    // The panel renders the badge from the reply, not from a second read (§7.2)…
    expect(session.state().health).toEqual(degraded)
    // …and a suspicion is not a reason to take away what the tool still found (§7).
    expect(session.state().phase).toBe('ready')
    expect(session.state().items).toHaveLength(4)
  })

  it('a manual check sends the field names and a capped sample, and reports no answer when none comes', async () => {
    const { session, checks } = harness([tool('tool_a', { title: '.title' })], { current: null })
    await session.start(URL)

    await session.checkNow()

    expect(checks).toHaveLength(1)
    expect(checks[0]?.fields).toEqual(['title'])
    // Page data leaves for the model only through the cap (§10: too little to leak).
    expect(checks[0]?.sample.length).toBeLessThanOrEqual(SEMANTIC_SAMPLE_SIZE)
    // No reply is "no answer", never an invented verdict — and no status moved.
    expect(session.state().check).toEqual({ pending: false, ok: false })
  })
})

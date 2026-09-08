// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { LlmHttpResponse } from '@juxbly/llm'
import type { LlmFetch } from '@juxbly/llm'
import { createMockAdapter } from '@juxbly/browser'
import { analyzePage } from '@juxbly/analyzer'
import { candidateFingerprint, evaluateCandidates } from '@juxbly/capabilities'
import { handleBuildPropose } from '@juxbly/llm'
import { handleBuildSaveTool, FIRST_VERSION } from '@juxbly/storage'
import { loadTool, saveSettings } from '@juxbly/storage'
import type { BrowserAdapter } from '@juxbly/browser'
import type { ToolDefinition } from '@juxbly/dsl'
import { createBuildSession } from '@juxbly/ui'
import type { BuildSessionPorts, ProposeRequest, ProposeReply } from '@juxbly/ui'
import { createFixtureHost } from '../fixtures/page-host'

/**
 * The build flow, end to end — `task/stage-1-9.md` Tests.
 *
 * This is the test that answers "can the user get a tool": one sentence in, a stored tool
 * out, with the real prompt builder, the real parser, the real scorer and the real storage
 * gateway in between. Only two things are faked — the network call and the clock — so the
 * seams where a stage hands over to the next one are the ones under test:
 *
 *   panel (`ui`) → `build:propose` (`llm`) → candidates → scorer (`capabilities`)
 *   → highlight → `build:save_tool` (`storage`)
 *
 * `packages/ui` is imported here even though its DOM half is tested under jsdom separately:
 * the session is the state machine, and it is a node-shaped object.
 */

const AT = '2026-09-07T00:00:00.000Z'

/** The candidate a well-behaved model returns for `list-page.html`. */
const CANDIDATE = {
  tool_id: 'tool_8f3a2b',
  name: 'Shop results',
  description: 'Collect the product name and price from this results page.',
  category: 'data',
  url_pattern: 'https://example.com/*',
  version: 1,
  steps: [
    {
      type: 'extract',
      mode: 'list',
      selector: '.product',
      fields: { title: '.title', price: '.price' },
      field_types: { title: 'text', price: 'text' },
      output_to: 'raw_items',
    },
    { type: 'render', view: 'table', input_from: 'raw_items' },
  ],
}

/** A model that answers in one scripted reply, and records what it was asked. */
function scriptedModel(replies: unknown[]): { fetchImpl: LlmFetch; seen: string[] } {
  const seen: string[] = []
  let call = 0

  const fetchImpl: LlmFetch = async (_url, init) => {
    seen.push(typeof init.body === 'string' ? init.body : '')
    const reply = replies[Math.min(call, replies.length - 1)]
    call += 1

    const body = JSON.stringify({
      choices: [{ message: { content: JSON.stringify(reply) } }],
      usage: { prompt_tokens: 120, completion_tokens: 40 },
    })

    const response: LlmHttpResponse = {
      ok: true,
      status: 200,
      text: async () => body,
    }
    return response
  }

  return { fetchImpl, seen }
}

async function configuredAdapter(): Promise<BrowserAdapter> {
  const adapter = createMockAdapter()
  await saveSettings(adapter, {
    api_key: 'sk-test',
    model: 'gpt-test',
    api_base_url: 'https://api.example.com/v1',
    floating_ball_enabled: true,
  })
  return adapter
}

function portsFor(
  adapter: BrowserAdapter,
  fetchImpl: LlmFetch,
): BuildSessionPorts & { screenshots: number } {
  const host = createFixtureHost('list-page.html')
  let requestId = 0
  const screenshots = { count: 0 }

  const scorer = {
    score: (candidates: readonly ToolDefinition[]) => evaluateCandidates(candidates, host.dom),
    fingerprint: candidateFingerprint,
  }

  const ports: BuildSessionPorts = {
    analyze: () => analyzePage(host.document),
    scorer,
    captureScreenshot: async () => {
      screenshots.count += 1
      return 'data:image/png;base64,AAAA'
    },
    propose: async (request: ProposeRequest): Promise<ProposeReply> => {
      requestId += 1
      const result = await handleBuildPropose(
        {
          kind: 'build:propose',
          requestId: `req_${String(requestId)}`,
          conversation: [...request.conversation],
          pageAnalysis: request.pageAnalysis,
          conservative: request.conservative,
          noMoreQuestions: request.noMoreQuestions,
          ...(request.screenshot === undefined ? {} : { screenshot: request.screenshot }),
        },
        adapter,
        { fetchImpl },
      )

      if (!result.ok) return { kind: 'failed', error: result.error ?? 'UNKNOWN' }
      const usage = result.usage
      if (result.reply !== undefined) {
        return { kind: 'clarify', content: result.reply.content, ...(usage ? { usage } : {}) }
      }
      return { kind: 'candidates', candidates: result.candidates ?? [], ...(usage ? { usage } : {}) }
    },
    save: (tool: ToolDefinition) =>
      handleBuildSaveTool({ kind: 'build:save_tool', tool }, adapter).then((result) => ({
        ok: result.ok,
        ...(result.error === undefined ? {} : { error: result.error }),
      })),
    now: () => AT,
  }

  return Object.assign(ports, {
    get screenshots(): number {
      return screenshots.count
    },
  })
}

describe('the build flow (§9.1)', () => {
  it('turns one sentence into a saved tool: propose → score → highlight → save', async () => {
    const adapter = await configuredAdapter()
    const { fetchImpl, seen } = scriptedModel([{ candidates: [CANDIDATE] }])
    const ports = portsFor(adapter, fetchImpl)
    const session = createBuildSession(ports)

    await session.describe('Collect the product names and prices')

    // A proposal the user can check: it was scored against the page, not just parsed.
    expect(session.state().phase).toBe('awaiting-confirm')
    const proposal = session.state().proposal
    expect(proposal?.fields.map((field) => field.field)).toEqual(['title', 'price'])
    expect(proposal?.fields.map((field) => field.selector)).toEqual(['.title', '.price'])
    expect(proposal?.containerSelector).toBe('.product')
    // Four rows on the fixture, four matches: the page confirmed the plan.
    expect(proposal?.evaluation?.hitCount).toBe(4)
    expect(proposal?.evaluation?.fieldFillRate).toBe(1)

    // No screenshot on a page the DOM route reads fine (§9.1 level ②).
    expect(ports.screenshots).toBe(0)
    // BYOK transparency: the cost of the call that produced this (UI_SPEC §9 rule 4).
    expect(session.state().usage).toEqual({ prompt_tokens: 120, completion_tokens: 40 })

    await session.confirm()
    expect(session.state().phase).toBe('saved')

    const record = await loadTool(adapter, 'tool_8f3a2b')
    expect(record).not.toBeNull()
    // Version 1, whatever the model claimed, and the history starts with it (§8.1).
    expect(record?.definition.version).toBe(FIRST_VERSION)
    expect(record?.versions.map((entry) => entry.version)).toEqual([1])
    expect(record?.definition.steps[0]).toMatchObject({ selector: '.product' })

    // The model was asked once. What it saw of the page is a wrapped data section — the
    // indirect prompt injection defence (§6 rule 5) — and it carries the analyzer's own
    // field hints, which is why the candidate could name them at all.
    expect(seen).toHaveLength(1)
    expect(seen[0]).toContain('<page_data>')
    expect(seen[0]).toContain('h2.title')
    expect(seen[0]).toContain('span.price')
  })

  it('asks at most two questions, then produces a draft', async () => {
    const adapter = await configuredAdapter()
    const { fetchImpl } = scriptedModel([
      { clarification: 'Which price — the discounted one?' },
      { clarification: 'Which currency?' },
      { candidates: [CANDIDATE] },
    ])
    const session = createBuildSession(portsFor(adapter, fetchImpl))

    await session.describe('Collect the list')
    expect(session.state().phase).toBe('clarifying')

    await session.describe('The discounted one')
    expect(session.state().phase).toBe('clarifying')
    expect(session.state().conversation.filter((m) => m.isClarification === true)).toHaveLength(2)

    // Third answer: the model is told to stop asking, and a third question would be dropped.
    await session.describe('USD')
    expect(session.state().conversation.filter((m) => m.isClarification === true)).toHaveLength(2)
    expect(session.state().phase).toBe('awaiting-confirm')
  })

  it('refuses to store an invalid draft at the storage gate (§5.4)', async () => {
    const adapter = await configuredAdapter()

    // A candidate with no extract step: valid JSON, meaningless tool.
    const result = await handleBuildSaveTool(
      {
        kind: 'build:save_tool',
        tool: { ...(CANDIDATE as unknown as ToolDefinition), steps: [] },
      },
      adapter,
    )

    expect(result.ok).toBe(false)
    expect(result.error).not.toBeUndefined()
    expect(await loadTool(adapter, 'tool_8f3a2b')).toBeNull()
  })

  it('reports a model that cannot be reached, without inventing a tool', async () => {
    const adapter = await configuredAdapter()
    const { fetchImpl } = scriptedModel([{}]) // an empty object: no candidates, no question
    const session = createBuildSession(portsFor(adapter, fetchImpl))

    await session.describe('Collect the list')

    expect(session.state().phase).toBe('failed')
    expect(session.state().error).toBe('EMPTY_REPLY')
    expect(session.state().proposal).toBeNull()
  })
})

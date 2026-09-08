import { describe, expect, it } from 'vitest'
import type {
  BuildAdvice,
  BuildPhase,
  BuildSession,
  CandidateScorer,
  EscalationLevel,
  ProposeReply,
  ProposeRequest,
} from '@juxbly/ui'
import { createBuildSession } from '@juxbly/ui'
import type { PageAnalysis, TokenUsage } from '@juxbly/core'
import type { ToolDefinition, ToolStep } from '@juxbly/dsl'

/**
 * `docs/ARCHITECTURE.md` §9.1 — the build flow and the A4 escalation chain.
 *
 * Every port is scripted, so each test below is a claim about the *order and shape* of
 * the chain, not about a model: the clarification cap is a hard stop, a retry only
 * happens once and only when it is actually a different plan, the screenshot is sent
 * only for a page the DOM route cannot read, and the chain always ends in something the
 * user can do.
 */

const AT = '2026-09-07T00:00:00.000Z'
const USAGE: TokenUsage = { prompt_tokens: 120, completion_tokens: 40 }

function candidate(id: string, selector = '.items li'): ToolDefinition {
  const steps: ToolStep[] = [
    { type: 'extract', mode: 'list', selector, fields: { title: '.title' }, output_to: 'items' },
    { type: 'render', view: 'table', input_from: 'items' },
  ]
  return {
    tool_id: id,
    name: `Candidate ${id}`,
    category: 'data',
    url_pattern: 'example.com/*',
    version: 1,
    steps,
    created_at: AT,
    updated_at: AT,
  }
}

function analysis(hostile = false): PageAnalysis {
  return {
    url: 'https://shop.example/search',
    title: 'Shop',
    visibleText: 'products',
    containers: hostile
      ? []
      : [
          {
            tagPath: 'div>ul>li',
            hitCount: 10,
            sampleFields: ['title'],
            fieldHints: [{ selector: '.title', sampleText: 'A' }],
          },
        ],
    customElements: [],
    shadowHosts: [],
    scrollHint: 'none',
    truncated: false,
    analyzedAt: AT,
  }
}

interface Scripted {
  analysis?: PageAnalysis
  replies: ProposeReply[]
  /** tool_id → dry-run hit count. Absent means "matched nothing". */
  hits?: Record<string, number>
  screenshot?: string
  saveOk?: boolean
}

function scripted(options: Scripted): {
  session: BuildSession
  proposes: ProposeRequest[]
  screenshotCalls: number[]
  saved: ToolDefinition[]
} {
  const proposes: ProposeRequest[] = []
  const screenshotCalls: number[] = []
  const saved: ToolDefinition[] = []
  const replies = [...options.replies]

  const scorer: CandidateScorer = {
    score: (candidates) =>
      candidates.map((candidate, index) => {
        const hitCount = options.hits?.[candidate.tool_id] ?? 0
        return {
          candidateIndex: index,
          hitCount,
          fieldFillRate: 1,
          shapeScore: 1,
          // Hits move the score, the way the real scorer's hit signal does: a test where
          // every match scored the same could not tell ranking from ordering.
          score: Math.min(1, hitCount / 10),
        }
      }),
    // The plan, not the prose: same container means "not a new idea".
    fingerprint: (candidate) => {
      const step = candidate.steps.find((step) => step.type === 'extract')
      return step?.type === 'extract' ? `${step.mode}|${step.selector ?? ''}` : 'other'
    },
  }

  const session = createBuildSession({
    analyze: () => options.analysis ?? analysis(),
    propose: async (request) => {
      proposes.push(request)
      return replies.shift() ?? { kind: 'failed', error: 'SCRIPT_END' }
    },
    scorer,
    captureScreenshot: async () => {
      screenshotCalls.push(1)
      return options.screenshot ?? 'data:image/png;base64,AAA'
    },
    save: async (tool) => {
      saved.push(tool)
      return { ok: options.saveOk ?? true }
    },
    now: () => AT,
  })

  return { session, proposes, screenshotCalls, saved }
}

describe('proposal path', () => {
  it('scores the candidates and stops at the confirmation gate', async () => {
    const good = candidate('tool_good', '.items li')
    const { session, proposes } = scripted({
      replies: [{ kind: 'candidates', candidates: [candidate('tool_zero', '.nope'), good], usage: USAGE }],
      hits: { tool_good: 7 },
    })

    await session.describe('Collect the list')

    expect(session.state().phase).toBe('awaiting-confirm')
    expect(session.state().proposal?.tool.tool_id).toBe('tool_good')
    expect(session.state().proposal?.evaluation?.hitCount).toBe(7)
    expect(session.state().usage).toEqual(USAGE)
    expect(proposes).toHaveLength(1)
    expect(proposes[0]?.conservative).toBe(false)
    expect(proposes[0]?.noMoreQuestions).toBe(false)
  })

  it('drops an invalid candidate and ranks the rest by the page, not by order', async () => {
    // The A2 shape: one candidate the validator rejects, two that hit the page a
    // different number of times. The user sees the one the page confirmed best.
    const broken = { ...candidate('tool_broken'), steps: [] } as unknown as ToolDefinition
    const { session } = scripted({
      replies: [
        {
          kind: 'candidates',
          candidates: [broken, candidate('tool_few', '.items li'), candidate('tool_many', '.items li')],
        },
      ],
      hits: { tool_few: 2, tool_many: 9 },
    })

    await session.describe('Collect the list')

    expect(session.state().phase).toBe('awaiting-confirm')
    expect(session.state().proposal?.tool.tool_id).toBe('tool_many')
    expect(session.state().proposal?.evaluation?.hitCount).toBe(9)
    // The rejected candidate was never even scored: it cannot be a plan.
    expect(session.state().proposal?.tool.steps.length).toBeGreaterThan(0)
  })
})

describe('clarification cap', () => {
  it('appends the question and waits for the user', async () => {
    const { session, proposes } = scripted({ replies: [{ kind: 'clarify', content: 'Which price?' }] })

    await session.describe('Collect the list')

    expect(session.state().phase).toBe('clarifying')
    const conversation = session.state().conversation
    expect(conversation).toHaveLength(2)
    expect(conversation[1]?.isClarification).toBe(true)
    expect(proposes[0]?.noMoreQuestions).toBe(false)
  })

  it('tells the model to stop asking once the cap is reached, and drops a third question', async () => {
    const { session, proposes } = scripted({
      replies: [
        { kind: 'clarify', content: 'Which price?' },
        { kind: 'clarify', content: 'Which currency?' },
        { kind: 'clarify', content: 'One more question?' },
      ],
    })

    await session.describe('Collect the list')
    await session.describe('The discounted one')
    const afterTwo = session.state().conversation.length

    await session.describe('USD')
    // The third *user* turn still lands: it is the answer to the second question, and
    // sending it is the whole point of telling the model to stop asking. What the cap
    // drops is the assistant's third question — asserted on the next line.
    expect(session.state().conversation).toHaveLength(afterTwo + 1)
    expect(
      session.state().conversation.filter((message) => message.isClarification === true),
    ).toHaveLength(2)
    expect(session.state().phase).toBe('failed')
    expect(session.state().advice.length).toBeGreaterThan(0)
    expect(proposes[2]?.noMoreQuestions).toBe(true)
  })
})

describe('escalation chain (A4)', () => {
  it('retries once with a conservative prompt when nothing matched', async () => {
    const zero = candidate('tool_zero', '.nope')
    const good = candidate('tool_good', '.items li')
    const { session, proposes } = scripted({
      replies: [
        { kind: 'candidates', candidates: [zero] },
        { kind: 'candidates', candidates: [good] },
      ],
      hits: { tool_good: 4 },
    })

    await session.describe('Collect the list')

    expect(proposes).toHaveLength(2)
    expect(proposes[1]?.conservative).toBe(true)
    expect(session.state().retryUsed).toBe(true)
    // The retry happened inside one async turn, so the panel has to remember it: a level
    // that flashed by was never seen (§9.1: no silent retries).
    expect(session.state().escalationTrail).toEqual(['retry'])
    expect(session.state().phase).toBe('awaiting-confirm')
  })

  it('does not spend the retry on a plan the chain has already judged', async () => {
    const same = candidate('tool_same', '.items li')
    const { session, proposes, screenshotCalls } = scripted({
      // Both batches carry the same plan; the page is friendly to the DOM route.
      replies: [
        { kind: 'candidates', candidates: [same] },
        { kind: 'candidates', candidates: [{ ...same, tool_id: 'tool_same2' }] },
      ],
    })

    await session.describe('Collect the list')

    expect(proposes).toHaveLength(2)
    expect(session.state().retryUsed).toBe(false)
    // Not hostile → the visual fallback is skipped and the chain reaches level ③.
    expect(screenshotCalls).toHaveLength(0)
    expect(session.state().escalation).toBe('stronger-model')
    // ① fired and was refunded, ③ is where the chain stopped: both on the record.
    expect(session.state().escalationTrail).toEqual(['retry', 'stronger-model'])
    expect(session.state().phase).toBe('failed')
  })

  it('attaches a screenshot only for a page hostile to the DOM route', async () => {
    const zero = candidate('tool_zero', '.nope')
    const good = candidate('tool_good', '.items li')
    const { session, proposes, screenshotCalls } = scripted({
      analysis: analysis(true),
      replies: [
        { kind: 'candidates', candidates: [zero] },
        { kind: 'candidates', candidates: [{ ...zero, tool_id: 'tool_zero2' }] },
        { kind: 'candidates', candidates: [good] },
      ],
      hits: { tool_good: 4 },
    })

    await session.describe('Collect the list')

    expect(screenshotCalls).toHaveLength(1)
    expect(session.state().visionUsed).toBe(true)
    // proposes: [0] the first read, [1] the conservative retry, [2] the visual attempt.
    // Levels run in the documented order (§9.1), so the screenshot rides on the third.
    expect(typeof proposes[2]?.screenshot).toBe('string')
    expect(session.state().phase).toBe('awaiting-confirm')
  })

  it('skips the visual fallback for a page the DOM route can read', async () => {
    const zero = candidate('tool_zero', '.nope')
    const { session, screenshotCalls } = scripted({
      replies: [{ kind: 'candidates', candidates: [zero] }],
    })

    await session.describe('Collect the list')

    expect(screenshotCalls).toHaveLength(0)
    expect(session.state().visionUsed).toBe(false)
    expect(session.state().escalation).toBe('stronger-model')
  })

  it('level ③ retries once when the user takes it, then never again', async () => {
    const zero = candidate('tool_zero', '.nope')
    const good = candidate('tool_good', '.items li')
    const { session, proposes } = scripted({
      replies: [
        { kind: 'candidates', candidates: [zero] },
        { kind: 'candidates', candidates: [{ ...zero, tool_id: 'tool_zero2' }] },
        { kind: 'candidates', candidates: [good] },
      ],
      hits: { tool_good: 4 },
    })

    await session.describe('Collect the list')
    expect(session.state().escalation).toBe('stronger-model')
    expect(session.state().phase).toBe('failed')

    await session.retryWithStrongerModel()
    expect(proposes).toHaveLength(3)
    expect(session.state().strongerModelUsed).toBe(true)
    expect(session.state().phase).toBe('awaiting-confirm')

    // Level ③ is once per session: a second accept cannot restart the chain.
    await session.retryWithStrongerModel()
    expect(proposes).toHaveLength(3)
  })

  it('level ④ stops with advice after the stronger-model retry also fails', async () => {
    const zero = candidate('tool_zero', '.nope')
    const { session, proposes } = scripted({
      replies: [
        { kind: 'candidates', candidates: [zero] },
        { kind: 'candidates', candidates: [{ ...zero, tool_id: 'tool_zero2' }] },
        { kind: 'candidates', candidates: [{ ...zero, tool_id: 'tool_zero3' }] },
        { kind: 'candidates', candidates: [{ ...zero, tool_id: 'tool_zero4' }] },
      ],
    })

    await session.describe('Collect the list')
    await session.retryWithStrongerModel()

    expect(session.state().phase).toBe('failed')
    expect(session.state().escalation).toBe('stopped')
    const advice: readonly BuildAdvice[] = session.state().advice
    expect(advice).toEqual(['narrow-scope', 'rephrase', 'page-complex'])
    expect(proposes.length).toBeLessThanOrEqual(4 + 1)
  })

  it('stops with the error when the retry cannot even reach the model', async () => {
    const { session } = scripted({
      replies: [
        { kind: 'failed', error: 'NOT_CONFIGURED' },
        { kind: 'failed', error: 'NOT_CONFIGURED' },
      ],
    })

    await session.describe('Collect the list')

    expect(session.state().phase).toBe('failed')
    expect(session.state().error).toBe('NOT_CONFIGURED')
    expect(session.state().escalation).toBe('stopped')
  })
})

describe('confirmation and correction', () => {
  it('saves the proposed tool and reports the outcome', async () => {
    const good = candidate('tool_good', '.items li')
    const { session, saved } = scripted({
      replies: [{ kind: 'candidates', candidates: [good] }],
      hits: { tool_good: 4 },
    })

    await session.describe('Collect the list')
    await session.confirm()

    expect(session.state().phase).toBe('saved')
    expect(saved).toHaveLength(1)
    expect(saved[0]?.tool_id).toBe('tool_good')
  })

  it('keeps the proposal and names the failure when saving fails', async () => {
    const good = candidate('tool_good', '.items li')
    const { session } = scripted({
      replies: [{ kind: 'candidates', candidates: [good] }],
      hits: { tool_good: 4 },
      saveOk: false,
    })

    await session.describe('Collect the list')
    await session.confirm()

    expect(session.state().phase).toBe('failed')
    expect(session.state().proposal).not.toBeNull()
    expect(session.state().error).not.toBeNull()
  })

  it('re-points one field and replays the highlight', async () => {
    const good = candidate('tool_good', '.items li')
    const { session } = scripted({
      replies: [{ kind: 'candidates', candidates: [good] }],
      hits: { tool_good: 4 },
    })

    await session.describe('Collect the list')
    const tokenBefore = session.state().highlightToken

    session.startPick('title')
    expect(session.state().phase).toBe('picking')

    session.commitPick('title', 'h3 > a')
    expect(session.state().phase).toBe('awaiting-confirm')
    expect(session.state().highlightToken).toBe(tokenBefore + 1)
    expect(session.state().proposal?.fields.find((field) => field.field === 'title')?.selector).toBe(
      'h3 > a',
    )

    session.cancelPick()
    expect(session.state().phase).toBe('awaiting-confirm')
  })

  it('ignores an empty description instead of spending a model call', async () => {
    const { session, proposes } = scripted({ replies: [] })

    await session.describe('   ')

    expect(proposes).toHaveLength(0)
    expect(session.state().phase).toBe('idle')
  })
})

describe('carrying the best candidate across levels (§9.1 level ①)', () => {
  it('carries the best candidate the chain has seen, not the one from the last level', async () => {
    const zero = candidate('tool_zero', '.nope')
    const good = candidate('tool_good', '.items li')
    const worse = candidate('tool_worse', '.items li')
    const { session, proposes } = scripted({
      replies: [
        { kind: 'candidates', candidates: [zero] },
        { kind: 'candidates', candidates: [good] },
        { kind: 'candidates', candidates: [worse] },
      ],
      hits: { tool_good: 4, tool_worse: 1 },
    })

    await session.describe('Collect the list')

    // The third reply is never spent: the chain stops at the first level that matched, so
    // a later level cannot downgrade a proposal that was already verified on the page.
    // That is "carry the best across levels" — the mdn net-loss case cannot recur.
    expect(proposes).toHaveLength(2)
    expect(session.state().proposal?.tool.tool_id).toBe('tool_good')
    expect(session.state().phase).toBe('awaiting-confirm')
  })

  it('shows every level it passes through — no silent escalation', async () => {
    const zero = candidate('tool_zero', '.nope')
    const good = candidate('tool_good', '.items li')
    const { session } = scripted({
      analysis: analysis(true),
      replies: [
        { kind: 'candidates', candidates: [zero] },
        { kind: 'candidates', candidates: [{ ...zero, tool_id: 'tool_zero2' }] },
        { kind: 'candidates', candidates: [good] },
      ],
      hits: { tool_good: 4 },
    })

    const levels: EscalationLevel[] = []
    const phases: BuildPhase[] = []
    session.subscribe((state) => {
      if (levels[levels.length - 1] !== state.escalation) levels.push(state.escalation)
      if (phases[phases.length - 1] !== state.phase) phases.push(state.phase)
    })

    await session.describe('Collect the list')

    expect(levels).toEqual(['none', 'retry', 'vision', 'none'])
    expect(phases).toContain('proposing')
    expect(phases).toContain('awaiting-confirm')
  })
})

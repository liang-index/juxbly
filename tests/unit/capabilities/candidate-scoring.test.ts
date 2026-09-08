// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import {
  candidateFingerprint,
  evaluateCandidates,
  HIT_SATURATION,
  pickBestCandidate,
  SCORE_WEIGHTS,
} from '@juxbly/capabilities'
import type { ToolDefinition, ToolStep } from '@juxbly/dsl'
import { createFixtureHost } from '../../fixtures/page-host'

/**
 * `docs/ARCHITECTURE.md` §5.6 — the model proposes, the page decides.
 *
 * The assertions that matter are not "the numbers look nice": they are that a dry run is
 * a **local** act (no model, no scrolling, no side effects), that a candidate which cannot
 * even run is eliminated rather than scored zero, and that hit count outranks field
 * prettiness — a candidate that matches nothing must lose to one that matches something.
 */

const AT = '2026-09-07T00:00:00.000Z'

function tool(id: string, steps: ToolStep[], overrides: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    tool_id: id,
    name: `Candidate ${id}`,
    category: 'data',
    url_pattern: 'example.com/*',
    version: 1,
    steps: [...steps],
    created_at: AT,
    updated_at: AT,
    ...overrides,
  }
}

function extractStep(overrides: Record<string, unknown> = {}): ToolStep {
  return {
    type: 'extract',
    mode: 'list',
    selector: '.results li.product',
    fields: { title: '.title', price: '.price' },
    output_to: 'items',
    ...overrides,
  } as ToolStep
}

function renderStep(): ToolStep {
  return { type: 'render', view: 'table', input_from: 'items' }
}

describe('evaluateCandidates', () => {
  it('is a synchronous, side-effect-free dry run: no model call, no scrolling', async () => {
    const host = createFixtureHost('list-page.html')
    const candidates = [tool('tool_a', [extractStep({ pre_scroll: { mode: 'to_bottom', max: 3 } }), renderStep()])]

    // A2 is local by contract (§5.6): if the scorer ever reached for the network, this
    // spy is what turns that into a failing test rather than a slow one.
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    const first = evaluateCandidates(candidates, host.dom)
    // Sync by construction: a promise here would mean the dry run awaits something, and
    // the only thing it could be awaiting is the network.
    expect(first).not.toBeInstanceOf(Promise)
    await Promise.resolve()

    expect(Array.isArray(first)).toBe(true)
    expect(host.scrolls).toBe(0)
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(evaluateCandidates(candidates, host.dom)).toEqual(first)

    vi.unstubAllGlobals()
  })

  it('eliminates a candidate whose selector cannot run, keeps one that matched nothing', () => {
    const host = createFixtureHost('list-page.html')
    const evaluations = evaluateCandidates(
      [
        tool('tool_broken', [extractStep({ selector: '###' }), renderStep()]),
        tool('tool_empty', [extractStep({ selector: '.does-not-exist' }), renderStep()]),
        tool('tool_good', [extractStep(), renderStep()]),
      ],
      host.dom,
    )

    // "Threw" and "matched nothing" are different answers (§5.2): only the first is
    // dropped from the ranking entirely.
    expect(evaluations.map((evaluation) => evaluation.candidateIndex)).toEqual([1, 2])
    expect(evaluations[0]?.hitCount).toBe(0)
    expect(evaluations[1]?.hitCount).toBe(4)
  })

  it('ranks a matching candidate above a prettier one that matches nothing', () => {
    const host = createFixtureHost('list-page.html')
    const evaluations = evaluateCandidates(
      [
        tool('tool_empty', [extractStep({ selector: '.does-not-exist', fields: { title: '.title' } })]),
        tool('tool_good', [extractStep()]),
      ],
      host.dom,
    )
    const best = pickBestCandidate(evaluations)

    expect(best?.candidateIndex).toBe(1)
  })

  it('prefers fuller fields when the containers are equal', () => {
    const host = createFixtureHost('list-page.html')
    const evaluations = evaluateCandidates(
      [
        tool('tool_partial', [extractStep({ fields: { title: '.title', missing: '.nope' } })]),
        tool('tool_full', [extractStep()]),
      ],
      host.dom,
    )
    const best = pickBestCandidate(evaluations)

    expect(best?.candidateIndex).toBe(1)
    expect(best?.fieldFillRate).toBe(1)
  })

  it('saturates hit counts so a huge page cannot outrank correctness', () => {
    const host = createFixtureHost('list-page.html')
    const evaluation = evaluateCandidates([tool('tool_good', [extractStep()])], host.dom)[0]

    // 4 hits on a 30-hit saturation scale is honest scarcity, not a rounding error.
    expect(evaluation?.hitCount).toBe(4)
    expect(evaluation?.score).toBeGreaterThan(0)
    expect(evaluation?.score).toBeLessThan(
      SCORE_WEIGHTS.hitCount + SCORE_WEIGHTS.fieldFillRate + SCORE_WEIGHTS.shapeScore,
    )
    expect(HIT_SATURATION).toBeGreaterThan(0)
  })
})

describe('pickBestCandidate', () => {
  it('breaks ties towards the earlier candidate — the order the model returned is its preference', () => {
    const same = { candidateIndex: 0, hitCount: 3, fieldFillRate: 1, shapeScore: 1, score: 0.8 }

    // Position only breaks ties: a strictly better score wins wherever it sits.
    expect(pickBestCandidate([same, { ...same, candidateIndex: 1 }])?.candidateIndex).toBe(0)
    expect(pickBestCandidate([same, { ...same, candidateIndex: 1, score: 0.9 }])?.candidateIndex).toBe(1)
    expect(pickBestCandidate([])).toBeNull()
  })
})

describe('candidateFingerprint', () => {
  it('is the plan, not the prose: renaming a tool does not change it, changing the container does', () => {
    const host = createFixtureHost('list-page.html')
    const a = tool('tool_a', [extractStep()])
    const renamed = tool('tool_renamed', [extractStep()], { name: 'Something else entirely' })
    const different = tool('tool_b', [extractStep({ selector: '.results li' })])

    expect(candidateFingerprint(a)).toBe(candidateFingerprint(renamed))
    expect(candidateFingerprint(a)).not.toBe(candidateFingerprint(different))

    // The fingerprint is a pure function of the definition; the fixture host exists only
    // to keep this describe block's imports honest.
    expect(host.document).toBeTruthy()
  })
})

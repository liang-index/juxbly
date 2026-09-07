// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { CapabilityError, runExtract } from '@juxbly/capabilities'
import type { ExtractStep } from '@juxbly/dsl'
import { validateToolDefinition } from '@juxbly/dsl'
import { createFixtureHost } from '../../../fixtures/page-host'

/**
 * A1 `pre_scroll`. The scrolling itself belongs to the host (`DomPort.scrollToBottom`);
 * what is tested here is the policy around it: how many rounds, when to stop, and that a
 * cancelled run stops immediately.
 */
function step(preScroll: ExtractStep['pre_scroll']): ExtractStep {
  return {
    type: 'extract',
    mode: 'list',
    selector: '#feed li.post',
    fields: { title: '.title' },
    ...(preScroll === undefined ? {} : { pre_scroll: preScroll }),
    output_to: 'posts',
  }
}

describe('pre_scroll: to_bottom', () => {
  it('collects the rows that only exist after scrolling', async () => {
    const host = createFixtureHost('lazy-list.html')

    const result = await runExtract(
      { step: step({ mode: 'to_bottom', max: 3, settle_ms: 0 }), items: [] },
      host.dom,
    )

    expect(result.hitCount).toBe(12)
    expect(result.items).toHaveLength(12)
  })

  it('is the difference between a tool that works and a tool that is useless', async () => {
    // Without it the same page yields 4 of 12 — a persistent tool that silently reports a
    // third of the truth is worse than one that fails loudly.
    const host = createFixtureHost('lazy-list.html')

    const result = await runExtract({ step: step(undefined), items: [] }, host.dom)

    expect(result.hitCount).toBe(4)
  })

  it('stops as soon as the page stops growing', async () => {
    const host = createFixtureHost('lazy-list.html')

    await runExtract({ step: step({ mode: 'to_bottom', max: 10, settle_ms: 0 }), items: [] }, host.dom)

    // Two deferred pages and one round that reports no growth.
    expect(host.scrolls).toBe(3)
  })

  it('defaults to three rounds', async () => {
    const host = createFixtureHost('list-page.html', { scroll: () => true })

    await runExtract({ step: step({ mode: 'to_bottom', settle_ms: 0 }), items: [] }, host.dom)

    expect(host.scrolls).toBe(3)
  })

  it('caps the rounds at ten even when the step asks for more', async () => {
    // The DSL validator rejects `max > 10` first (see below); this is the second point on
    // the same fence, for a step object built in TypeScript.
    const host = createFixtureHost('list-page.html', { scroll: () => true })

    await runExtract({ step: step({ mode: 'to_bottom', max: 9_999, settle_ms: 0 }), items: [] }, host.dom)

    expect(host.scrolls).toBe(10)
  })

  it('stops scrolling the moment the run is cancelled', async () => {
    const controller = new AbortController()
    const host = createFixtureHost('list-page.html', {
      scroll: () => {
        controller.abort()
        return true
      },
    })

    try {
      await runExtract({ step: step({ mode: 'to_bottom', max: 5, settle_ms: 0 }), items: [] }, host.dom, controller.signal)
      expect.unreachable('a cancelled run must not complete')
    } catch (error) {
      expect((error as CapabilityError).code).toBe('ABORTED')
    }

    expect(host.scrolls).toBe(1)
  })

  it('does not start scrolling at all when the run is already cancelled', async () => {
    const controller = new AbortController()
    controller.abort()
    const host = createFixtureHost('lazy-list.html')

    await expect(
      runExtract({ step: step({ mode: 'to_bottom', max: 3 }), items: [] }, host.dom, controller.signal),
    ).rejects.toThrow(CapabilityError)

    expect(host.scrolls).toBe(0)
  })
})

describe('pre_scroll: the DSL fence', () => {
  it('rejects a max above 10 before the tool is ever saved', () => {
    const result = validateToolDefinition({
      tool_id: 'tool_pre_scroll',
      name: 'Feed',
      category: 'data',
      url_pattern: 'example.com/*',
      version: 1,
      created_at: '2026-09-06T00:00:00.000Z',
      updated_at: '2026-09-06T00:00:00.000Z',
      steps: [
        {
          type: 'extract',
          mode: 'list',
          selector: '#feed li.post',
          fields: { title: '.title' },
          pre_scroll: { mode: 'to_bottom', max: 11 },
          output_to: 'posts',
        },
      ],
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors[0]?.code).toBe('PRE_SCROLL_MAX_RANGE')
  })
})

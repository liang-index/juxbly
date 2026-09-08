// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import type { RunOutcome, RunSummary } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { t } from '../copy'
import { EmptyState } from './empty-state'
import { ErrorState } from './error-state'
import { RunPanel } from './RunPanel'
import { TokenUsage } from './token-usage'

/**
 * The three states a run can end in — `task/stage-1-10.md` AC 5 / AC 6,
 * `docs/UI_SPEC.md` §7.
 *
 * The distinction under test is the one users feel and implementations blur: **0 rows is
 * an answer, a failed run is not**. So the empty assertion is not "the empty copy shows" —
 * it is "the empty copy shows and nothing about it is styled as a failure".
 *
 * Loading is asserted through the real panel rather than as a component: it is a phase of
 * the session, not a piece of markup, and only the panel can prove that a run that has
 * not answered yet leaves the panel in the restrained state §7 asks for.
 */
const AT = '2026-09-07T00:00:00.000Z'
const ZERO = { prompt_tokens: 0, completion_tokens: 0 }

let container: HTMLElement
let root: Root | undefined

beforeEach(() => {
  // React 19 only flushes effects and state updates inside `act` when this flag is set.
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.append(container)
})

afterEach(() => {
  act(() => {
    root?.unmount()
  })
  root = undefined
  container.remove()
})

function render(node: ReactNode): HTMLElement {
  act(() => {
    root = createRoot(container)
    root.render(node)
  })
  return container
}

async function renderAsync(node: ReactNode): Promise<HTMLElement> {
  await act(async () => {
    root = createRoot(container)
    root.render(node)
  })
  return container
}

function click(element: Element): void {
  act(() => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function tool(): ToolDefinition {
  return {
    tool_id: 'tool_a',
    name: 'Deals under $50',
    description: 'Reads the results list.',
    category: 'data',
    url_pattern: 'https://example.com/*',
    version: 1,
    created_at: AT,
    updated_at: AT,
    steps: [{ type: 'render', view: 'table', input_from: 'raw_items' }],
  }
}

function summary(itemCount: number): RunSummary {
  return { at: AT, had_data: itemCount > 0, item_count: itemCount, field_digest: {} }
}

function outcome(items: readonly Record<string, unknown>[]): RunOutcome {
  return {
    ok: true,
    outputs: { raw_items: items },
    usage: ZERO,
    llmCached: false,
    summary: summary(items.length),
  }
}

/** The panel's way out is the adapter, so the replies it needs are mocked, not the session. */
function adapterFor(tools: ToolDefinition[]): ReturnType<typeof createMockAdapter> {
  return createMockAdapter({
    onSend: (message) => {
      if (message.kind === 'run:query_tools') return { kind: 'run:query_tools_result', tools }
      if (message.kind === 'onboarding:get') return { kind: 'onboarding:get_result', flags: null }
      if (message.kind === 'run:load_state') {
        return { kind: 'run:load_state_result', toolId: message.toolId, runState: null }
      }
      return null
    },
  })
}

describe('empty is an answer, not a failure (§7)', () => {
  it('shows guidance in a plain state — never the error styling', () => {
    const node = render(<EmptyState />)

    expect(node.textContent).toContain(t('run.empty'))
    expect(node.querySelector('.jx-run-state--error')).toBeNull()
    expect(node.querySelector('.jx-run-state')?.className).not.toContain('error')
  })

  it('is what a run with 0 rows lands on', async () => {
    const node = await renderAsync(
      <RunPanel adapter={adapterFor([tool()])} url="https://example.com/shop" run={async () => outcome([])} />,
    )

    expect(node.querySelector('.jx-run-panel')?.getAttribute('data-phase')).toBe('empty')
    expect(node.textContent).toContain(t('run.empty'))
    expect(node.querySelector('.jx-run-state--error')).toBeNull()
  })
})

describe('error keeps the last result and offers a next step (§9 rule 2)', () => {
  it('names the model failure and points at the fix', () => {
    const node = render(
      <ErrorState error={{ code: 'LLM_FAILED', message: '401' }} onRefresh={vi.fn()} />,
    )

    expect(node.textContent).toContain(t('run.error_llm'))
    expect(node.textContent).toContain(t('run.error_next'))
  })

  it('says where a rejected definition broke (§5.4 field-level reasons)', () => {
    const node = render(
      <ErrorState
        error={{
          code: 'VALIDATION_FAILED',
          message: 'invalid',
          errors: [{ path: 'steps[0].selector', code: 'UNKNOWN_FIELD', message: 'selector is empty' }],
        }}
        onRefresh={vi.fn()}
      />,
    )

    expect(node.textContent).toContain(t('run.error_validation'))
    expect(node.textContent).toContain('selector is empty')
  })

  it('falls back to the honest generic line when the engine gave no code', () => {
    const node = render(<ErrorState error={null} onRefresh={vi.fn()} />)

    expect(node.textContent).toContain(t('run.error'))
    expect(node.textContent).not.toContain(t('run.error_llm'))
  })

  it('reaches the refresh entry from the error state', () => {
    const onRefresh = vi.fn()
    const node = render(<ErrorState error={{ code: 'LLM_FAILED', message: 'x' }} onRefresh={onRefresh} />)

    const refresh = [...node.querySelectorAll('button')].find(
      (button) => button.textContent === t('run.error_next'),
    )
    if (refresh === undefined) throw new Error('no refresh control')
    click(refresh)

    expect(onRefresh).toHaveBeenCalledTimes(1)
  })
})

describe('token spend (§9 rule 4, BYOK)', () => {
  it('shows the two numbers when the model was called', () => {
    const node = render(<TokenUsage usage={{ prompt_tokens: 1200, completion_tokens: 300 }} />)

    expect(node.textContent).toBe('1,200 in / 300 out tokens')
  })

  it('shows nothing at all when it cost nothing', () => {
    const node = render(<TokenUsage usage={null} />)

    expect(node.innerHTML).toBe('')
  })
})

describe('the shell (AC 7)', () => {
  it('collapses on the close control and on Esc, without clearing the session', async () => {
    const onClose = vi.fn()
    const node = await renderAsync(
      <RunPanel
        adapter={adapterFor([tool()])}
        url="https://example.com/shop"
        run={() => new Promise<RunOutcome>(() => undefined)}
        onClose={onClose}
      />,
    )

    const close = node.querySelector('.jx-close')
    if (close === null) throw new Error('no collapse control')
    click(close)
    expect(onClose).toHaveBeenCalledTimes(1)

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onClose).toHaveBeenCalledTimes(2)
    // Esc collapses, it does not clear: the panel is still there with its last result (§8).
    expect(node.querySelector('.jx-run-panel')).not.toBeNull()
  })

  it('starts where it belongs — drag position is never remembered', async () => {
    const adapter = adapterFor([tool()])
    const node = await renderAsync(
      <RunPanel
        adapter={adapter}
        url="https://example.com/shop"
        run={() => new Promise<RunOutcome>(() => undefined)}
      />,
    )

    // No transform until the user drags, and nothing is written about where the panel is
    // (position memory is explicitly deferred, §14).
    expect(node.querySelector('.jx-run-panel')?.getAttribute('style')).toBeNull()
    expect(adapter.calls.filter((call) => call.method === 'storage.set')).toHaveLength(0)
  })
})

describe('loading is restrained (§7)', () => {
  it('says it is running without promising an analysis', async () => {
    const node = await renderAsync(
      <RunPanel
        adapter={adapterFor([tool()])}
        url="https://example.com/shop"
        // A run that never answers: the panel must sit in loading, not in empty or error.
        run={() => new Promise<RunOutcome>(() => undefined)}
      />,
    )

    expect(node.querySelector('.jx-run-panel')?.getAttribute('data-phase')).toBe('loading')
    expect(node.textContent).toContain(t('run.loading'))
    expect(node.querySelector('.jx-run-state--error')).toBeNull()
  })
})

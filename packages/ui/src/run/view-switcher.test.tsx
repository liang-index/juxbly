// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import type { RunOutcome, RunSummary } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { t } from '../copy'
import { RunPanel } from './RunPanel'
import { ViewSwitcher } from './view-switcher'

/**
 * View switching — `task/stage-1-10.md` AC 3, `docs/UI_SPEC.md` §7.1.
 *
 * The contract is not "the three buttons exist": it is that switching **costs nothing**.
 * A saved tool is opened on every visit, so a switch that re-runs extract or re-asks the
 * model turns a free gesture into a paid one. That is why the assertion counts the
 * adapter's port calls and the engine calls across a switch and expects both to stand
 * still — the same numbers the integration test counts, but measured through the real
 * component so a future refactor cannot move the cost into the wiring.
 *
 * The user's choice is also session-local: it is never written back to the DSL, because
 * that would be editing the tool (1-12), and the adapter assertions below are what proves
 * no write happens.
 */
const AT = '2026-09-07T00:00:00.000Z'
const ITEMS = [{ title: 'Wireless keyboard' }, { title: 'USB-C hub' }]

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

function outcome(): RunOutcome {
  const summary: RunSummary = {
    at: AT,
    had_data: true,
    item_count: ITEMS.length,
    field_digest: { title: 'text' },
  }
  return { ok: true, outputs: { raw_items: ITEMS }, usage: { prompt_tokens: 0, completion_tokens: 0 }, llmCached: false, summary }
}

describe('the switcher itself (§7.1)', () => {
  it('offers the three V1 views and marks the active one', () => {
    const node = render(<ViewSwitcher view="table" onChange={vi.fn()} />)
    const tabs = [...node.querySelectorAll('button')]

    expect(tabs.map((tab) => tab.textContent)).toEqual([
      t('run.view.table'),
      t('run.view.card'),
      t('run.view.text'),
    ])
    expect(tabs.map((tab) => tab.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
  })

  it('reports the chosen view and nothing else', () => {
    const onChange = vi.fn()
    const node = render(<ViewSwitcher view="table" onChange={onChange} />)

    const card = [...node.querySelectorAll('button')].find(
      (button) => button.textContent === t('run.view.card'),
    )
    if (card === undefined) throw new Error('no card tab')
    click(card)

    expect(onChange).toHaveBeenCalledExactlyOnceWith('card')
  })
})

describe('switching re-renders and does not re-run (AC 3)', () => {
  it('leaves the engine and every port call untouched', async () => {
    const adapter = adapterFor([tool()])
    const run = vi.fn(async () => outcome())
    const node = await renderAsync(
      <RunPanel adapter={adapter} url="https://example.com/shop" run={run} />,
    )

    const card = [...node.querySelectorAll('.jx-run-views button')].find(
      (button) => button.textContent === t('run.view.card'),
    )
    if (card === undefined) throw new Error('the switcher did not render')

    const callsBefore = adapter.calls.length
    const runsBefore = run.mock.calls.length
    click(card)
    await act(async () => undefined)

    expect(card.getAttribute('aria-pressed')).toBe('true')
    expect(run.mock.calls.length).toBe(runsBefore)
    // No `tool:delete`, no `run:report`, no storage write of the user's choice.
    expect(adapter.calls.length).toBe(callsBefore)
  })
})

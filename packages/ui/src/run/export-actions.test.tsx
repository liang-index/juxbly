// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import type { RunOutcome } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { t } from '../copy'
import { RunPanel } from './RunPanel'

/**
 * The run panel's export entry — `docs/UI_SPEC.md` §7.3 ③, `task/stage-1-15.md` UI/AC.
 *
 * Three assertions that pin the behaviour down: the three actions are **resident** (never
 * folded into a menu), a copy that succeeds shows a light success line and counts one
 * usage message, and a refused download shows the error line instead of pretending success.
 */
const AT = '2026-09-07T00:00:00.000Z'
const ZERO = { prompt_tokens: 0, completion_tokens: 0 }

let container: HTMLElement
let root: Root | undefined

beforeEach(() => {
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

async function render(node: ReactNode): Promise<HTMLElement> {
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
    name: 'Prices',
    description: 'Reads prices.',
    category: 'data',
    url_pattern: 'https://example.com/*',
    version: 1,
    created_at: AT,
    updated_at: AT,
    steps: [{ type: 'render', view: 'table', input_from: 'raw_items' }],
  }
}

function outcome(items: readonly Record<string, unknown>[]): RunOutcome {
  return {
    ok: true,
    outputs: { raw_items: items },
    usage: ZERO,
    llmCached: false,
    summary: { at: AT, had_data: items.length > 0, item_count: items.length, field_digest: {} },
  }
}

function adapterFor(overrides: { downloadsFail?: boolean } = {}): ReturnType<typeof createMockAdapter> {
  const adapter = createMockAdapter({
    onSend: (message) => {
      if (message.kind === 'run:query_tools') return { kind: 'run:query_tools_result', tools: [tool()] }
      if (message.kind === 'onboarding:get') return { kind: 'onboarding:get_result', flags: null }
      if (message.kind === 'run:load_state') {
        return { kind: 'run:load_state_result', toolId: message.toolId, runState: null }
      }
      return null
    },
  })
  if (overrides.downloadsFail === true) {
    adapter.downloads = {
      download: () => Promise.reject(new Error('downloads blocked')),
    }
  }
  return adapter
}

const ROWS = [{ title: 'Apple', price: '1' }]

describe('export actions in the ③ action area (§7.3)', () => {
  it('shows Copy, CSV and JSON as resident buttons when there is result data', async () => {
    const node = await render(
      <RunPanel adapter={adapterFor()} url="https://example.com/shop" run={async () => outcome(ROWS)} />,
    )

    const buttons = [...node.querySelectorAll('.jx-run-export-buttons button')].map(
      (button) => button.textContent,
    )
    // Resident in ③, never folded into a menu.
    expect(buttons).toContain(t('run.export.copy'))
    expect(buttons).toContain(t('run.export.csv'))
    expect(buttons).toContain(t('run.export.json'))
  })

  it('records exactly one usage hop on a successful copy', async () => {
    const adapter = adapterFor()
    const node = await render(
      <RunPanel adapter={adapter} url="https://example.com/shop" run={async () => outcome(ROWS)} />,
    )

    const copy = [...node.querySelectorAll('button')].find(
      (button) => button.textContent === t('run.export.copy'),
    )
    if (copy === undefined) throw new Error('no copy action')
    click(copy)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const usageMessages = adapter.calls.filter(
      (call) =>
        call.method === 'messaging.send' &&
        (call.args[0] as { kind?: string })?.kind === 'export:record_usage',
    )
    expect(usageMessages).toHaveLength(1)
    // The download manager is never reached for a copy; only the clipboard is.
    expect(adapter.calls.filter((call) => call.method === 'downloads.download')).toHaveLength(0)
  })

  it('shows a light success line on copy', async () => {
    const node = await render(
      <RunPanel adapter={adapterFor()} url="https://example.com/shop" run={async () => outcome(ROWS)} />,
    )
    const copy = [...node.querySelectorAll('button')].find(
      (button) => button.textContent === t('run.export.copy'),
    )
    if (copy === undefined) throw new Error('no copy action')
    click(copy)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const feedback = [...node.querySelectorAll('.jx-run-export-feedback')].map(
      (node) => node.textContent,
    )
    expect(feedback).toContain(t('run.export.copied'))
  })

  it('shows the error line and records no usage when a download is refused', async () => {
    const adapter = adapterFor({ downloadsFail: true })
    const node = await render(
      <RunPanel adapter={adapter} url="https://example.com/shop" run={async () => outcome(ROWS)} />,
    )

    const csv = [...node.querySelectorAll('button')].find(
      (button) => button.textContent === t('run.export.csv'),
    )
    if (csv === undefined) throw new Error('no csv action')
    click(csv)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    const feedback = [...node.querySelectorAll('.jx-run-export-feedback')].map(
      (node) => node.textContent,
    )
    expect(feedback).toContain(t('run.export.failed'))
    // A refused export must not count as a use.
    const usageMessages = adapter.calls.filter(
      (call) =>
        call.method === 'messaging.send' &&
        (call.args[0] as { kind?: string })?.kind === 'export:record_usage',
    )
    expect(usageMessages).toHaveLength(0)
  })
})
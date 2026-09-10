// @vitest-environment jsdom
import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMockAdapter } from '@juxbly/browser'
import type { RunOutcome } from '@juxbly/core'
import type { ToolDefinition } from '@juxbly/dsl'
import { createRunCommands, ENTRY_IDS } from '../commands/slash-commands'
import { RunPanel } from './RunPanel'

/**
 * Command equivalence, asserted against the real panel — `task/stage-1-16.md` AC 3.
 *
 * The registry tests (`tests/unit/ui/commands.test.ts`) assert that every command
 * *names* a clickable entry. This one asserts the panel actually **renders** every id
 * those commands name — the half a typo would break, and the half that turns "no
 * command-only behaviour" from a comment into a checked fact.
 *
 * One wrinkle the test has to honour honestly: the version list lives in the config
 * tab, so its entry exists once the tab is open — which is exactly how a person reaches
 * it, and exactly what `/versions` does.
 */
const AT = '2026-09-09T00:00:00.000Z'
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

async function renderAsync(node: ReactNode): Promise<HTMLElement> {
  await act(async () => {
    root = createRoot(container)
    root.render(node)
  })
  return container
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

function tool(): ToolDefinition {
  return {
    tool_id: 'tool_a',
    name: 'Deals',
    category: 'data',
    url_pattern: 'https://example.com/*',
    version: 1,
    created_at: AT,
    updated_at: AT,
    steps: [{ type: 'render', view: 'table', input_from: 'raw_items' }],
  }
}

function adapterFor(): ReturnType<typeof createMockAdapter> {
  return createMockAdapter({
    onSend: (message) => {
      if (message.kind === 'run:query_tools') {
        return { kind: 'run:query_tools_result', tools: [tool()] }
      }
      if (message.kind === 'onboarding:get') {
        return { kind: 'onboarding:get_result', flags: null }
      }
      if (message.kind === 'run:load_state') {
        return { kind: 'run:load_state_result', toolId: message.toolId, runState: null }
      }
      if (message.kind === 'tool:get') {
        return { kind: 'tool:get_result', version: 1, versions: [] }
      }
      return null
    },
  })
}

async function panel(): Promise<HTMLElement> {
  const outcome: RunOutcome = {
    ok: true,
    outputs: { raw_items: [{ title: 'a' }] },
    usage: ZERO,
    llmCached: false,
    summary: { at: AT, had_data: true, item_count: 1, field_digest: {} },
  }

  return renderAsync(
    <RunPanel
      adapter={adapterFor()}
      url="https://example.com/x"
      run={vi.fn().mockResolvedValue(outcome)}
    />,
  )
}

describe('every command has its clickable entry on screen (AC 3)', () => {
  it('renders the ids the commands name, once the config tab is open', async () => {
    const node = await panel()
    const commands = createRunCommands({
      openConfig: () => {},
      openInspect: () => {},
      showVersions: () => {},
    })

    await click(node.querySelector(`[data-entry="${ENTRY_IDS.config}"]`) as Element)

    const rendered = new Set(
      [...node.querySelectorAll('[data-entry]')].map((element) =>
        element.getAttribute('data-entry'),
      ),
    )
    for (const command of commands.all()) {
      expect(rendered.has(command.via)).toBe(true)
    }
  })

  it('syncs the tab state when a command chip is used — one source of truth, not two', async () => {
    const node = await panel()

    await click(node.querySelector(`[data-entry="${ENTRY_IDS.config}"]`) as Element)

    // The chips call the same registry a typed command would, so clicking `/inspect`
    // and typing `/inspect` must land on the same pane.
    const chip = [...node.querySelectorAll('.jx-cmd')].find(
      (element) => element.textContent === '/inspect',
    )
    await click(chip as Element)

    expect(node.querySelector('.jx-inspect-tab')).not.toBeNull()
    expect(node.querySelector('.jx-run-pane')?.getAttribute('hidden')).toBe('')
  })

  it('expands the version list from the entry the /versions command names', async () => {
    const node = await panel()

    await click(node.querySelector(`[data-entry="${ENTRY_IDS.config}"]`) as Element)
    expect(node.querySelector('.jx-versions')).toBeNull()

    await click(node.querySelector(`[data-entry="${ENTRY_IDS.versions}"]`) as Element)

    expect(node.querySelector('.jx-config-versions')).not.toBeNull()
  })
})
